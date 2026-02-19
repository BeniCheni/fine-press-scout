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

    const archiveEntries = await this.scrapeArchive();
    console.log(`  Found ${archiveEntries.length} editions. Phase 2 — fetching Shopify data...`);

    const books: RawBook[] = [];
    for (const entry of archiveEntries) {
      const variants = await this.fetchShopifyVariants(entry);
      books.push(...variants);
      await this.delay(600);
    }

    console.log(`✓ Suntup Press: ${books.length} variant books`);
    return books;
  }

  private async scrapeArchive(): Promise<
    Array<{ title: string; slug: string; status: string; imageUrl: string }>
  > {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)',
    });

    const entries: Array<{ title: string; slug: string; status: string; imageUrl: string }> = [];

    try {
      await page.goto(ARCHIVE, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // Click "LOAD MORE" until it is gone
      let more = true;
      while (more) {
        const btn = page.locator('button:has-text("LOAD MORE"), a:has-text("LOAD MORE")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1500);
        } else {
          more = false;
        }
      }

      // Parse edition cards
      const cards = await page
        .locator('[class*="edition-card"], [class*="editions-item"], article')
        .all();

      for (const card of cards) {
        const titleText = (await card.locator('h3, h2').first().textContent())?.trim() ?? '';
        if (!titleText) continue;

        // Status badge: IN STOCK | PRE-ORDER | OUT OF PRINT
        const badgeText = (
          await card.locator('[class*="status"], [class*="badge"], [class*="tag"]').first().textContent()
        )?.trim().toUpperCase() ?? '';

        const status =
          badgeText.includes('OUT') || badgeText.includes('PRINT')
            ? 'Sold Out'
            : 'Available';

        // Extract Shopify collection/product slug from the ORDER NOW link
        const linkHref =
          (await card.locator('a[href*="shop.suntup.press"]').first().getAttribute('href')) ?? '';
        const slugMatch = linkHref.match(/\/(?:collections|products)\/([^/?]+)/);
        const slug = slugMatch ? slugMatch[1] : '';

        const imageUrl =
          (await card.locator('img').first().getAttribute('src')) ?? '';

        if (slug) entries.push({ title: titleText, slug, status, imageUrl });
      }
    } finally {
      await browser.close();
    }
    return entries;
  }

  private async fetchShopifyVariants(entry: {
    title: string;
    slug: string;
    status: string;
    imageUrl: string;
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
          const editionInTitle = v.title !== 'Default Title' ? ` - ${v.title}` : '';
          const priceCents = parseFloat(v.price);
          const availability = v.available === false ? 'Sold Out' : entry.status;
          books.push({
            title: `${p.title}${editionInTitle}`,
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
