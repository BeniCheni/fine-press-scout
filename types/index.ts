import { z } from 'zod';

export const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url(),
  publisher: z.string(),
  author: z.string().optional(),
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
  scrapedAt: z.string().datetime(),
  rawText: z.string(),
});

export type Document = z.infer<typeof DocumentSchema>;

export const ChunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  embedding: z.array(z.number()).length(384),
  payload: z.object({
    bookId: z.string(),
    title: z.string(),
    author: z.string().optional(),
    publisher: z.string(),
    price: z.number().nullable(),
    editionType: z.string().nullable(),
    availability: z.string().nullable(),
    genreTags: z.array(z.string()),
    url: z.string(),
    chunkIndex: z.number(),
  }),
});

export type Chunk = z.infer<typeof ChunkSchema>;
