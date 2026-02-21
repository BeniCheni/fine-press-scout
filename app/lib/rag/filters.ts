/**
 * app/lib/rag/filters.ts
 *
 * Composable NLP filter extraction for the Fine Press Scout RAG pipeline.
 *
 * extractFilters() parses a natural-language query string into typed Qdrant
 * payload filter conditions. Each helper is independently unit-testable and
 * returns `undefined` on no match — it never throws.
 *
 * All Qdrant filtering happens at the database layer (no post-processing JS).
 * Relevant payload fields: publisher (keyword), author (text), edition_type
 * (keyword), price (float), availability (keyword), genre_tags (keyword[]).
 */

import {
  EditionType,
  BookDocument,
  QdrantCondition,
  QdrantFilter,
  QueryAnalysis,
  ExtractedFilters,
} from '../types';

// ── Publisher alias map ──────────────────────────────────────────────────────
// Each entry: [list of lowercase aliases, canonical publisher string].
// Longer/more specific aliases listed first to avoid prefix collisions.
const PUBLISHER_ALIASES: [string[], string][] = [
  [['conversation tree press', 'conversation tree'], 'Conversation Tree Press'],
  [['subterranean press', 'sub press', 'subterranean'], 'Subterranean Press'],
  [['centipede press', 'centipede'], 'Centipede Press'],
  [['curious king'], 'Curious King'],
  [['suntup press', 'suntup'], 'Suntup Press'],
  [['midworld press', 'midworld'], 'Midworld Press'],
  [['zagava'], 'Zagava'],
];

// ── Author alias map ─────────────────────────────────────────────────────────
// Single-surname → full name for well-known fine press authors.
// Keys are lowercase.
const AUTHOR_ALIAS_MAP: Record<string, string> = {
  ligotti: 'Thomas Ligotti',
  barron: 'Laird Barron',
  gaiman: 'Neil Gaiman',
  king: 'Stephen King',
  straub: 'Peter Straub',
  watts: 'Peter Watts',
  mieville: 'China Miéville',
  'miéville': 'China Miéville',
  vandermeer: 'Jeff VanderMeer',
  lansdale: 'Joe R. Lansdale',
  james: 'M.R. James',
  machen: 'Arthur Machen',
  blackwood: 'Algernon Blackwood',
  lovecraft: 'H.P. Lovecraft',
};

// ── Edition synonym map ──────────────────────────────────────────────────────
// Keys are lowercase. Longest keys are tested first to prevent short keys
// (e.g. "lettered") from shadowing longer ones ("lettered edition").
// Exported so query.ts can reuse it for the explicit-params backward-compat path.
export const KEYWORD_EDITION_MAP: Record<string, EditionType> = {
  // Lettered variants
  'lettered edition': 'Lettered',
  'lettered copy': 'Lettered',
  'lettered copies': 'Lettered',
  lettered: 'Lettered',
  remarqued: 'Remarqued',

  // Artist variants
  'artist edition': 'Artist',
  artist: 'Artist',

  // Traycase variants
  'traycase edition': 'Traycased',
  traycased: 'Traycased',
  traycase: 'Traycased',

  // Hand-numbered variants
  'hand-numbered': 'Hand-numbered',
  'hand numbered': 'Hand-numbered',

  // Limited / numbered variants
  'limited edition': 'Limited',
  'limited numbered': 'Limited',
  'limited run': 'Limited',
  numbered: 'Limited',
  limited: 'Limited',

  // Collector / signed variants
  "collector's edition": 'Collector',
  'hand-signed': 'Collector',
  'signed edition': 'Collector',
  "collector's": 'Collector',
  collector: 'Collector',
  signed: 'Collector',

  // Deluxe variants
  'deluxe edition': 'Deluxe',
  deluxe: 'Deluxe',

  // Trade / standard variants
  'trade edition': 'Trade',
  trade: 'Trade',
  standard: 'Standard',
};

// ── Genre vocabulary ─────────────────────────────────────────────────────────
// Multi-word phrases are listed before their component words so they match
// first and prevent "horror" from shadowing "cosmic horror".
const GENRE_VOCABULARY: string[] = [
  'cosmic horror',
  'weird fiction',
  'dark fantasy',
  'literary horror',
  'science fiction',
  'lovecraftian',
  'sci-fi',
  'horror',
  'fantasy',
  'occult',
  'gothic',
  'supernatural',
  'thriller',
  'dark fiction',
];

// ── Availability map ─────────────────────────────────────────────────────────
// More-specific states (preorder, sold_out) are checked before in_print so
// that phrases like "pre-order available" resolve to preorder, not in_print.
const AVAILABILITY_MAP: [string[], BookDocument['availability']][] = [
  [['pre-order', 'preorder', 'pre order', 'coming soon', 'on order'], 'preorder'],
  [['sold out', 'sold-out', 'out of print', 'out of stock', 'unavailable'], 'sold_out'],
  [['in print', 'in-print', 'available now', 'available', 'in stock'], 'in_print'],
];

// ── Total number of filter dimensions ───────────────────────────────────────
// Used to compute QueryAnalysis.confidence.
const FILTER_SLOT_COUNT = 6; // publisher, author, editionType, maxPrice, availability, genreTags

// ── Composable helper functions ──────────────────────────────────────────────

/**
 * Extract a canonical publisher name from a free-text query.
 * Returns `undefined` when no known publisher is mentioned.
 */
export function extractPublisher(query: string): string | undefined {
  const q = query.toLowerCase();
  for (const [aliases, canonical] of PUBLISHER_ALIASES) {
    for (const alias of aliases) {
      if (q.includes(alias)) return canonical;
    }
  }
  return undefined;
}

/**
 * Extract an author name from recognised patterns:
 *   - "by Firstname Lastname"
 *   - "anything by Firstname Lastname"
 *   - "Firstname Lastname titles"
 *   - Single-surname alias (e.g. "ligotti" → "Thomas Ligotti")
 *
 * Uses `match.text` in Qdrant — requires a full-text index on the `author` field.
 */
export function extractAuthor(query: string): string | undefined {
  // "by [Firstname Lastname]" — optional "anything" prefix
  const byMatch = query.match(/\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  if (byMatch) return byMatch[1];

  // "[Firstname Lastname] titles"
  const titlesMatch = query.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+titles?\b/);
  if (titlesMatch) return titlesMatch[1];

  // Single-surname alias (case-insensitive word boundary scan)
  const words = query.toLowerCase().split(/\s+/);
  for (const word of words) {
    const cleaned = word.replace(/[^a-z\u00c0-\u024f]/g, ''); // strip punctuation
    const full = AUTHOR_ALIAS_MAP[cleaned];
    if (full) return full;
  }

  return undefined;
}

/**
 * Extract an EditionType from edition-related keyword phrases.
 * Tests longest keys first to prevent shorter sub-phrases from shadowing them.
 */
export function extractEditionType(query: string): EditionType | undefined {
  const q = query.toLowerCase();
  // Sort by key length descending so longer/more-specific phrases win
  const sortedKeys = Object.keys(KEYWORD_EDITION_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (q.includes(key)) return KEYWORD_EDITION_MAP[key];
  }
  return undefined;
}

/**
 * Extract an upper-bound price from natural-language budget phrases, e.g.:
 *   "under $200", "less than 300", "below €150", "under 150 dollars"
 *   "budget of $75", "my budget is $100", "up to $150"
 *   "no more than $200", "max $250", "at most $50"
 *   "$125 or less", "$80 or under"
 *
 * Uses two sequential passes:
 *   1. Trigger-first: keyword → currency symbol (optional) → number
 *   2. Reversed: currency symbol → number → trailing qualifier
 *
 * Intentionally does not parse vague words like "cheap" — those fall back
 * to vector-only search.
 */
export function extractPrice(query: string): number | undefined {
  // Pass 1 — trigger-first patterns (keyword precedes the number)
  const triggerFirst = query.match(
    /(?:under|less\s+than|below|cheaper\s+than|up\s+to|no\s+more\s+than|at\s+most|max(?:imum)?|budget\s+(?:of|is|:)|<)\s*[£$€]?\s*(\d+(?:\.\d+)?)\s*(?:dollars?|usd|eur|gbp|pounds?)?/i,
  );
  if (triggerFirst) {
    const value = parseFloat(triggerFirst[1]);
    if (!isNaN(value)) return value;
  }

  // Pass 2 — reversed patterns (number precedes the qualifier)
  const reversed = query.match(
    /[£$€]\s*(\d+(?:\.\d+)?)\s*(?:dollars?|usd|eur|gbp|pounds?)?\s+(?:or\s+(?:less|under)|max)/i,
  );
  if (reversed) {
    const value = parseFloat(reversed[1]);
    if (!isNaN(value)) return value;
  }

  return undefined;
}

/**
 * Extract an availability state from recognisable phrases.
 * Returns the snake_case value stored in the Qdrant payload.
 */
export function extractAvailability(query: string): BookDocument['availability'] | undefined {
  const q = query.toLowerCase();
  for (const [phrases, value] of AVAILABILITY_MAP) {
    for (const phrase of phrases) {
      if (q.includes(phrase)) return value;
    }
  }
  return undefined;
}

/**
 * Extract genre tags from a predefined vocabulary.
 * Multi-word phrases (e.g. "cosmic horror") are tested before their
 * sub-phrases to avoid double-matching.
 */
export function extractGenreTags(query: string): string[] | undefined {
  const q = query.toLowerCase();
  const matched: string[] = [];
  for (const genre of GENRE_VOCABULARY) {
    if (
      q.includes(genre) &&
      // Avoid adding both "horror" and "cosmic horror"
      !matched.some((m) => m.includes(genre) || genre.includes(m))
    ) {
      matched.push(genre);
    }
  }
  return matched.length > 0 ? matched : undefined;
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface ExtractFiltersResult {
  /** Qdrant `must` conditions ready to pass to client.search(). */
  qdrantMust: NonNullable<QdrantFilter['must']>;
  /** Human-readable analysis for the Reasoning Panel. */
  analysis: QueryAnalysis;
}

/**
 * Parse a natural-language query string into typed Qdrant filter conditions.
 *
 * Returns:
 *   - `qdrantMust` — array of QdrantCondition objects for the `must` clause
 *   - `analysis`   — structured breakdown for display in the Reasoning Panel
 *
 * Note: this function does NOT add a default `availability: in_print` filter.
 * The caller (queryBooks) is responsible for injecting the default when no
 * explicit availability is found.
 */
export function extractFilters(query: string): ExtractFiltersResult {
  const publisher = extractPublisher(query);
  const author = extractAuthor(query);
  const editionType = extractEditionType(query);
  const maxPrice = extractPrice(query);
  const availability = extractAvailability(query);
  const genreTags = extractGenreTags(query);

  const qdrantMust: QdrantCondition[] = [];

  if (publisher !== undefined) {
    qdrantMust.push({ key: 'publisher', match: { value: publisher } });
  }
  if (author !== undefined) {
    // match.text requires a full-text payload index on `author` (see ingest.ts)
    qdrantMust.push({ key: 'author', match: { text: author } });
  }
  if (editionType !== undefined) {
    qdrantMust.push({ key: 'edition_type', match: { value: editionType } });
  }
  if (maxPrice !== undefined) {
    qdrantMust.push({ key: 'price', range: { lte: maxPrice } });
  }
  if (availability !== undefined) {
    qdrantMust.push({ key: 'availability', match: { value: availability } });
  }
  if (genreTags !== undefined) {
    qdrantMust.push({ key: 'genre_tags', match: { any: genreTags } });
  }

  const populatedCount = [publisher, author, editionType, maxPrice, availability, genreTags].filter(
    (v) => v !== undefined,
  ).length;

  const extractedFilters: ExtractedFilters = {
    ...(publisher !== undefined && { publisher }),
    ...(author !== undefined && { author }),
    ...(editionType !== undefined && { editionType }),
    ...(maxPrice !== undefined && { maxPrice }),
    ...(availability !== undefined && { availability }),
    ...(genreTags !== undefined && { genreTags }),
  };

  const analysis: QueryAnalysis = {
    originalQuery: query,
    extractedFilters,
    confidence: populatedCount / FILTER_SLOT_COUNT,
  };

  return { qdrantMust, analysis };
}
