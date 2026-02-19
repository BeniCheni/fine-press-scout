// ── Edition vocabulary ──────────────────────────────────────────────────────
// Covers all fine-press synonym forms found across the six target publishers.
export type EditionType =
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
}

// ── Cleaned / normalised layer ───────────────────────────────────────────────

export interface CleanedBook {
  id: string;
  title: string;
  author: string;
  price: number;                    // numeric USD/GBP; 0 when unknown
  availability: 'Available' | 'Sold Out';
  edition: EditionType;
  description: string;              // assembled text used for embedding
  url: string;
  imageUrl: string;
  publisher: string;
  reviews: number;
  scrapedAt: Date;
}

// ── Embedding layer ──────────────────────────────────────────────────────────

export interface EmbeddedBook extends CleanedBook {
  embedding: number[];
  embeddedAt: Date;
}

// ── Query / search layer ─────────────────────────────────────────────────────

export interface SearchResult extends CleanedBook {
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
   * a Qdrant match payload filter on the `edition` field. The keyword string
   * is also appended to the embedding query for semantic alignment.
   */
  keyword?: string;
  /** Maximum number of results to return. Defaults to 8. */
  topK?: number;
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
