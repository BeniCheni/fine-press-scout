---
name: qdrant-filter
description: Extend the Qdrant query function in app/lib/rag/query.ts to accept an optional budget (number) and keyword (string) parameter. Budget maps to a Qdrant price range payload filter. Keyword drives both a vector similarity search and an edition payload filter, with synonym expansion for fine press collecting vocabulary. Use this skill when asked to add budget-aware or keyword-filtered search, extend RAG query parameters, or build Qdrant payload filters for book discovery. Keywords: qdrant, filter, budget, keyword, edition, payload, vector search, RAG, price range, fine press.
---

# Skill: qdrant-filter

## Purpose

Extend `app/lib/rag/query.ts` to accept an optional `budget` (number) and
`keyword` (string). Budget applies a Qdrant price-range payload filter at the
database layer. Keyword both shapes the embedding query vector **and** resolves
to an `edition` payload filter via a fine-press synonym map. All filtering must
happen inside Qdrant — never in post-processing application logic.

---

## Pre-conditions

Before generating filter code, verify the following. If either condition is
unmet, complete the prerequisite first.

1. **`CleanedBook.edition` union type is extended.**  
   `app/lib/types.ts` must include all fine-press edition synonyms. The
   required union is:

   ```typescript
   // app/lib/types.ts
   export type EditionType =
     | 'Standard'
     | 'Collector'
     | 'Deluxe'
     | 'Lettered'
     | 'Traycased'
     | 'Hand-numbered'
     | 'Remarqued';

   export interface CleanedBook {
     // ...existing fields...
     edition: EditionType;
   }
   ```

   Also update `extractEdition()` in `app/lib/scraper.ts` to detect the new
   terms before the filter layer is built.

2. **`app/lib/rag/query.ts` exists.**  
   If the file does not exist, create it using the scaffold in the
   Implementation section below.

---

## TypeScript Types

Define these types at the top of `app/lib/rag/query.ts` (or in
`app/lib/types.ts` if shared across modules):

```typescript
import type { EditionType } from '@/lib/types';

/** Parameters accepted by queryBooks(). All fields are optional. */
export interface QueryParams {
  /** Free-text query used to generate the search embedding vector. */
  query: string;
  /**
   * Upper-bound price filter (inclusive). Maps to a Qdrant `range` payload
   * filter on the `price` field. No lower bound is applied — the collection
   * holds fine press titles that are inherently at the premium end.
   */
  budget?: number;
  /**
   * Fine-press edition keyword (e.g. "signed", "lettered", "traycased").
   * Resolved to an EditionType via KEYWORD_EDITION_MAP before being sent as
   * a Qdrant `match` payload filter on the `edition` field. The same keyword
   * string is also appended to the embedding query for semantic alignment.
   */
  keyword?: string;
  /** Maximum number of results to return. Defaults to 10. */
  topK?: number;
}
```

---

## Keyword → Edition Synonym Map

Keyword resolution must use this lookup table. Keys are lowercase. When a
keyword does not match any key, omit the edition payload filter entirely (do
not throw; fall back to vector-only search).

```typescript
const KEYWORD_EDITION_MAP: Record<string, EditionType> = {
  // Lettered variants
  'lettered':      'Lettered',
  'lettered edition': 'Lettered',
  'remarqued':     'Remarqued',

  // Collector / signed variants
  'signed':        'Collector',
  'hand-signed':   'Collector',
  'numbered':      'Collector',
  'hand-numbered': 'Hand-numbered',
  'limited':       'Collector',
  'limited edition': 'Collector',

  // Deluxe / traycase variants
  'deluxe':        'Deluxe',
  'traycased':     'Traycased',
  'traycase':      'Traycased',
  'slipcased':     'Deluxe',

  // Standard
  'standard':      'Standard',
  'trade':         'Standard',
};

/**
 * Resolve a raw keyword string to an EditionType, or undefined if unrecognised.
 * Comparison is case-insensitive and trims surrounding whitespace.
 */
function resolveEdition(keyword: string): EditionType | undefined {
  return KEYWORD_EDITION_MAP[keyword.trim().toLowerCase()];
}
```

---

## Implementation

Place the complete query function in `app/lib/rag/query.ts`.  
The file depends on a Qdrant JS/TS client (`@qdrant/js-client-rest`) and a
`getEmbedding()` helper (HuggingFace Inference API, `all-MiniLM-L6-v2`).

```typescript
// app/lib/rag/query.ts

import { QdrantClient } from '@qdrant/js-client-rest';
import type { Filter, Condition } from '@qdrant/js-client-rest';
import type { SearchResult, EditionType } from '@/lib/types';
import { getEmbedding } from './embed';          // HuggingFace embedding helper
import type { QueryParams } from './query.types'; // or defined above in same file

const COLLECTION = 'books';
const DEFAULT_TOP_K = 10;

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
});

// ---------------------------------------------------------------------------
// Synonym map (see above)
// ---------------------------------------------------------------------------
const KEYWORD_EDITION_MAP: Record<string, EditionType> = {
  lettered:        'Lettered',
  'lettered edition': 'Lettered',
  remarqued:       'Remarqued',
  signed:          'Collector',
  'hand-signed':   'Collector',
  numbered:        'Collector',
  'hand-numbered': 'Hand-numbered',
  limited:         'Collector',
  'limited edition': 'Collector',
  deluxe:          'Deluxe',
  traycased:       'Traycased',
  traycase:        'Traycased',
  slipcased:       'Deluxe',
  standard:        'Standard',
  trade:           'Standard',
};

function resolveEdition(keyword: string): EditionType | undefined {
  return KEYWORD_EDITION_MAP[keyword.trim().toLowerCase()];
}

// ---------------------------------------------------------------------------
// Query function
// ---------------------------------------------------------------------------

/**
 * Query the Qdrant `books` collection with optional budget and keyword filters.
 *
 * - `budget`  → Qdrant price range payload filter (lte, applied at DB layer).
 * - `keyword` → appended to the embedding query for semantic alignment AND
 *               resolved via KEYWORD_EDITION_MAP to an edition payload filter.
 * - Availability is always filtered to 'Available' so sold-out titles are
 *   never surfaced.
 */
export async function queryBooks(params: QueryParams): Promise<SearchResult[]> {
  const { query, budget, keyword, topK = DEFAULT_TOP_K } = params;

  // 1. Build embedding query — append keyword for semantic alignment
  const embeddingText = keyword ? `${query} ${keyword}` : query;
  const vector = await getEmbedding(embeddingText);

  // 2. Assemble Qdrant payload filters
  const must: Condition[] = [
    // Always exclude sold-out titles
    {
      key: 'availability',
      match: { value: 'Available' },
    },
  ];

  if (budget !== undefined) {
    must.push({
      key: 'price',
      range: { lte: budget },
    });
  }

  if (keyword !== undefined) {
    const resolvedEdition = resolveEdition(keyword);
    if (resolvedEdition !== undefined) {
      must.push({
        key: 'edition',
        match: { value: resolvedEdition },
      });
    }
    // If keyword is unrecognised, vector similarity alone drives the search.
  }

  const filter: Filter = { must };

  // 3. Execute Qdrant search
  const response = await qdrant.search(COLLECTION, {
    vector,
    limit: topK,
    filter,
    with_payload: true,
  });

  // 4. Map Qdrant hits to SearchResult
  return response.map((hit) => ({
    ...(hit.payload as Omit<SearchResult, 'similarity'>),
    similarity: hit.score,
  }));
}
```

---

## Behaviour Matrix

| `budget` | `keyword` | Resolved edition | Active Qdrant filters |
|---|---|---|---|
| `undefined` | `undefined` | — | `availability = Available` |
| `150` | `undefined` | — | `availability = Available`, `price ≤ 150` |
| `undefined` | `"lettered"` | `Lettered` | `availability = Available`, `edition = Lettered` |
| `250` | `"traycased"` | `Traycased` | `availability = Available`, `price ≤ 250`, `edition = Traycased` |
| `undefined` | `"fantasy"` | *(unrecognised)* | `availability = Available` — vector-only |
| `500` | `"fantasy"` | *(unrecognised)* | `availability = Available`, `price ≤ 500` — no edition filter |

---

## Notes

- **No post-processing filtering.** All `must` conditions are sent to Qdrant.
  Do not apply JavaScript-side price or edition checks on the returned results.
- **Qdrant payload field names** are `price` (number), `edition` (string),
  `availability` (string). These match the `CleanedBook` fields stored at
  ingest time. Do not rename them.
- **Lower-bound budget.** The current spec does not require a minimum price
  filter. If a `budgetMin` parameter is added later, push a second range key:
  `{ key: 'price', range: { gte: budgetMin, lte: budgetMax } }`.
- **Model:** embeddings use `all-MiniLM-L6-v2` via HuggingFace Inference API.
  The `getEmbedding()` helper lives in `app/lib/rag/embed.ts`.
- **Collection name** is `books`. It must be created and populated by the
  ingest pipeline (`app/lib/rag/ingest.ts`) before queries are issued.
  