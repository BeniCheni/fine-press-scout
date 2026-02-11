import { scrapeSubterranean } from '../lib/scrapers/subterranean'; // ../src/lib/scrapers/subterranean
import { embedBatch } from '../lib/embeddings';
import { qdrantClient, initCollection } from '../lib/qdrant';
import type { Chunk } from '@/types';
import crypto from 'crypto';

/**
 * Convert a stable string ID to a deterministic unsigned integer acceptable by Qdrant.
 * We take the first 6 bytes (48 bits) of a SHA-256 digest which fits safely inside
 * JavaScript's integer precision (<= 2^48-1) and is stable across runs.
 */
function idToUint(id: string): number {
  const hash = crypto.createHash('sha256').update(id).digest();
  // use first 6 bytes -> 48 bits
  return hash.readUIntBE(0, 6);
}

async function main() {
  console.log('Starting Fine Press Scout data ingestion pipeline\n');

  console.log('Step 1: Initialize Qdrant collection');
  await initCollection();

  console.log('\nStep 2: Scrape Subterranean Press');
  const documents = await scrapeSubterranean();

  if (documents.length === 0) {
    console.log('No documents scraped. Exiting.');
    return;
  }

  console.log(`\nStep 3: Create chunks (1 chunk per document for MVP)`);
  const chunks: Omit<Chunk, 'embedding'>[] = documents.map((doc, index) => ({
    id: `${doc.id}-chunk-${index}`,
    text: doc.rawText,
    payload: {
      bookId: doc.id,
      title: doc.title,
      author: doc.author,
      publisher: doc.publisher,
      price: doc.price ?? null,
      editionType: doc.editionType ?? null,
      availability: doc.availability ?? null,
      genreTags: doc.genreTags ?? [],
      url: doc.url,
      chunkIndex: 0,
    },
  }));

  console.log(`Created ${chunks.length} chunks`);

  console.log('\nStep 4: Embed all chunks');
  const texts = chunks.map((chunk) => chunk.text);
  const embeddings = await embedBatch(texts);

  console.log('\nStep 5: Upsert to Qdrant');
  const points = chunks.map((chunk, i) => ({
    id: idToUint(chunk.id),
    vector: embeddings[i],
    payload: {
      ...chunk.payload,
      chunkId: chunk.id,
    },
  }));

  await qdrantClient.upsert('fine_press_books', {
    wait: true,
    points,
  });

  console.log(
    `\n✅ Successfully ingested ${documents.length} books and ${chunks.length} chunks to Qdrant`
  );
  console.log('\nVerify at: http://localhost:6333/dashboard');
}

main().catch((error) => {
  console.error('\n❌ Ingestion failed:', error);
  process.exit(1);
});
