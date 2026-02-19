/**
 * Scrape orchestrator — runs all six publisher scrapers in parallel,
 * merges and cleans results, then writes public/data/books.json.
 *
 * Usage:  npm run scrape
 */
import * as fs from 'fs';
import * as path from 'path';
import { CleanedBook } from '../lib/types';
import { ConversationTreeScraper } from '../lib/scrapers/conversation-tree';
import { CuriousKingScraper } from '../lib/scrapers/curious-king';
import { SubterraneanScraper } from '../lib/scrapers/subterranean';
import { CentipedeScraper } from '../lib/scrapers/centipede';
import { MidworldScraper } from '../lib/scrapers/midworld';
import { SuntupScraper } from '../lib/scrapers/suntup';

async function main() {
  console.log('Fine Press Scout — scraping all publishers…\n');

  const scrapers = [
    new ConversationTreeScraper(),
    new CuriousKingScraper(),
    new SubterraneanScraper(),
    new CentipedeScraper(),
    new MidworldScraper(),
    new SuntupScraper(),
  ];

  // Run all scrapers in parallel; failures are isolated per publisher
  const results = await Promise.allSettled(
    scrapers.map(async (scraper) => {
      const raw = await scraper.scrapeAllPages();
      return scraper.cleanData(raw);
    })
  );

  const allBooks: CleanedBook[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      allBooks.push(...r.value);
    } else {
      console.error(`✗ ${scrapers[i].publisherName} failed:`, r.reason);
    }
  }

  // Re-assign stable IDs now that all publishers are merged
  const finalBooks = allBooks.map((b, idx) => ({ ...b, id: `book_${idx}` }));

  const outputPath = path.join(process.cwd(), 'public', 'data', 'books.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(finalBooks, null, 2));

  console.log(`\n✓ Saved ${finalBooks.length} books to ${outputPath}`);
  if (finalBooks.length > 0) {
    console.log('\nSample:');
    console.log(JSON.stringify(finalBooks[0], null, 2));
  }
}

main().catch((err) => {
  console.error('Scraper orchestrator failed:', err);
  process.exit(1);
});

