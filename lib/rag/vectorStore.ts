import { QdrantClient } from '@qdrant/js-client-rest';
import type { SearchResult, SearchParams } from '@/types';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY,
});

export async function searchVectors(
  params: SearchParams
): Promise<SearchResult[]> {
  const results = await qdrant.search('fine_press_books', {
    vector: params.vector,
    limit: params.limit,
    filter: params.filter,
    with_payload: true,
  });

  return results.map((result) => ({
    id: result.id as string,
    score: result.score,
    payload: result.payload as SearchResult['payload'],
  }));
}
