// Conversation Tree Press — Shopify REST API scraper extending BaseScraper.
// Uses /collections/all/products.json (no HTML parsing required).
// Anti-bot: none — public Shopify REST endpoint.
import axios from 'axios';
import { RawBook } from '../types';
import { BaseScraper } from './base';

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

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

export class ConversationTreeScraper extends BaseScraper {
  readonly publisherName = 'Conversation Tree Press';
  private apiBase = 'https://conversationtreepress.com/collections/all/products.json';

  async scrapeAllPages(): Promise<RawBook[]> {
    const books: RawBook[] = [];
    let page = 1;

    while (true) {
      console.log(`\n=== Conversation Tree Press: page ${page} ===`);
      const pageBooks = await this.scrapePage(page);
      if (pageBooks.length === 0) break;
      books.push(...pageBooks);
      console.log(`✓ Scraped ${pageBooks.length} products`);
      page++;
      await this.delay(1000);
    }

    console.log(`✓ Conversation Tree Press: ${books.length} total`);
    return books;
  }

  private async scrapePage(page: number): Promise<RawBook[]> {
    try {
      const url = `${this.apiBase}?limit=250&page=${page}`;
      const { data } = await axios.get<ShopifyProductsResponse>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });
      if (!Array.isArray(data.products) || data.products.length === 0) return [];

      const books: RawBook[] = [];
      for (const p of data.products) {
        // Emit one RawBook per variant so edition/price variants are preserved
        for (const v of p.variants ?? []) {
          const priceCents = parseFloat(v.price);
          // Append variant title when it carries edition information
          const editionSuffix =
            v.title && v.title !== 'Default Title' ? ` – ${v.title}` : '';
          books.push({
            title: `${p.title}${editionSuffix}`,
            price: `$${(priceCents / 100).toFixed(2)}`,
            availability: v.available === false ? 'Sold Out' : 'Available',
            url: `https://conversationtreepress.com/products/${p.handle}`,
            imageUrl: this.normalizeShopifyImage(p.images?.[0]?.src ?? ''),
            publisher: this.publisherName,
            reviews: 0,
          });
        }
      }
      return books;
    } catch (err) {
      console.error(`Conversation Tree Press page ${page} error:`, err);
      return [];
    }
  }

  private normalizeShopifyImage(url: string): string {
    if (!url) return '';
    if (url.includes('cdn.shopify.com') && !url.includes('?')) return `${url}?v=1&width=400`;
    return url;
  }
}
