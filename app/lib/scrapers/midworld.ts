// MidWorld Press — midworldpress.com/store
// Rendering: Squarespace store. Static HTML for catalogue. Axios + Cheerio.
// Prices scraped from individual product pages. Availability: use category
// filter URLs (?category=In+Stock etc.) and the tag-nocart Squarespace signal.
// Anti-bot: low-to-moderate (Squarespace; may rate-limit on fast requests).
import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawBook } from '../types';
import { BaseScraper } from './base';

const BASE = 'https://www.midworldpress.com';
const STORE = `${BASE}/store`;

export class MidworldScraper extends BaseScraper {
  readonly publisherName = 'MidWorld Press';

  async scrapeAllPages(): Promise<RawBook[]> {
    console.log('\n=== MidWorld Press: scraping store ===');

    // Fetch in-stock and sold-out sections separately for accurate availability
    const [inStock, soldOut] = await Promise.all([
      this.fetchCategory(`${STORE}?sort=newest`, 'Available'),
      this.fetchCategory(`${STORE}?category=Sold+Out`, 'Sold Out'),
    ]);

    const seen = new Set<string>();
    const entries: Array<{ title: string; url: string; availability: string; imageUrl: string }> = [];
    for (const e of [...inStock, ...soldOut]) {
      if (!seen.has(e.url)) {
        seen.add(e.url);
        entries.push(e);
      }
    }

    console.log(`  Found ${entries.length} products. Fetching prices...`);

    const books: RawBook[] = [];
    for (const entry of entries) {
      const raw = await this.scrapeProductPage(entry);
      if (raw) books.push(raw);
      await this.delay(800);
    }

    console.log(`✓ MidWorld Press: ${books.length} books`);
    return books;
  }

  private async fetchCategory(
    url: string,
    defaultAvailability: string
  ): Promise<Array<{ title: string; url: string; availability: string; imageUrl: string }>> {
    try {
      const { data } = await axios.get<string>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });
      const $ = cheerio.load(data);
      const results: Array<{ title: string; url: string; availability: string; imageUrl: string }> = [];

      $('a[href*="/store/p/"]').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        const productUrl = this.absoluteUrl(href, BASE);
        const title = $(el).text().trim() || $(el).find('img').attr('alt')?.trim() || '';
        const imageUrl = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
        // tag-nocart class indicates no buy button = sold out
        const hasSoldOutTag =
          $(el).hasClass('tag-nocart') || $(el).closest('[class*="nocart"]').length > 0;
        const availability = hasSoldOutTag ? 'Sold Out' : defaultAvailability;
        if (productUrl && !results.find((r) => r.url === productUrl)) {
          results.push({ title, url: productUrl, availability, imageUrl: this.absoluteUrl(imageUrl, BASE) });
        }
      });
      return results;
    } catch {
      return [];
    }
  }

  private async scrapeProductPage(entry: {
    title: string;
    url: string;
    availability: string;
    imageUrl: string;
  }): Promise<RawBook | null> {
    try {
      const { data } = await axios.get<string>(entry.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
      });
      const $ = cheerio.load(data);

      const rawBodyText = $('body').text().trim();

      // Squarespace product price — ordered preference: labeled element → anchored regex
      const labeledPrice =
        $('[class*="product-price"], [data-price], .price').first().text().trim();
      let priceText = '0';
      if (labeledPrice && /[\d]/.test(labeledPrice)) {
        priceText = labeledPrice;
      } else {
        // Anchored regex: look for label context to reduce noise
        const anchoredMatch = rawBodyText.match(/price[^\d]*\$([\d,]+\.?\d*)/i);
        const genericMatch = rawBodyText.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
        const m = anchoredMatch ?? genericMatch;
        if (m) priceText = `$${m[1]}`;
      }

      // Always prefer h1 text over catalogue link text for title accuracy
      const title = $('h1').first().text().trim() || entry.title;

      const imageUrl =
        $('[class*="product"] img, .ProductItem img').first().attr('src') ||
        entry.imageUrl;

      const pageText = rawBodyText.toLowerCase();
      const availability =
        entry.availability === 'Sold Out' || pageText.includes('sold out')
          ? 'Sold Out'
          : 'Available';

      return {
        title,
        price: priceText,
        availability,
        url: entry.url,
        imageUrl: this.absoluteUrl(imageUrl, BASE),
        publisher: this.publisherName,
        reviews: 0,
      };
    } catch {
      return {
        title: entry.title,
        price: '0',
        availability: entry.availability,
        url: entry.url,
        imageUrl: entry.imageUrl,
        publisher: this.publisherName,
        reviews: 0,
      };
    }
  }
}
