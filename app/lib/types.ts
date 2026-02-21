// ── Edition vocabulary ──────────────────────────────────────────────────────
// Merged TitleCase union covering all fine-press synonym forms.
// Trade/Limited/Artist are newly added; remaining values were carried forward.
export type EditionType =
  | 'Trade'
  | 'Limited'
  | 'Artist'
  | 'Standard'
  | 'Collector'
  | 'Deluxe'
  | 'Lettered'
  | 'Traycased'
  | 'Hand-numbered'
  | 'Remarqued';

// ── Scraping layer ───────────────────────────────────────────────────────────

export interface RawBook {
  title: string;
  price: string;          // raw string, e.g. "$45.00", "£120", "0" when unknown
  availability: string;   // raw string, e.g. "Available", "Sold Out"
  url: string;            // absolute product URL
  imageUrl: string;
  publisher: string;      // source publisher name, e.g. "Suntup Press"
  reviews?: number;
  currency?: string;      // detected currency symbol (e.g. "GBP") before normalisation
}

// ── Cleaned / normalised layer ───────────────────────────────────────────────
// BookDocument replaces the former CleanedBook interface.

export interface BookDocument {
  id: string;
  title: string;
  author: string;
  price: number;                              // numeric; 0 when unknown
  availability: 'in_print' | 'sold_out' | 'preorder';
  edition_type: EditionType;
  description: string;                        // assembled text used for embedding
  url: string;
  imageUrl: string;
  publisher: string;
  reviews: number;
  scraped_at: string;                         // ISO 8601 timestamp, required

  // Optional enrichment fields populated by scrapers when available
  currency?: string;                          // e.g. "GBP" for non-USD stores
  limitation?: number;                        // print run size when stated
  genre_tags?: string[];                      // e.g. ["horror", "science fiction"]
  illustrator?: string;
  binding?: string;                           // e.g. "leather", "cloth"
  page_count?: number;
  publication_year?: number;
  raw_text?: string;                          // full body text from product page
}

// ── Embedding layer ──────────────────────────────────────────────────────────

export interface EmbeddedBook extends BookDocument {
  embedding: number[];
  embeddedAt: Date;
}

// ── Query / search layer ─────────────────────────────────────────────────────

export interface SearchResult extends BookDocument {
  similarity: number;
}

/** Parameters accepted by queryBooks(). All fields optional except query. */
export interface QueryParams {
  /** Free-text query used to generate the embedding vector. */
  query: string;
  /**
   * Upper-bound price filter (inclusive). Maps to a Qdrant range payload filter
   * on the `price` field. No lower bound — fine press titles are inherently
   * at the premium end of the market.
   */
  budget?: number;
  /**
   * Fine-press edition keyword (e.g. "signed", "lettered", "traycased").
   * Resolved to an EditionType via KEYWORD_EDITION_MAP before being sent as
   * a Qdrant match payload filter on the `edition_type` field. The keyword
   * string is also appended to the embedding query for semantic alignment.
   */
  keyword?: string;
  /** Maximum number of results to return. Defaults to 8. */
  topK?: number;
}

// ── Qdrant filter types ──────────────────────────────────────────────────────
// Typed subset of the @qdrant/js-client-rest filter DSL.
// Use these instead of `Record<string, unknown>` for payload filter conditions.

export interface QdrantMatchValue {
  value: string | number | boolean;
}
export interface QdrantMatchText {
  /** Full-text match — requires a `text` payload index on the field. */
  text: string;
}
export interface QdrantMatchAny {
  any: Array<string | number>;
}
export interface QdrantRange {
  lte?: number;
  gte?: number;
  lt?: number;
  gt?: number;
}
export interface QdrantCondition {
  key: string;
  match?: QdrantMatchValue | QdrantMatchText | QdrantMatchAny;
  range?: QdrantRange;
}
export interface QdrantFilter {
  must?: QdrantCondition[];
  should?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

// ── NLP filter extraction types ──────────────────────────────────────────────

/** Structured representation of filters pulled from a natural-language query. */
export interface ExtractedFilters {
  publisher?: string;
  author?: string;
  editionType?: EditionType;
  maxPrice?: number;
  availability?: BookDocument['availability'];
  genreTags?: string[];
}

/**
 * Result of running NLP filter extraction on a raw query string.
 * Displayed in the Reasoning Panel.
 */
export interface QueryAnalysis {
  /** The unmodified query passed to extractFilters(). */
  originalQuery: string;
  /** The structured filters that were successfully extracted. */
  extractedFilters: ExtractedFilters;
  /**
   * Fraction of filter dimensions populated (0–1).
   * e.g. 3 out of 6 possible filters → 0.5
   */
  confidence: number;
}

// ── Chat layer ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RAGResponse {
  results: SearchResult[];
  recommendation: string;
}
