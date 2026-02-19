import { QdrantClient } from '@qdrant/js-client-rest';
import * as fs from 'fs';
import * as path from 'path';
import { CleanedBook } from '../types';
import { getEmbedding } from './embed';

const COLLECTION = 'books';
// MiniLM produces 384-dimensional vectors.
const VECTOR_SIZE = 384;

function getQdrant(): QdrantClient {
  const url = process.env.QDRANT_URL ?? 'http://localhost:6333';
  return new QdrantClient({ url });
}

/**
 * Ensure the Qdrant collection exists with the correct schema.
 * Creates it if missing; no-ops if it already exists.
 */
export async function ensureCollection(client: QdrantClient): Promise<void> {
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION);
  if (exists) {
    console.log(`Collection "${COLLECTION}" already exists.`);
    return;
  }

  await client.createCollection(COLLECTION, {
    vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
  });

  // Create payload indexes for efficient filtering
  await Promise.all([
    client.createPayloadIndex(COLLECTION, { field_name: 'price', field_schema: 'float' }),
    client.createPayloadIndex(COLLECTION, { field_name: 'edition', field_schema: 'keyword' }),
    client.createPayloadIndex(COLLECTION, { field_name: 'availability', field_schema: 'keyword' }),
    client.createPayloadIndex(COLLECTION, { field_name: 'publisher', field_schema: 'keyword' }),
  ]);
  console.log(`Collection "${COLLECTION}" created.`);
}

/**
 * Embed every book and upsert into Qdrant.
 * Call from app/scripts/ingest.ts.
 */
export async function ingestBooks(books: CleanedBook[]): Promise<void> {
  const client = getQdrant();
  await ensureCollection(client);

  console.log(`\nIngesting ${books.length} books into Qdrant…`);

  // Batch in groups of 50 to stay within Qdrant's gRPC payload limit
  const BATCH = 50;
  for (let i = 0; i < books.length; i += BATCH) {
    const batch = books.slice(i, i + BATCH);
    const points = await Promise.all(
      batch.map(async (book, j) => {
        const idx = i + j;
        console.log(`  [${idx + 1}/${books.length}] Embedding: ${book.title} — ${book.publisher}`);
        const vector = await getEmbedding(book.description);
        return {
          id: idx + 1,           // Qdrant requires positive integer or UUID ids
          vector,
          payload: {
            title: book.title,
            author: book.author,
            price: book.price,
            availability: book.availability,
            edition: book.edition,
            description: book.description,
            url: book.url,
            imageUrl: book.imageUrl,
            publisher: book.publisher,
            reviews: book.reviews,
            scrapedAt: book.scrapedAt instanceof Date
              ? book.scrapedAt.toISOString()
              : book.scrapedAt,
          },
        };
      })
    );

    await client.upsert(COLLECTION, { wait: true, points });
    console.log(`  ✓ Batch ${Math.floor(i / BATCH) + 1} upserted (${points.length} points)`);
  }

  console.log(`\n✓ Ingestion complete. ${books.length} books in Qdrant collection "${COLLECTION}".`);
}

/**
 * Convenience function: read books.json from disk and ingest.
 */
export async function ingestFromFile(filePath?: string): Promise<void> {
  const src = filePath ?? path.join(process.cwd(), 'public', 'data', 'books.json');
  if (!fs.existsSync(src)) {
    throw new Error(`books.json not found at ${src}. Run "npm run scrape" first.`);
  }
  const raw = fs.readFileSync(src, 'utf-8');
  const books = JSON.parse(raw) as CleanedBook[];
  await ingestBooks(books);
}
