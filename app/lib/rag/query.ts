import { QdrantClient } from '@qdrant/js-client-rest';
import { SearchResult, QueryParams, EditionType } from '../types';
import { getEmbedding } from './embed';

const COLLECTION = 'books';

// ── Edition synonym map ────────────────────────────────────────────────────
// Keys are lowercase. When a keyword matches no key, the edition filter is
// omitted and the search falls back to vector-only (no throw).
const KEYWORD_EDITION_MAP: Record<string, EditionType> = {
  // Lettered variants
  lettered: 'Lettered',
  'lettered edition': 'Lettered',
  remarqued: 'Remarqued',

  // Traycase variants
  traycased: 'Traycased',
  traycase: 'Traycased',
  'traycase edition': 'Traycased',

  // Hand-numbered variants
  numbered: 'Hand-numbered',
  'hand-numbered': 'Hand-numbered',
  'hand numbered': 'Hand-numbered',
  'limited numbered': 'Hand-numbered',

  // Collector / signed variants
  signed: 'Collector',
  'hand-signed': 'Collector',
  'signed edition': 'Collector',
  collector: 'Collector',
  "collector's": 'Collector',
  "collector's edition": 'Collector',
  limited: 'Collector',
  'limited edition': 'Collector',

  // Deluxe variants
  deluxe: 'Deluxe',
  'deluxe edition': 'Deluxe',

  // Standard variants
  standard: 'Standard',
  'trade edition': 'Standard',
  trade: 'Standard',
};

function resolveEdition(keyword: string): EditionType | undefined {
  return KEYWORD_EDITION_MAP[keyword.toLowerCase().trim()];
}

function getQdrant(): QdrantClient {
  const url = process.env.QDRANT_URL ?? 'http://localhost:6333';
  return new QdrantClient({ url });
}

/**
 * Query the Qdrant `books` collection.
 *
 * All filtering happens at the Qdrant layer — never in post-processing JS:
 *   - Always filters `availability = "Available"`
 *   - `budget`  → `price` range filter (`lte: budget`)
 *   - `keyword` → resolved to EditionType via KEYWORD_EDITION_MAP → `edition` match filter
 *                 + the keyword string is appended to the embedding query for semantic weight
 */
export async function queryBooks(params: QueryParams): Promise<SearchResult[]> {
  const { query, budget, keyword, topK = 8 } = params;
  const client = getQdrant();

  // Build the embedding query: append keyword for semantic alignment
  const embeddingQuery = keyword ? `${query} ${keyword}` : query;
  const vector = await getEmbedding(embeddingQuery);

  // ── Build Qdrant filter ─────────────────────────────────────────────────
  type QdrantCondition = Record<string, unknown>;
  const must: QdrantCondition[] = [
    { key: 'availability', match: { value: 'Available' } },
  ];

  if (budget !== undefined && budget > 0) {
    must.push({ key: 'price', range: { lte: budget } });
  }

  if (keyword) {
    const edition = resolveEdition(keyword);
    if (edition) {
      must.push({ key: 'edition', match: { value: edition } });
    }
  }

  const results = await client.search(COLLECTION, {
    vector,
    limit: topK,
    filter: { must },
    with_payload: true,
  });

  return results.map((hit) => {
    const p = hit.payload as Record<string, unknown>;
    return {
      id: String(hit.id),
      title: String(p.title ?? ''),
      author: String(p.author ?? 'Unknown'),
      price: Number(p.price ?? 0),
      availability: (p.availability as 'Available' | 'Sold Out') ?? 'Available',
      edition: (p.edition as EditionType) ?? 'Standard',
      description: String(p.description ?? ''),
      url: String(p.url ?? ''),
      imageUrl: String(p.imageUrl ?? ''),
      publisher: String(p.publisher ?? ''),
      reviews: Number(p.reviews ?? 0),
      scrapedAt: p.scrapedAt ? new Date(p.scrapedAt as string) : new Date(),
      similarity: hit.score,
    };
  });
}
