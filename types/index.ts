import { z } from 'zod';

export const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().optional(),
  publisher: z.string(),
  url: z.url(),
  description: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  editionType: z.enum(['trade', 'limited', 'lettered', 'artist']).optional(),
  limitation: z.string().optional(),
  availability: z.enum(['in_print', 'sold_out', 'preorder']).optional(),
  genreTags: z.array(z.string()).optional(),
  illustrator: z.string().optional(),
  binding: z.string().optional(),
  pageCount: z.number().optional(),
  publicationYear: z.number().optional(),
  scrapedAt: z.iso.datetime(),
  rawText: z.string(),
});

export type Document = z.infer<typeof DocumentSchema>;

export const ChunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  embedding: z.array(z.number()).length(384), // HuggingFace all-MiniLM-L6-v2 maps text into a 384-dimensional dense vector
  payload: z.object({
    bookId: z.string(),
    title: z.string(),
    author: z.string().optional(),
    publisher: z.string(),
    price: z.number().nullable(),
    currency: z.string().nullable(),
    editionType: z.string().nullable(),
    availability: z.string().nullable(),
    genreTags: z.array(z.string()).optional(),
    url: z.url(),
    chunkIndex: z.number(),
  }),
});

export type Chunk = z.infer<typeof ChunkSchema>;

export const EnvSchema = z.object({
  QDRANT_URL: z.url(),
  HUGGINGFACE_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

export function validateEnv() {
  const result = EnvSchema.safeParse({
    QDRANT_URL: process.env.QDRANT_URL,
    HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!result.success) {
    console.error(
      'Environment validation failed:',
      z.prettifyError(result.error)
    );
    throw new Error(
      `Missing or invalid environment variables: ${result.error.issues
        .map((i) => i.path.join('.'))
        .join(', ')}`
    );
  }

  return result.data;
}
