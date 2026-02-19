---
name: new-scraper
description: Given a publisher name and URL, read the existing scraper base class in app/lib/scrapers/, analyze the target page structure, and generate a new TypeScript scraper that follows the same pattern. The scraper must extract: title, price, edition type, availability status, and direct product URL. Flag any anti-bot or JavaScript rendering challenges encountered. Use this skill when asked to add a new publisher scraper, scaffold a scraperfor a new site, or extend the data ingestion pipeline with a new source. Keywords: scraper, publisher, ingest, crawl, Playwright, Cheerio, new source.
---

# Skill: New Publisher Scraper

## When to Apply

Use this skill when asked to:
- Add a scraper for a new fine press publisher
- Scaffold `app/lib/scrapers/<publisherSlug>.ts`
- Extend the data pipeline with a new source URL

---

## Step 1 — Read the Base Class

Before generating any code, read `app/lib/scrapers/base.ts`.  
If the file does not exist yet, use `app/lib/scraper.ts` (`ConversationTreeScraper`)
as the reference implementation.  
Identify the abstract methods and the `RawBook` shape from `app/lib/types.ts`.

```
RawBook {
  title: string
  price: string          // raw string, e.g. "£45.00"
  availability: string   // raw string, e.g. "Sold Out"
  url: string            // absolute product URL
  imageUrl: string
  reviews?: number
}
```

---

## Step 2 — Analyse the Target Page

Fetch the publisher URL the user provides and inspect:

| Signal | Action |
|--------|--------|
| Shopify store (`/collections/all`) | Prefer `/collections/all/products.json?limit=250&page=N` REST endpoint over HTML parsing |
| Embedded `var meta = {...}` JSON | Extract via regex before falling back to CSS selectors |
| Static HTML product cards | Use Cheerio with selectors like `.product-card`, `[data-product-card]`, `.product-item` |
| JS-rendered content (React/Vue SPA) | Switch to Playwright; note the challenge in the output |
| Cloudflare / aggressive bot protection | Flag as a challenge; do not attempt to bypass |

---

## Step 3 — Generate the Scraper File

Create `app/lib/scrapers/<publisherSlug>.ts` extending the base class.

### Required Extractions

| Field | `RawBook` property | Notes |
|-------|--------------------|-------|
| Title | `title` | Trim whitespace |
| Price | `price` | Keep raw string; cleaning happens in the pipeline |
| Edition type | mapped to `CleanedBook.edition` at clean step | Detect keywords: Standard, Collector, Deluxe, Lettered, Traycased, Hand-numbered, Remarqued |
| Availability | `availability` | `"Available"` or `"Sold Out"` |
| Product URL | `url` | Must be absolute (`https://...`) |

### File Template

```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawBook } from '../types';
// import { BaseScraper } from './base'; // uncomment once base.ts exists

export class <PublisherName>Scraper /* extends BaseScraper */ {
  private baseUrl = '<PUBLISHER_URL>';
  private books: RawBook[] = [];

  async scrapeAllPages(): Promise<RawBook[]> {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      console.log(`\n=== Scraping page ${page} ===`);
      const pageBooks = await this.scrapePage(page);

      if (pageBooks.length === 0) {
        hasNextPage = false;
      } else {
        this.books.push(...pageBooks);
        page++;
        await this.delay(1000); // be respectful to the server
      }
    }

    return this.books;
  }

  private async scrapePage(page: number): Promise<RawBook[]> {
    // TODO: implement page fetching and parsing
    return [];
  }

  private normalizeUrl(href: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    return `${this.baseUrl.replace(/\/[^/]*$/, '')}${href.startsWith('/') ? '' : '/'}${href}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Step 4 — Edition Detection

When parsing a product title or description, apply this priority order to set
`CleanedBook.edition`:

1. `Lettered` — contains "lettered", "remarqued", or "traycased lettered"
2. `Deluxe` — contains "deluxe", "traycase", "traycased", or "hand-numbered"
3. `Collector` — contains "collector", "signed", "numbered", or "limited"
4. `Standard` — fallback

This maps to the `extractEdition()` function in `app/lib/scraper.ts` which must
be extended in `app/lib/types.ts` to include `'Traycased' | 'Hand-numbered' | 'Remarqued'`
before the Qdrant filter layer is built (see Outstanding Work Item 5 in PROJECT_CONTEXT).

---

## Step 5 — Flag Challenges

At the top of the generated file, add a JSDoc comment listing any challenges:

```typescript
/**
 * <PublisherName>Scraper
 *
 * Challenges detected:
 * - [ ] JavaScript-rendered content — Playwright required
 * - [ ] Cloudflare bot protection — manual review needed
 * - [ ] Non-standard price format — update `cleanPrice()` in pipeline
 * - [ ] Pagination not detected — verify manually
 */
```

Leave unchecked (`[ ]`) any challenge that was not observed.

---

## Conventions

- **No `any` types.** TypeScript strict mode is enforced.
- **Absolute URLs only** in `RawBook.url`; use `normalizeUrl()`.
- **Delay between requests:** `await this.delay(1000)` minimum between page fetches.
- **Axios for static HTML**, Playwright for JS-rendered pages.
- **Shopify stores:** always prefer the `/products.json` REST endpoint over HTML scraping.
- **Do not commit credentials.** If an API key is needed, read it from `process.env`.

---

## Example: Curious King (Static HTML)

```typescript
/**
 * CuriousKingScraper
 *
 * Challenges detected:
 * - None — static HTML, low anti-bot risk.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawBook } from '../types';

export class CuriousKingScraper {
  private baseUrl = 'https://curiousking.co.uk/books';
  private books: RawBook[] = [];

  async scrapeAllPages(): Promise<RawBook[]> {
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const pageBooks = await this.scrapePage(page);
      if (pageBooks.length === 0) { hasNextPage = false; }
      else { this.books.push(...pageBooks); page++; await this.delay(1000); }
    }
    return this.books;
  }

  private async scrapePage(page: number): Promise<RawBook[]> {
    const url = `${this.baseUrl}?page=${page}`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const $ = cheerio.load(data);
    const books: RawBook[] = [];
    $('.product-card').each((_, el) => {
      const $el = $(el);
      const title = $el.find('h3').text().trim();
      const price = $el.find('.price').text().trim();
      const availability = $el.find('.sold-out').length ? 'Sold Out' : 'Available';
      const href = $el.find('a').attr('href') || '';
      if (title && price) {
        books.push({ title, price, availability, url: this.normalizeUrl(href), imageUrl: '', reviews: 0 });
      }
    });
    return books;
  }

  private normalizeUrl(href: string): string {
    if (!href) return '';
    return href.startsWith('http') ? href : `https://curiousking.co.uk${href}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```
