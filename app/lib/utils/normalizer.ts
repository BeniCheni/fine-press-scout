/**
 * Normalizer for BookDocument objects.
 *
 * normalizeBookDocument() — parse-and-throw boundary: call at scraper output
 *   or ingest input to guarantee shape conformance.
 * validateBookDocument() — soft quality check: emits console.warn when too
 *   many optional enrichment fields are absent.
 */
import { z } from 'zod';
import { BookDocument, EditionType } from '../types';

// ── Zod schema ────────────────────────────────────────────────────────────────

const EDITION_VALUES: [EditionType, ...EditionType[]] = [
  'Trade',
  'Limited',
  'Artist',
  'Standard',
  'Collector',
  'Deluxe',
  'Lettered',
  'Traycased',
  'Hand-numbered',
  'Remarqued',
];

const AVAILABILITY_VALUES = ['in_print', 'sold_out', 'preorder'] as const;

export const bookDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string(),
  price: z.number().nonnegative(),
  availability: z.enum(AVAILABILITY_VALUES),
  edition_type: z.enum(EDITION_VALUES),
  description: z.string(),
  url: z.string().url(),
  imageUrl: z.string(),
  publisher: z.string().min(1),
  reviews: z.number().nonnegative(),
  scraped_at: z.string().datetime(),

  // Optional enrichment fields
  currency: z.string().optional(),
  limitation: z.number().positive().int().optional(),
  genre_tags: z.array(z.string()).optional(),
  illustrator: z.string().optional(),
  binding: z.string().optional(),
  page_count: z.number().positive().int().optional(),
  publication_year: z.number().int().min(1800).max(2100).optional(),
  raw_text: z.string().optional(),
});

// Compile-time assertion: the schema's inferred type must satisfy BookDocument.
// If this line produces a type error, the schema has drifted from BookDocument.
type _InferredDoc = z.infer<typeof bookDocumentSchema>;
const _satisfiesCheck: _InferredDoc extends BookDocument ? true : never = true;
void _satisfiesCheck; // suppress unused-variable warning

// ── Exported helpers ──────────────────────────────────────────────────────────

/**
 * Parse raw (unknown) input through the Zod schema.
 * Throws a ZodError on any validation failure — call at input/output
 * boundaries so callers can handle the exception and skip bad records.
 */
export function normalizeBookDocument(raw: unknown): BookDocument {
  return bookDocumentSchema.parse(raw) as BookDocument;
}

/**
 * Soft quality check — emits a console.warn when more than 3 optional
 * enrichment fields are absent. Does NOT throw; expected to be called
 * after normalizeBookDocument() confirms the required fields are valid.
 */
export function validateBookDocument(doc: BookDocument): void {
  const OPTIONAL_ENRICHMENT_FIELDS: Array<keyof BookDocument> = [
    'currency',
    'limitation',
    'genre_tags',
    'illustrator',
    'binding',
    'page_count',
    'publication_year',
    'raw_text',
    'description',
  ];

  const missingCount = OPTIONAL_ENRICHMENT_FIELDS.filter(
    (field) => doc[field] === undefined
  ).length;

  if (missingCount > 3) {
    console.warn(
      `[validateBookDocument] "${doc.title}" (${doc.publisher}) is missing ` +
        `${missingCount}/${OPTIONAL_ENRICHMENT_FIELDS.length} enrichment fields. ` +
        `Consider improving the scraper for richer metadata.`
    );
  }
}
