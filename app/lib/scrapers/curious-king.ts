// Curious King — curiousking.co.uk/books
// Rendering: WordPress + custom theme. Static HTML — Axios + Cheerio.
// Prices are NOT shown on the catalogue page; each product page is scraped
// for the price. Anti-bot: low risk (standard WordPress, no Cloudflare).
import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawBook } from '../types';
import { BaseScraper } from './base';

const BASE = 'https://curiousking.co.uk';
const CATALOGUE = `${BASE}/books`;

export class CuriousKingScraper extends BaseScraper {
  readonly publisherName = 'Curious King';

  async scrapeAllPages(): Promise<RawBook[]> {
    console.log('\n=== Curious King: scraping catalogue ===');
    const books: RawBook[] = [];
    try {
      const { data } = await axios.get<string>(CATALOGUE, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });
      const $ = cheerio.load(data);

      // Collect all book links from the catalogue page
      const entries: Array<{ title: string; url: string; imageUrl: string }> = [];
      $('a[href*="/book/"]').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        const url = this.absoluteUrl(href, BASE);
        // Title lives in nearby h3 or the link text
        const rawLinkText = $(el).text().trim();
        // Only accept link text as title when it is long enough and not navigation noise
        const isValidTitle =
          rawLinkText.length >= 10 &&
          !/(view|read|buy|more|shop|here)/i.test(rawLinkText);
        const title =
          $(el).find('h3').text().trim() ||
          $(el).closest('article, li, .book-item').find('h3').text().trim() ||
          (isValidTitle ? rawLinkText : '');
        const imageUrl =
          $(el).find('img').attr('src') ||
          $(el).closest('article, li, .book-item').find('img').attr('src') ||
          '';
        if (url && title && !entries.find((e) => e.url === url)) {
          entries.push({ title, url, imageUrl: this.absoluteUrl(imageUrl, BASE) });
        }
      });

      console.log(`  Found ${entries.length} book links. Fetching prices...`);

      for (const entry of entries) {
        const raw = await this.scrapeProductPage(entry);
        if (raw) books.push(raw);
        await this.delay(800);
      }
    } catch (err) {
      console.error('Curious King catalogue error:', err);
    }
    console.log(`✓ Curious King: ${books.length} books`);
    return books;
  }

  private async scrapeProductPage(entry: {
    title: string;
    url: string;
    imageUrl: string;
  }): Promise<RawBook | null> {
    try {
      const { data } = await axios.get<string>(entry.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });
      const $ = cheerio.load(data);

      // Price: look for common WooCommerce/custom price patterns
      const priceText =
        $('.price, .woocommerce-Price-amount, [class*="price"]').first().text().trim() ||
        $('[class*="Price"]').first().text().trim() ||
        '0';

      // Detect GBP currency from raw price text
      const currency: string | undefined = priceText.includes('\u00a3') ? 'GBP' : undefined;

      // Availability: look for add-to-cart button or "sold out" text
      const pageText = $('body').text().toLowerCase();
      const availability =
        pageText.includes('sold out') || pageText.includes('out of stock')
          ? 'Sold Out'
          : 'Available';

      // Better image from the product page
      const imageUrl =
        $('.woocommerce-product-gallery img, .product-image img, [class*="product"] img')
          .first()
          .attr('src') ||
        entry.imageUrl;

      return {
        title: entry.title,
        price: priceText || '0',
        availability,
        url: entry.url,
        imageUrl: this.absoluteUrl(imageUrl, BASE),
        publisher: this.publisherName,
        reviews: 0,
        ...(currency ? { currency } : {}),
      };
    } catch {
      // Page request failed — availability is unknown; use 'sold_out' conservatively
      return {
        title: entry.title,
        price: '0',
        availability: 'sold_out',
        url: entry.url,
        imageUrl: entry.imageUrl,
        publisher: this.publisherName,
        reviews: 0,
      };
    }
  }
}
