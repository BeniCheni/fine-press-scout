// Conversation Tree Press is a Shopify store. Data is pulled from the public
// REST API (/collections/all/products.json) rather than HTML scraping —
// faster, more stable, and returns structured availability data.
//
// @deprecated This standalone class is superseded by
//   app/lib/scrapers/conversation-tree.ts which extends BaseScraper.
//   Retained for reference only — do not add new features here.
import axios from 'axios';
import { RawBook, BookDocument, EditionType } from './types';

const PUBLISHER_NAME = 'Conversation Tree Press';

interface ShopifyVariant {
  price: string;    // cents as string, e.g. "4500"
  available: boolean;
}

interface ShopifyProduct {
  handle: string;
  title: string;
  body_html: string;
  images: Array<{ src: string }>;
  variants: ShopifyVariant[];
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

export class ConversationTreeScraper {
  private apiBase = 'https://conversationtreepress.com/collections/all/products.json';
  private books: RawBook[] = [];

  /**
   * Scrape all pages from Conversation Tree Press using the Shopify REST API.
   * Paginates via ?page=N until the endpoint returns an empty products array.
   */
  async scrapeAllPages(): Promise<RawBook[]> {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      console.log(`\n=== Scraping page ${page} ===`);
      const pageBooks = await this.scrapePage(page);

      if (pageBooks.length === 0) {
        console.log('No products found on this page. Stopping.');
        hasNextPage = false;
      } else {
        this.books.push(...pageBooks);
        console.log(`✓ Scraped ${pageBooks.length} products`);
        page++;

        await this.delay(1000);
      }
    }

    console.log(`\n✓ Total products scraped: ${this.books.length}`);
    return this.books;
  }

  /**
   * Fetch one page from the Shopify products.json REST endpoint.
   * variant.available (boolean) fixes the old hard-coded 'Available' bug.
   */
  private async scrapePage(page: number): Promise<RawBook[]> {
    try {
      const url = `${this.apiBase}?limit=250&page=${page}`;
      const { data } = await axios.get<ShopifyProductsResponse>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });

      if (!Array.isArray(data.products) || data.products.length === 0) return [];

      return data.products.map((p) => {
        const variant = p.variants?.[0];
        const priceCents = variant ? parseFloat(variant.price) : 0;
        const priceText = `$${(priceCents / 100).toFixed(2)}`;
        const availability = variant?.available === false ? 'Sold Out' : 'Available';
        const productUrl = `https://conversationtreepress.com/products/${p.handle}`;
        const imageUrl = this.normalizeImageUrl(p.images?.[0]?.src ?? '');

        return {
          title: p.title,
          price: priceText,
          availability,
          url: productUrl,
          imageUrl,
          publisher: PUBLISHER_NAME,
          reviews: 0,
        };
      });
    } catch (error) {
      console.error(`Error scraping page ${page}:`, error);
      return [];
    }
  }

  /**
   * Clean and normalize data
   */
  cleanData(rawBooks: RawBook[]): BookDocument[] {
    return rawBooks.map((raw, index) => {
      const author = this.extractAuthor(raw.title);
      const edition_type = this.extractEdition(raw.title);
      const priceNumeric = this.parsePrice(raw.price);
      const description = this.createDescription(raw, author);
      const availRaw = raw.availability.toLowerCase();
      const availability: BookDocument['availability'] =
        availRaw.includes('sold') || availRaw.includes('out of')
          ? 'sold_out'
          : availRaw.includes('pre')
          ? 'preorder'
          : 'in_print';

      return {
        id: `book_${index}`,
        title: raw.title,
        author,
        price: priceNumeric,
        availability,
        edition_type,
        description,
        url: raw.url,
        imageUrl: raw.imageUrl,
        publisher: raw.publisher ?? 'Unknown',
        reviews: raw.reviews || 0,
        scraped_at: new Date().toISOString(),
      };
    });
  }

  /**
   * Extract author from title (format: "Title by Author")
   */
  private extractAuthor(title: string): string {
    const match = title.match(/by\s+([A-Za-z\s\.]+)(?:\s*-|$)/);
    return match ? match[1].trim() : 'Unknown';
  }

  /**
   * Extract edition type from title.
   * Priority: Remarqued > Traycased > Hand-numbered > Lettered > Deluxe > Collector > Standard
   * Synonyms follow fine-press collecting vocabulary.
   */
  private extractEdition(title: string): import('./types').EditionType {
    const t = title.toLowerCase();
    if (t.includes('remarqued')) return 'Remarqued';
    if (t.includes('traycased') || t.includes('traycase')) return 'Traycased';
    if (t.includes('hand-numbered') || t.includes('hand numbered') || t.includes('numbered')) return 'Hand-numbered';
    if (t.includes('lettered')) return 'Lettered';
    if (t.includes('deluxe')) return 'Deluxe';
    if (t.includes('collector') || t.includes('signed') || t.includes('limited')) return 'Collector';
    return 'Standard';
  }

  /**
   * Parse price string to number
   */
  private parsePrice(priceStr: string): number {
    const match = priceStr.match(/[\d,]+\.?\d*/);
    if (!match) return 0;
    return parseFloat(match[0].replace(/,/g, ''));
  }

  /**
   * Create rich description for embedding
   */
  private createDescription(raw: RawBook, author: string): string {
    const parts = [
      `Title: ${raw.title}`,
      `Author: ${author}`,
      `Price: ${raw.price}`,
      `Availability: ${raw.availability}`,
      `Edition: ${this.extractEdition(raw.title)}`,
    ];
    return parts.join('. ');
  }

  /**
   * Normalize image URL (handle Shopify CDN)
   */
  private normalizeImageUrl(url: string): string {
    if (!url) return '';
    // Add query params to optimize image loading
    if (url.includes('cdn.shopify.com') && !url.includes('?')) {
      return `${url}?v=1&width=400`;
    }
    return url;
  }

  /**
   * Helper: delay for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Quick helper function to run scraper standalone
 */
export async function runScraper(): Promise<BookDocument[]> {
  const scraper = new ConversationTreeScraper();
  const rawBooks = await scraper.scrapeAllPages();
  const cleanedBooks = scraper.cleanData(rawBooks);
  return cleanedBooks;
}
