import { QdrantClient } from '@qdrant/js-client-rest';
import { validateEnv } from '@/types';

const env = validateEnv();

export const qdrantClient = new QdrantClient({
  url: env.QDRANT_URL,
  // TODO: Add authentication to Qdrant later, include apiKey here
});

export const COLLECTION_NAME = 'fine_press_books';
export const VECTOR_SIZE = 384; // all-MiniLM-L6-v2 dimension

/**
 * Initialize the Qdrant collection with proper vector configuration.
 * Idempotent: safe to call multiple times, only creates if missing.
 */
export async function initCollection(): Promise<void> {
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === COLLECTION_NAME
    );

    if (exists) {
      console.log(`✓ Collection "${COLLECTION_NAME}" already exists`);
      return;
    }

    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
      // Optimize for search speed with HNSW index
      hnsw_config: {
        m: 16,
        ef_construct: 100,
      },
    });

    console.log(`✓ Created collection "${COLLECTION_NAME}"`);

    // Create payload indexes for filtering (publisher, price, editionType, availability)
    // These enable fast metadata filtering at query time
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'publisher',
      field_schema: 'keyword',
    });

    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'editionType',
      field_schema: 'keyword',
    });

    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'availability',
      field_schema: 'keyword',
    });

    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'price',
      field_schema: 'float',
    });

    console.log(`✓ Created payload indexes for filtering`);
  } catch (error) {
    console.error('Failed to initialize Qdrant collection:', error);
    throw error;
  }
}

/**
 * Upsert chunks to Qdrant with retry logic for transient failures.
 */
export async function upsertChunks(
  chunks: Array<{
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }>
): Promise<void> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await qdrantClient.upsert(COLLECTION_NAME, {
        wait: true, // Wait for write to be committed
        points: chunks,
      });
      console.log(`✓ Upserted ${chunks.length} chunks to Qdrant`);
      return;
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error('Failed to upsert chunks after retries:', error);
        throw error;
      }
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.warn(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
