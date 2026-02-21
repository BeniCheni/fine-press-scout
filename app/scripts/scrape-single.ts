/**
 * Single-publisher scraper — runs exactly one publisher scraper and writes
 * its output to public/data/books-{publisher}.json.
 *
 * Usage:  tsx app/scripts/scrape-single.ts <publisher-key>
 *
 * Publisher keys:
 *   conversation-tree | curious-king | subterranean | centipede |
 *   midworld | suntup | zagava
 */
import * as fs from 'fs';
import * as path from 'path';
import { BookDocument } from '../lib/types';
import { normalizeBookDocument, validateBookDocument } from '../lib/utils/normalizer';
import { BaseScraper } from '../lib/scrapers/base';
import { ConversationTreeScraper } from '../lib/scrapers/conversation-tree';
import { CuriousKingScraper } from '../lib/scrapers/curious-king';
import { SubterraneanScraper } from '../lib/scrapers/subterranean';
import { CentipedeScraper } from '../lib/scrapers/centipede';
import { MidworldScraper } from '../lib/scrapers/midworld';
import { SuntupScraper } from '../lib/scrapers/suntup';
import { ZagavaScraper } from '../lib/scrapers/zagava';

const SCRAPERS: Record<string, () => BaseScraper> = {
  'conversation-tree': () => new ConversationTreeScraper(),
  'curious-king':      () => new CuriousKingScraper(),
  'subterranean':      () => new SubterraneanScraper(),
  'centipede':         () => new CentipedeScraper(),
  'midworld':          () => new MidworldScraper(),
  'suntup':            () => new SuntupScraper(),
  'zagava':            () => new ZagavaScraper(),
};

async function main() {
  const key = process.argv[2]?.toLowerCase();

  if (!key || !(key in SCRAPERS)) {
    console.error(`Usage: tsx app/scripts/scrape-single.ts <publisher-key>`);
    console.error(`Valid keys: ${Object.keys(SCRAPERS).join(', ')}`);
    process.exit(1);
  }

  const scraper = SCRAPERS[key]();
  console.log(`Fine Press Scout — scraping ${scraper.publisherName}…\n`);

  const raw = await scraper.scrapeAllPages();
  const cleaned = scraper.cleanData(raw);

  const books: BookDocument[] = [];
  for (const book of cleaned) {
    try {
      const normalized = normalizeBookDocument(book);
      validateBookDocument(normalized);
      books.push(normalized);
    } catch (err) {
      console.warn(`  ⚠ Skipping malformed record:`, err);
    }
  }

  // Stable IDs scoped to this publisher run
  const finalBooks: BookDocument[] = books.map((b, idx) => ({ ...b, id: `book_${idx}` }));

  const outputPath = path.join(process.cwd(), 'public', 'data', `books-${key}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(finalBooks, null, 2));

  console.log(`\n✓ Saved ${finalBooks.length} books to ${outputPath}`);
  if (finalBooks.length > 0) {
    console.log('\nSample:');
    console.log(JSON.stringify(finalBooks[0], null, 2));
  }
}

main().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
