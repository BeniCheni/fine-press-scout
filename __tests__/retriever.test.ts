/**
 * __tests__/retriever.test.ts
 *
 * Unit tests for the NLP filter extraction layer (app/lib/rag/filters.ts).
 *
 * These tests call extractFilters() and the composable helpers directly —
 * no Qdrant client and no HuggingFace embedding calls are made.
 */

import { describe, it, expect } from 'vitest';
import {
  extractFilters,
  extractPublisher,
  extractAuthor,
  extractEditionType,
  extractPrice,
  extractAvailability,
  extractGenreTags,
} from '../app/lib/rag/filters';

// ── Helper: find a condition in the qdrantMust array by field key ────────────
function findCondition(must: Array<{ key: string }>, key: string) {
  return must.find((c) => c.key === key);
}

// ────────────────────────────────────────────────────────────────────────────
// Integration: extractFilters()
// ────────────────────────────────────────────────────────────────────────────

describe('extractFilters()', () => {
  // ── 1. Edition + price ────────────────────────────────────────────────────
  it('extracts lettered edition and price upper bound', () => {
    const { qdrantMust, analysis } = extractFilters('lettered edition under $200');

    const editionCond = findCondition(qdrantMust, 'edition_type') as
      | { key: string; match: { value: string } }
      | undefined;
    const priceCond = findCondition(qdrantMust, 'price') as
      | { key: string; range: { lte: number } }
      | undefined;

    expect(editionCond?.match.value).toBe('Lettered');
    expect(priceCond?.range.lte).toBe(200);
    expect(analysis.extractedFilters.editionType).toBe('Lettered');
    expect(analysis.extractedFilters.maxPrice).toBe(200);
    expect(analysis.confidence).toBeGreaterThan(0);
  });

  // ── 2. Author — "by [Name]" pattern ──────────────────────────────────────
  it('extracts author from "anything by Laird Barron"', () => {
    const { qdrantMust, analysis } = extractFilters('anything by Laird Barron');

    const authorCond = findCondition(qdrantMust, 'author') as
      | { key: string; match: { text: string } }
      | undefined;

    expect(authorCond?.match.text).toBe('Laird Barron');
    expect(analysis.extractedFilters.author).toBe('Laird Barron');
  });

  // ── 3. Publisher + genre ──────────────────────────────────────────────────
  it('extracts Centipede Press and horror genre', () => {
    const { qdrantMust, analysis } = extractFilters('Centipede Press horror');

    const publisherCond = findCondition(qdrantMust, 'publisher') as
      | { key: string; match: { value: string } }
      | undefined;
    const genreCond = findCondition(qdrantMust, 'genre_tags') as
      | { key: string; match: { any: string[] } }
      | undefined;

    expect(publisherCond?.match.value).toBe('Centipede Press');
    expect(genreCond?.match.any).toContain('horror');
    expect(analysis.extractedFilters.publisher).toBe('Centipede Press');
  });

  // ── 4. Publisher + signed edition (partial publisher name) ───────────────
  it('extracts Subterranean Press from partial name and maps "signed" to Collector', () => {
    const { qdrantMust } = extractFilters('Subterranean signed copies in print');

    const publisherCond = findCondition(qdrantMust, 'publisher') as
      | { key: string; match: { value: string } }
      | undefined;
    const editionCond = findCondition(qdrantMust, 'edition_type') as
      | { key: string; match: { value: string } }
      | undefined;

    expect(publisherCond?.match.value).toBe('Subterranean Press');
    expect(editionCond?.match.value).toBe('Collector');
  });

  // ── 5. Publisher + explicit in_print ─────────────────────────────────────
  it('extracts Zagava and in_print availability', () => {
    const { qdrantMust, analysis } = extractFilters('in print Zagava books');

    const publisherCond = findCondition(qdrantMust, 'publisher') as
      | { key: string; match: { value: string } }
      | undefined;
    const availCond = findCondition(qdrantMust, 'availability') as
      | { key: string; match: { value: string } }
      | undefined;

    expect(publisherCond?.match.value).toBe('Zagava');
    expect(availCond?.match.value).toBe('in_print');
    expect(analysis.extractedFilters.availability).toBe('in_print');
  });

  // ── 6. Sold out + limited edition ────────────────────────────────────────
  it('extracts sold_out availability and Limited edition type', () => {
    const { qdrantMust } = extractFilters('sold out limited editions');

    const availCond = findCondition(qdrantMust, 'availability') as
      | { key: string; match: { value: string } }
      | undefined;
    const editionCond = findCondition(qdrantMust, 'edition_type') as
      | { key: string; match: { value: string } }
      | undefined;

    expect(availCond?.match.value).toBe('sold_out');
    expect(editionCond?.match.value).toBe('Limited');
  });

  // ── 7. Vague price word ("cheap") — edge case ────────────────────────────
  it('"anything cheap from Zagava" extracts publisher but no price filter', () => {
    const { qdrantMust, analysis } = extractFilters('anything cheap from Zagava');

    const publisherCond = findCondition(qdrantMust, 'publisher');
    const priceCond = findCondition(qdrantMust, 'price');

    expect(publisherCond).toBeDefined();
    expect(priceCond).toBeUndefined();
    expect(analysis.extractedFilters.maxPrice).toBeUndefined();
  });

  // ── 8. Surname alias → full name + availability ───────────────────────────
  it('"Ligotti in print" maps surname alias and extracts in_print', () => {
    const { qdrantMust, analysis } = extractFilters('Ligotti in print');

    const authorCond = findCondition(qdrantMust, 'author') as
      | { key: string; match: { text: string } }
      | undefined;
    const availCond = findCondition(qdrantMust, 'availability') as
      | { key: string; match: { value: string } }
      | undefined;

    expect(authorCond?.match.text).toBe('Thomas Ligotti');
    expect(availCond?.match.value).toBe('in_print');
    expect(analysis.extractedFilters.author).toBe('Thomas Ligotti');
  });

  // ── 9. Pre-order + traycased ──────────────────────────────────────────────
  it('extracts preorder availability and Traycased edition', () => {
    const { qdrantMust } = extractFilters('pre-order traycased edition');

    const availCond = findCondition(qdrantMust, 'availability') as
      | { key: string; match: { value: string } }
      | undefined;
    const editionCond = findCondition(qdrantMust, 'edition_type') as
      | { key: string; match: { value: string } }
      | undefined;

    expect(availCond?.match.value).toBe('preorder');
    expect(editionCond?.match.value).toBe('Traycased');
  });

  // ── 10. Multi-word genre + price in dollars ───────────────────────────────
  it('"cosmic horror under 150 dollars" extracts genre and price', () => {
    const { qdrantMust, analysis } = extractFilters('cosmic horror under 150 dollars');

    const genreCond = findCondition(qdrantMust, 'genre_tags') as
      | { key: string; match: { any: string[] } }
      | undefined;
    const priceCond = findCondition(qdrantMust, 'price') as
      | { key: string; range: { lte: number } }
      | undefined;

    expect(genreCond?.match.any).toContain('cosmic horror');
    // "horror" should NOT appear separately — cosmic horror takes precedence
    expect(genreCond?.match.any).not.toContain('horror');
    expect(priceCond?.range.lte).toBe(150);
    expect(analysis.extractedFilters.genreTags).toEqual(['cosmic horror']);
  });

  // ── 11. Euro currency price + lettered ───────────────────────────────────
  it('"less than €300 lettered" extracts price and Lettered edition', () => {
    const { qdrantMust } = extractFilters('less than €300 lettered');

    const priceCond = findCondition(qdrantMust, 'price') as
      | { key: string; range: { lte: number } }
      | undefined;
    const editionCond = findCondition(qdrantMust, 'edition_type') as
      | { key: string; match: { value: string } }
      | undefined;

    expect(priceCond?.range.lte).toBe(300);
    expect(editionCond?.match.value).toBe('Lettered');
  });

  // ── 12. Hand-numbered below dollar amount ────────────────────────────────
  it('"hand-numbered below $500" extracts Hand-numbered and price 500', () => {
    const { qdrantMust } = extractFilters('hand-numbered below $500');

    const editionCond = findCondition(qdrantMust, 'edition_type') as
      | { key: string; match: { value: string } }
      | undefined;
    const priceCond = findCondition(qdrantMust, 'price') as
      | { key: string; range: { lte: number } }
      | undefined;

    expect(editionCond?.match.value).toBe('Hand-numbered');
    expect(priceCond?.range.lte).toBe(500);
  });

  // ── 13. No extractable filters — edge case ───────────────────────────────
  it('"rare books" yields empty qdrantMust and confidence 0', () => {
    const { qdrantMust, analysis } = extractFilters('rare books');

    expect(qdrantMust).toHaveLength(0);
    expect(analysis.confidence).toBe(0);
    expect(analysis.extractedFilters).toEqual({});
    expect(analysis.originalQuery).toBe('rare books');
  });

  // ── 14. Laird Barron via "titles" pattern ────────────────────────────────
  it('"Laird Barron titles" extracts author via titles pattern', () => {
    const { qdrantMust } = extractFilters('Laird Barron titles');

    const authorCond = findCondition(qdrantMust, 'author') as
      | { key: string; match: { text: string } }
      | undefined;

    expect(authorCond?.match.text).toBe('Laird Barron');
  });

  // ── 15. Confidence score reflects populated filter count ─────────────────
  it('confidence is 3/6 when three filters are extracted', () => {
    // publisher + available + edition = 3 slots
    const { analysis } = extractFilters('Zagava in print lettered');
    // 3 out of 6 possible filter dimensions
    expect(analysis.confidence).toBeCloseTo(3 / 6, 5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Unit: individual helper functions
// ────────────────────────────────────────────────────────────────────────────

describe('extractPublisher()', () => {
  it('matches "Centipede" as Centipede Press', () => {
    expect(extractPublisher('centipede books')).toBe('Centipede Press');
  });
  it('matches "sub press" as Subterranean Press', () => {
    expect(extractPublisher('sub press titles')).toBe('Subterranean Press');
  });
  it('matches "Conversation Tree" case-insensitively', () => {
    expect(extractPublisher('conversation tree press')).toBe('Conversation Tree Press');
  });
  it('returns undefined for unrecognised publisher', () => {
    expect(extractPublisher('horror books')).toBeUndefined();
  });
});

describe('extractAuthor()', () => {
  it('handles "by [Name]" pattern', () => {
    expect(extractAuthor('anything by Neil Gaiman')).toBe('Neil Gaiman');
  });
  it('handles "[Name] titles" pattern', () => {
    expect(extractAuthor('Peter Straub titles')).toBe('Peter Straub');
  });
  it('resolves surname alias "barron" to Laird Barron', () => {
    expect(extractAuthor('barron signed')).toBe('Laird Barron');
  });
  it('returns undefined when no author pattern matches', () => {
    expect(extractAuthor('cosmic horror books')).toBeUndefined();
  });
});

describe('extractEditionType()', () => {
  it('maps "limited run" to Limited', () => {
    expect(extractEditionType('limited run copies')).toBe('Limited');
  });
  it('"lettered edition" takes precedence over bare "lettered"', () => {
    expect(extractEditionType('lettered edition of the book')).toBe('Lettered');
  });
  it('maps "hand-numbered" to Hand-numbered', () => {
    expect(extractEditionType('hand-numbered copy')).toBe('Hand-numbered');
  });
  it('returns undefined for unrelated text', () => {
    expect(extractEditionType('classic novel')).toBeUndefined();
  });
});

describe('extractPrice()', () => {
  it('parses "under $200"', () => {
    expect(extractPrice('under $200')).toBe(200);
  });
  it('parses "less than €150"', () => {
    expect(extractPrice('less than €150')).toBe(150);
  });
  it('parses "below 300 dollars"', () => {
    expect(extractPrice('below 300 dollars')).toBe(300);
  });
  it('returns undefined for "cheap"', () => {
    expect(extractPrice('cheap books')).toBeUndefined();
  });
  it('parses "under £500"', () => {
    expect(extractPrice('under £500')).toBe(500);
  });
  it('parses "I have a budget of $75"', () => {
    expect(extractPrice('I have a budget of $75')).toBe(75);
  });
  it('parses "my budget is $100"', () => {
    expect(extractPrice('my budget is $100')).toBe(100);
  });
  it('parses "up to $150"', () => {
    expect(extractPrice('up to $150')).toBe(150);
  });
  it('parses "no more than $200"', () => {
    expect(extractPrice('no more than $200')).toBe(200);
  });
  it('parses "max $250"', () => {
    expect(extractPrice('max $250')).toBe(250);
  });
  it('parses "maximum $300"', () => {
    expect(extractPrice('maximum $300')).toBe(300);
  });
  it('parses "at most $50"', () => {
    expect(extractPrice('at most $50')).toBe(50);
  });
  it('parses "$125 or less"', () => {
    expect(extractPrice('$125 or less')).toBe(125);
  });
  it('parses "$80 or under"', () => {
    expect(extractPrice('$80 or under')).toBe(80);
  });
});

describe('extractAvailability()', () => {
  it('maps "in print" to in_print', () => {
    expect(extractAvailability('in print copies')).toBe('in_print');
  });
  it('maps "sold out" to sold_out', () => {
    expect(extractAvailability('sold out editions')).toBe('sold_out');
  });
  it('maps "pre-order" to preorder', () => {
    expect(extractAvailability('pre-order available')).toBe('preorder');
  });
  it('maps "available now" to in_print', () => {
    expect(extractAvailability('available now')).toBe('in_print');
  });
  it('returns undefined for unrelated text', () => {
    expect(extractAvailability('horror books')).toBeUndefined();
  });
});

describe('extractGenreTags()', () => {
  it('extracts "cosmic horror" as a single tag (not "horror" separately)', () => {
    const tags = extractGenreTags('cosmic horror fiction');
    expect(tags).toEqual(['cosmic horror']);
  });
  it('extracts multiple distinct genres', () => {
    const tags = extractGenreTags('gothic and weird fiction');
    expect(tags).toContain('gothic');
    expect(tags).toContain('weird fiction');
  });
  it('returns undefined when no genres found', () => {
    expect(extractGenreTags('signed limited edition')).toBeUndefined();
  });
  it('is case-insensitive', () => {
    expect(extractGenreTags('Lovecraftian tales')).toContain('lovecraftian');
  });
});
