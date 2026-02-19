// Conversation Tree Press — Shopify REST API scraper extending BaseScraper.
// Uses /collections/all/products.json (no HTML parsing required).
// Anti-bot: none — public Shopify REST endpoint.
import axios from 'axios';
import { RawBook } from '../types';
import { BaseScraper } from './base';

interface ShopifyVariant {
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

      return data.products.map((p) => {
        const v = p.variants?.[0];
        const priceCents = v ? parseFloat(v.price) : 0;
        return {
          title: p.title,
          price: `$${(priceCents / 100).toFixed(2)}`,
          availability: v?.available === false ? 'Sold Out' : 'Available',
          url: `https://conversationtreepress.com/products/${p.handle}`,
          imageUrl: this.normalizeShopifyImage(p.images?.[0]?.src ?? ''),
          publisher: this.publisherName,
          reviews: 0,
        };
      });
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
