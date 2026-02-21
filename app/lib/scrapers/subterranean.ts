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
      await page.goto(CATALOGUE, { waitUntil: 'networkidle', timeout: 90_000 });

      // Click "Load More" until it disappears, waiting for network to settle after each click
      for (let attempt = 0; attempt < 50; attempt++) {
        const btn = page.locator('a:has-text("Load More"), button:has-text("Load More")').first();
        const visible = await btn.isVisible({ timeout: 3_000 }).catch(() => false);
        if (!visible) break;
        await btn.click();
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => page.waitForTimeout(2000));
      }

      // Extract all card data in one browser-side evaluate — avoids any per-element
      // Playwright locator timeouts because all DOM queries are synchronous.
      type CardData = { title: string; href: string; price: string; availability: string; imageUrl: string };
      const cards: CardData[] = await page.evaluate((base: string) => {
        const results: CardData[] = [];
        const seen = new Set<string>();
        const cardEls = document.querySelectorAll(
          'article.productCard, [data-product-id], li.product, .productCard, [class*="product-card"]'
        );

        for (const card of cardEls) {
          const titleEl = card.querySelector('h2, h3, [class*="title"]');
          const title = titleEl?.textContent?.trim() ?? '';
          if (!title || seen.has(title)) continue;
          seen.add(title);

          // Prefer product-path links
          const productAnchor =
            (card.querySelector('a[href*="/product/"]') as HTMLAnchorElement | null) ??
            (card.querySelector('a') as HTMLAnchorElement | null);
          const href = productAnchor?.href ?? '';

          const priceEl = card.querySelector('[class*="price"], .price');
          const priceText = priceEl?.textContent?.trim() ?? '';
          const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
          const price = priceMatch ? `$${priceMatch[1]}` : '0';

          const soldOut = !!card.querySelector('.soldOut, [class*="sold-out"], [class*="soldOut"]');
          const availability = soldOut ? 'Sold Out' : 'Available';

          const imgEl = card.querySelector('img') as HTMLImageElement | null;
          const imageUrl = imgEl?.src ?? '';

          results.push({ title, href, price, availability, imageUrl });
        }
        return results;
      }, BASE);

      for (const c of cards) {
        const url = c.href.startsWith('http') ? c.href : this.absoluteUrl(c.href, BASE);
        if (!url) continue;
        books.push({
          title: c.title,
          price: c.price,
          availability: c.availability,
          url,
          imageUrl: c.imageUrl,
          publisher: this.publisherName,
          reviews: 0,
        });
      }
    } finally {
      await browser.close();
    }
    console.log(`✓ Subterranean Press: ${books.length} books`);
    return books;
  }
}
