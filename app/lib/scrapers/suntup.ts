// Suntup Press — suntup.press/editions
// Two-phase strategy:
//   Phase 1: Playwright scrapes suntup.press/editions (WordPress, "LOAD MORE"
//            JS pagination) for title, status badge, and Shopify collection slug.
//   Phase 2: Shopify REST API on shop.suntup.press for price & edition variants.
// Anti-bot: low on the archive page; the Shopify shop uses standard protection.
// NOTE: Requires Playwright — run `npx playwright install chromium`.
import axios from 'axios';
import { RawBook } from '../types';
import { BaseScraper } from './base';

const ARCHIVE = 'https://suntup.press/editions';
const SHOP_BASE = 'https://shop.suntup.press';

interface ShopifyVariant {
  title: string;
  price: string;
  available: boolean;
}

interface ShopifyProduct {
  handle: string;
  title: string;
  images: Array<{ src: string }>;
  variants: ShopifyVariant[];
}

export class SuntupScraper extends BaseScraper {
  readonly publisherName = 'Suntup Press';

  async scrapeAllPages(): Promise<RawBook[]> {
    console.log('\n=== Suntup Press: phase 1 — scraping archive ===');

    let archiveEntries: Array<{ title: string; slug: string; status: string; imageUrl: string; badgeHint: string }> = [];
    try {
      archiveEntries = await this.scrapeArchive();
    } catch (err) {
      console.error('Suntup Press: Playwright archive scrape failed — skipping phase 1:', err);
      return [];
    }

    console.log(`  Found ${archiveEntries.length} editions. Phase 2 — fetching Shopify data...`);

    const books: RawBook[] = [];
    for (const entry of archiveEntries) {
      if (!entry.slug) {
        // OUT OF PRINT with no Shopify link — record as-is without an API call
        books.push(this.buildBookFromStatus(entry));
        continue;
      }
      const variants = await this.fetchShopifyVariants(entry);
      books.push(...variants);
      await this.delay(600);
    }

    console.log(`✓ Suntup Press: ${books.length} variant books`);
    return books;
  }

  private async scrapeArchive(): Promise<
    Array<{ title: string; slug: string; status: string; imageUrl: string; badgeHint: string }>
  > {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)',
    });

    try {
      await page.goto(ARCHIVE, { waitUntil: 'networkidle', timeout: 90_000 });

      // Click "LOAD MORE" until it disappears, waiting for network to settle after each click
      for (let attempt = 0; attempt < 50; attempt++) {
        const btn = page.locator('button:has-text("LOAD MORE"), a:has-text("LOAD MORE")').first();
        const visible = await btn.isVisible({ timeout: 3_000 }).catch(() => false);
        if (!visible) break;
        await btn.click();
        // Wait for the newly loaded cards to arrive before checking again
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => page.waitForTimeout(2500));
      }

      // Extract all card data in one browser-side evaluate call — avoids any
      // Playwright locator timeouts because all DOM queries are synchronous.
      const entries = await page.evaluate(() => {
        type Entry = { title: string; slug: string; status: string; imageUrl: string; badgeHint: string };
        const results: Entry[] = [];

        // Deduplicate by title so duplicate DOM nodes (rendered before/after LOAD MORE) are ignored
        const seen = new Set<string>();

        const cards = document.querySelectorAll('[class*="edition-card"], [class*="editions-item"], article');
        for (const card of cards) {
          const titleEl = card.querySelector('h3, h2');
          const title = titleEl?.textContent?.trim() ?? '';
          if (!title || seen.has(title)) continue;
          seen.add(title);

          // Status badge: IN STOCK | PRE-ORDER | OUT OF PRINT
          const badgeEl = card.querySelector('[class*="status"], [class*="badge"], [class*="tag"]');
          const badgeText = badgeEl?.textContent?.trim().toUpperCase() ?? '';

          const status =
            badgeText.includes('OUT') || badgeText.includes('PRINT')
              ? 'Sold Out'
              : badgeText.includes('PRE')
              ? 'Pre-Order'
              : 'Available';

          // Find ANY shop.suntup.press link in the card (ORDER NOW, PRE-ORDER NOW, or badge link)
          const shopAnchor = card.querySelector('a[href*="shop.suntup.press"]') as HTMLAnchorElement | null;
          const linkHref = shopAnchor?.href ?? '';
          const slugMatch = linkHref.match(/\/(?:collections|products)\/([^/?#]+)/);
          const slug = slugMatch ? slugMatch[1] : '';

          const imgEl = card.querySelector('img') as HTMLImageElement | null;
          const imageUrl = imgEl?.src ?? '';

          // Include all titles — OUT OF PRINT ones have an empty slug and will
          // fall through to buildBookFromStatus without a Shopify lookup.
          results.push({ title, slug, status, imageUrl, badgeHint: badgeText });
        }

        return results;
      });

      return entries;
    } finally {
      await browser.close();
    }
  }

  private async fetchShopifyVariants(entry: {
    title: string;
    slug: string;
    status: string;
    imageUrl: string;
    badgeHint: string;
  }): Promise<RawBook[]> {
    try {
      // Try collection endpoint first, then products
      const url = `${SHOP_BASE}/collections/${entry.slug}/products.json?limit=10`;
      const { data } = await axios.get<{ products: ShopifyProduct[] }>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });

      if (!Array.isArray(data.products) || data.products.length === 0) {
        // Fallback: treat slug as a product handle
        return [this.buildBookFromStatus(entry)];
      }

      const books: RawBook[] = [];
      for (const p of data.products) {
        for (const v of p.variants ?? []) {
          const editionInTitle = v.title !== 'Default Title' ? ` – ${v.title}` : '';
          const priceCents = parseFloat(v.price);
          const availability = v.available === false ? 'Sold Out' : entry.status;

          // Attempt to derive an edition label from the archived edition badge
          // e.g. badge "LETTERED EDITION" → appended only when variant title does not already carry it
          const badgeLower = entry.badgeHint.toLowerCase();
          let badgeSuffix = '';
          if (!editionInTitle && badgeLower) {
            if (badgeLower.includes('lettered')) badgeSuffix = ' – Lettered Edition';
            else if (badgeLower.includes('remarqued')) badgeSuffix = ' – Remarqued Edition';
            else if (badgeLower.includes('traycased') || badgeLower.includes('traycase'))
              badgeSuffix = ' – Traycased Edition';
            else if (badgeLower.includes('hand-numbered') || badgeLower.includes('numbered'))
              badgeSuffix = ' – Numbered Edition';
          }

          books.push({
            title: `${p.title}${editionInTitle}${badgeSuffix}`,
            price: `$${(priceCents / 100).toFixed(2)}`,
            availability,
            url: `${SHOP_BASE}/products/${p.handle}`,
            imageUrl: p.images?.[0]?.src ?? entry.imageUrl,
            publisher: this.publisherName,
            reviews: 0,
          });
        }
      }
      return books;
    } catch {
      return [this.buildBookFromStatus(entry)];
    }
  }

  private buildBookFromStatus(entry: {
    title: string;
    slug: string;
    status: string;
    imageUrl: string;
    badgeHint: string;
  }): RawBook {
    return {
      title: entry.title,
      price: '0',
      availability: entry.status,
      url: `${SHOP_BASE}/collections/${entry.slug}`,
      imageUrl: entry.imageUrl,
      publisher: this.publisherName,
      reviews: 0,
    };
  }
}
