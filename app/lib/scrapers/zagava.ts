// Zagava — zagava.de/shop/
// German fine press publisher specialising in deluxe illustrated editions.
// Rendering: server-rendered HTML (WordPress/WooCommerce). Axios + Cheerio.
// Anti-bot: low risk; no Cloudflare observed on static catalogue.
// TINYFISH_CANDIDATE: If live testing reveals JS-heavy product pages
//   (e.g., Elementor popups for pricing), migrate to Playwright.
import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawBook } from '../types';
import { BaseScraper } from './base';

const BASE = 'https://www.zagava.de';
const SHOP = `${BASE}/shop/`;

export class ZagavaScraper extends BaseScraper {
  readonly publisherName = 'Zagava';

  async scrapeAllPages(): Promise<RawBook[]> {
    console.log('\n=== Zagava: scraping catalogue ===');
    const books: RawBook[] = [];
    try {
      const productUrls = await this.collectProductUrls();
      console.log(`  Found ${productUrls.length} product links. Fetching details...`);

      for (const url of productUrls) {
        const raw = await this.scrapeProductPage(url);
        if (raw) books.push(raw);
        // 800 ms delay — polite crawling on a small independent publisher's server
        await this.delay(800);
      }
    } catch (err) {
      console.error('Zagava catalogue error:', err);
    }
    console.log(`✓ Zagava: ${books.length} books`);
    return books;
  }

  /** Collect all product page URLs from the shop catalogue. */
  private async collectProductUrls(): Promise<string[]> {
    const urls: string[] = [];
    let page = 1;

    while (true) {
      const pageUrl = page === 1 ? SHOP : `${SHOP}page/${page}/`;
      try {
        const { data } = await axios.get<string>(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
          timeout: 15_000,
        });
        const $ = cheerio.load(data);

        // WooCommerce product links follow the /shop/[slug]/ pattern
        const found: string[] = [];
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href') ?? '';
          // Product pages: direct children of /shop/ with a slug, not category pages
          const match = href.match(/^https?:\/\/(?:www\.)?zagava\.de\/shop\/([^/]+)\/?$/);
          if (match && !urls.includes(href) && !found.includes(href)) {
            found.push(href);
          }
        });

        if (found.length === 0) break; // No new products on this page — done
        urls.push(...found);
        page++;
        await this.delay(500);
      } catch {
        break;
      }
    }

    return urls;
  }

  private async scrapeProductPage(productUrl: string): Promise<RawBook | null> {
    try {
      const { data } = await axios.get<string>(productUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinePressScraper/1.0)' },
        timeout: 15_000,
      });
      const $ = cheerio.load(data);

      // Title from h1 (WooCommerce product title)
      const title = $('h1.product_title, h1').first().text().trim();
      if (!title) return null;

      // Price: prefer WooCommerce structured elements before generic fallback
      const priceText =
        $('.price .amount, .price ins .amount, [data-price], [itemprop="price"]')
          .first()
          .text()
          .trim() ||
        $('body').text().match(/[\d,.]+\s*€/)?.[0] ||
        '0';

      // Availability: add-to-cart button presence implies in-stock;
      // "sold out" / "vergriffen" (German equivalent) → sold out
      const bodyText = $('body').text().toLowerCase();
      const hasBuyButton =
        $('button[name="add-to-cart"], .single_add_to_cart_button').length > 0;
      const availability =
        bodyText.includes('sold out') ||
        bodyText.includes('vergriffen') ||
        bodyText.includes('ausverkauft')
          ? 'Sold Out'
          : hasBuyButton
          ? 'Available'
          : 'Available';

      // Edition hints from description prose
      const descriptionText = $('.woocommerce-product-details__short-description, .product-description')
        .text()
        .toLowerCase();
      const editionHint =
        descriptionText.includes('lettered')
          ? ' – Lettered Edition'
          : descriptionText.includes('remarqued')
          ? ' – Remarqued Edition'
          : descriptionText.includes('traycased') || descriptionText.includes('traycase')
          ? ' – Traycased Edition'
          : descriptionText.includes('limited')
          ? ' – Limited Edition'
          : '';

      const imageUrl = $('img.wp-post-image, .woocommerce-product-gallery img').first().attr('src') ?? '';

      return {
        title: `${title}${editionHint}`,
        price: priceText,
        availability,
        url: productUrl,
        imageUrl: this.absoluteUrl(imageUrl, BASE),
        publisher: this.publisherName,
        reviews: 0,
      };
    } catch {
      return null;
    }
  }
}
