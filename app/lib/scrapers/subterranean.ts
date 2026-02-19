// Subterranean Press — subterraneanpress.com/all-books
// Rendering: BigCommerce. Initial HTML is static but full catalogue requires
// "Load More" JS pagination. Strategy: Playwright for full catalogue fetch.
// Anti-bot: moderate (BigCommerce; no Cloudflare observed).
// NOTE: Requires Playwright browsers — run `npx playwright install chromium`.
import { RawBook } from '../types';
import { BaseScraper } from './base';

const CATALOGUE = 'https://subterraneanpress.com/all-books';
const BASE = 'https://subterraneanpress.com';

export class SubterraneanScraper extends BaseScraper {
  readonly publisherName = 'Subterranean Press';

  async scrapeAllPages(): Promise<RawBook[]> {
    console.log('\n=== Subterranean Press: scraping with Playwright ===');
    // Lazy import so the module loads even when Playwright is absent
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)',
    });

    const books: RawBook[] = [];
    try {
      await page.goto(CATALOGUE, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // Click "Load More" until it disappears
      let loadMore = true;
      while (loadMore) {
        const btn = page.locator('a:has-text("Load More"), button:has-text("Load More")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1500);
        } else {
          loadMore = false;
        }
      }

      // Parse all product cards
      const cards = await page.locator(
        'article.productCard, li[data-product-id], .productCard, [class*="product-card"]'
      ).all();

      for (const card of cards) {
        try {
          const titleEl = card.locator('h2, h3, [class*="title"]').first();
          const title = (await titleEl.textContent())?.trim() ?? '';
          if (!title) continue;

          const linkEl = card.locator('a').first();
          const href = (await linkEl.getAttribute('href')) ?? '';
          const url = this.absoluteUrl(href, BASE);

          // Price: look for a price element or parse from link title
          const priceEl = card.locator('[class*="price"], .price').first();
          const priceText = ((await priceEl.textContent()) ?? '').trim();

          // Extract lead price from ranges like "$60.00–$850.00"
          const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
          const price = priceMatch ? `$${priceMatch[1]}` : '0';

          const soldOutEl = card.locator('.soldOut, [class*="sold-out"], [class*="soldOut"]').first();
          const availability = (await soldOutEl.count()) > 0 ? 'Sold Out' : 'Available';

          const imgEl = card.locator('img').first();
          const imageUrl = (await imgEl.getAttribute('src')) ?? '';

          books.push({ title, price, availability, url, imageUrl, publisher: this.publisherName, reviews: 0 });
        } catch {
          // skip malformed cards
        }
      }
    } finally {
      await browser.close();
    }
    console.log(`✓ Subterranean Press: ${books.length} books`);
    return books;
  }
}
