// Centipede Press — centipedepress.com/books.html
// Rendering: Fully static HTML, no CMS, no bot protection. Axios + Cheerio.
// Prices are NOT shown on the catalogue page — each product page is scraped.
// Availability: "out of print" is the only signal on the catalogue page.
import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawBook } from '../types';
import { BaseScraper } from './base';

const BASE = 'https://www.centipedepress.com';
const CATALOGUE = `${BASE}/books.html`;

export class CentipedeScraper extends BaseScraper {
  readonly publisherName = 'Centipede Press';

  async scrapeAllPages(): Promise<RawBook[]> {
    console.log('\n=== Centipede Press: scraping catalogue ===');
    const books: RawBook[] = [];
    try {
      const { data } = await axios.get<string>(CATALOGUE, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });
      const $ = cheerio.load(data);

      // Catalogue entries: links whose href points to centipedepress.com product pages
      const entries: Array<{ title: string; url: string; availability: string }> = [];

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        // Product-path whitelist: only follow links that look like product pages
        const isProductPath =
          href.includes('/books/') ||
          href.includes('/store/') ||
          (href.includes('centipedepress.com') && !href.endsWith('books.html') && !href.endsWith('/'));
        if (!isProductPath) return;
        if (href.includes('books.html') || href === '/') return;
        const url = this.absoluteUrl(href, BASE);
        const title = $(el).text().trim();
        // Minimum 5 characters to skip navigation widgets
        if (!title || title.length < 5) return;

        // Detect out-of-print from surrounding text
        const surrounding = $(el).parent().text().toLowerCase();
        const availability = surrounding.includes('out of print') ? 'Sold Out' : 'Available';

        if (!entries.find((e) => e.url === url)) {
          entries.push({ title, url, availability });
        }
      });

      console.log(`  Found ${entries.length} entries. Fetching prices...`);

      for (const entry of entries) {
        const raw = await this.scrapeProductPage(entry);
        if (raw) books.push(raw);
        await this.delay(800);
      }
    } catch (err) {
      console.error('Centipede Press catalogue error:', err);
    }
    console.log(`✓ Centipede Press: ${books.length} books`);
    return books;
  }

  private async scrapeProductPage(entry: {
    title: string;
    url: string;
    availability: string;
  }): Promise<RawBook | null> {
    try {
      const { data } = await axios.get<string>(entry.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });
      const $ = cheerio.load(data);

      const rawBodyText = $('body').text().trim();

      // Price: labeled element first, then anchored regex (last resort)
      const labeledPrice =
        $('.price, [class*="price"], [itemprop="price"]').first().text().trim();
      let price = '0';
      if (labeledPrice && /\$[\d,]+/.test(labeledPrice)) {
        price = labeledPrice;
      } else {
        // Anchored fallback: look for "Price: $NNN" pattern to reduce noise
        const anchoredMatch = rawBodyText.match(/price[^\d]*\$(([\d,]+(?:\.\d{2})?))/i);
        const genericMatch = rawBodyText.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
        const m = anchoredMatch ?? genericMatch;
        if (m) price = `$${m[1]}`;
      }

      // Consolidate availability from page text
      const pageText = rawBodyText.toLowerCase();
      const availability =
        entry.availability === 'Sold Out' ||
        pageText.includes('out of print') ||
        pageText.includes('sold out')
          ? 'Sold Out'
          : 'Available';

      const imageUrl =
        $('img[src*="centipede"], img[src*="/books"], .product img').first().attr('src') ?? '';

      return {
        title: entry.title,
        price,
        availability,
        url: entry.url,
        imageUrl: this.absoluteUrl(imageUrl, BASE),
        publisher: this.publisherName,
        reviews: 0,
        // raw_text populated here; base cleanData will carry it through if RawBook exposes it
        // (stored structurally but not yet part of RawBook interface — see types.ts)
      };
    } catch {
      return {
        title: entry.title,
        price: '0',
        availability: entry.availability,
        url: entry.url,
        imageUrl: '',
        publisher: this.publisherName,
        reviews: 0,
      };
    }
  }
}
