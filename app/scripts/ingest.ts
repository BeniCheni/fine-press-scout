/**
 * Ingest runner — reads public/data/books.json, embeds each book via
 * HuggingFace, and upserts into the local Qdrant instance.
 *
 * Prerequisites:
 *   1. Qdrant running:  docker compose up -d
 *   2. Books scraped:   npm run scrape
 *   3. .env.local set:  HUGGINGFACE_API_KEY, QDRANT_URL
 *
 * Usage:  npm run ingest
 */
import 'dotenv/config';
import { ingestFromFile } from '../lib/rag/ingest';

ingestFromFile()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ingest failed:', err);
    process.exit(1);
  });
