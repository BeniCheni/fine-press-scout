import { QdrantClient } from '@qdrant/js-client-rest';
import { SearchResult, QueryParams, EditionType, QdrantCondition } from '../types';
import { getEmbedding } from './embed';
import { extractFilters, KEYWORD_EDITION_MAP } from './filters';

export { extractFilters } from './filters';
export type { ExtractFiltersResult } from './filters';

const COLLECTION = 'books';

/** Resolve an explicit keyword string to an EditionType via the synonym map. */
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
 * All filtering happens at the Qdrant layer — never in post-processing JS.
 *
 * Two filter-building paths:
 *
 * **Explicit-params path** (backward-compatible):
 *   - Used when `budget` or `keyword` is provided by the caller.
 *   - Always adds `availability = in_print`.
 *   - `budget`  → `price range lte`.
 *   - `keyword` → resolved to EditionType → `edition_type match`.
 *
 * **NLP extraction path** (activated when both `budget` and `keyword` are absent):
 *   - Calls `extractFilters(query)` to derive publisher, author, edition_type,
 *     price, availability, and genre_tag conditions from the raw query string.
 *   - Defaults to `availability = in_print` when no availability phrase is found.
 *   - Appends extracted edition/genre terms to the embedding query for
 *     semantic alignment.
 */
export async function queryBooks(params: QueryParams): Promise<SearchResult[]> {
  const { query, budget, keyword, topK = 8 } = params;
  const client = getQdrant();

  let embeddingQuery: string;
  let must: QdrantCondition[];

  if (budget !== undefined || keyword !== undefined) {
    // ── Explicit-params path ────────────────────────────────────────────────
    embeddingQuery = keyword ? `${query} ${keyword}` : query;
    must = [{ key: 'availability', match: { value: 'in_print' } }];

    if (budget !== undefined && budget > 0) {
      must.push({ key: 'price', range: { lte: budget } });
    }
    if (keyword) {
      const edition = resolveEdition(keyword);
      if (edition) {
        must.push({ key: 'edition_type', match: { value: edition } });
      }
    }
  } else {
    // ── NLP extraction path ─────────────────────────────────────────────────
    const { qdrantMust, analysis } = extractFilters(query);
    const { extractedFilters } = analysis;

    // Append edition type and genre tags to the embedding for semantic weight
    const semanticAppend = [
      extractedFilters.editionType,
      ...(extractedFilters.genreTags ?? []),
    ]
      .filter(Boolean)
      .join(' ');
    embeddingQuery = semanticAppend ? `${query} ${semanticAppend}` : query;

    must = qdrantMust;

    // Default to in_print when no explicit availability phrase was found
    const hasAvailability = must.some((c) => c.key === 'availability');
    if (!hasAvailability) {
      must.push({ key: 'availability', match: { value: 'in_print' } });
    }
  }

  const vector = await getEmbedding(embeddingQuery);

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
      availability: (p.availability as 'in_print' | 'sold_out' | 'preorder') ?? 'in_print',
      edition_type: (p.edition_type as EditionType) ?? 'Standard',
      description: String(p.description ?? ''),
      url: String(p.url ?? ''),
      imageUrl: String(p.imageUrl ?? ''),
      publisher: String(p.publisher ?? ''),
      reviews: Number(p.reviews ?? 0),
      scraped_at: p.scraped_at ? String(p.scraped_at) : new Date().toISOString(),
      similarity: hit.score,
    };
  });
}
