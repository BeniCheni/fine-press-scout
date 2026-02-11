import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';
const COLLECTION_NAME = 'fine_press_books';

export const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY || undefined,
});

/**
 * Initialize the fine_press_books collection with 384-dimensional vectors.
 * Creates the collection if it does not exist, validates configuration if it does.
 */
export async function initCollection(): Promise<void> {
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === COLLECTION_NAME
    );

    if (exists) {
      const info = await qdrantClient.getCollection(COLLECTION_NAME);
      const vectorSize = info.config?.params?.vectors?.size;

      if (vectorSize !== 384) {
        throw new Error(
          `Collection exists with wrong vector size. Expected 384, got ${vectorSize}`
        );
      }

      console.log(
        `Collection "${COLLECTION_NAME}" already exists with correct configuration`
      );
      return;
    }

    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 384,
        distance: 'Cosine',
      },
    });

    console.log(
      `Created collection "${COLLECTION_NAME}" with 384-dimensional vectors`
    );
  } catch (error) {
    throw new Error(
      `Failed to initialize collection: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
