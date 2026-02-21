import { RawBook, BookDocument, EditionType } from '../types';

/**
 * Abstract base class that all publisher scrapers must extend.
 * Concrete scrapers must implement scrapeAllPages() and provide
 * a publisherName string used to tag every RawBook they emit.
 */
export abstract class BaseScraper {
  abstract readonly publisherName: string;

  /** Return all scraped raw books from the publisher's catalogue. */
  abstract scrapeAllPages(): Promise<RawBook[]>;

  // ── Shared cleaning helpers ────────────────────────────────────────────────

  /**
   * Clean and normalise an array of RawBooks into BookDocuments.
   * Works the same way for every publisher: extract author and edition_type
   * from the title string, parse the price to a number, normalise
   * availability to the canonical enum, and assemble a description.
   * scraped_at is set to the current ISO timestamp at clean time.
   */
  cleanData(rawBooks: RawBook[]): BookDocument[] {
    return rawBooks.map((raw, index) => {
      const author = this.extractAuthor(raw.title);
      const edition_type = this.extractEdition(raw.title);
      const price = this.parsePrice(raw.price);
      const description = this.createDescription(raw, author, edition_type);
      const availability = this.normalizeAvailability(raw.availability);

      const doc: BookDocument = {
        id: `${this.publisherName.toLowerCase().replace(/\s+/g, '-')}_${index}`,
        title: raw.title,
        author,
        price,
        availability,
        edition_type,
        description,
        url: raw.url,
        imageUrl: raw.imageUrl,
        publisher: raw.publisher,
        reviews: raw.reviews ?? 0,
        scraped_at: new Date().toISOString(),
      };

      // Propagate currency if detected by the individual scraper
      if (raw.currency) doc.currency = raw.currency;

      return doc;
    });
  }

  /**
   * Normalise raw availability strings to the canonical three-value enum.
   *   'sold out' / 'out of stock' / 'out of print' → 'sold_out'
   *   'preorder' / 'pre-order' / 'coming soon'       → 'preorder'
   *   anything else                                   → 'in_print'
   */
  protected normalizeAvailability(raw: string): 'in_print' | 'sold_out' | 'preorder' {
    const s = raw.toLowerCase().trim();
    if (s.includes('sold') || s.includes('out of stock') || s.includes('out of print')) {
      return 'sold_out';
    }
    if (s.includes('preorder') || s.includes('pre-order') || s.includes('coming soon')) {
      return 'preorder';
    }
    return 'in_print';
  }

  /**
   * Extract author from a "Title by Author" pattern, or return 'Unknown'.
   */
  protected extractAuthor(title: string): string {
    const match = title.match(/\bby\s+([A-Za-z\s.'-]+?)(?:\s*[-–]|\s*$)/i);
    return match ? match[1].trim() : 'Unknown';
  }

  /**
   * Extract edition type from title text.
   * Priority (high → low):
   *   Remarqued > Traycased > Hand-numbered > Lettered > Deluxe
   *   > Artist > Collector > Limited > Trade > Standard
   *
   * New values added: Trade, Limited, Artist.
   * "limited" now maps to 'Limited' (previously 'Collector').
   * "trade edition" / "trade" maps to 'Trade'.
   * "artist edition" maps to 'Artist'.
   */
  protected extractEdition(title: string): EditionType {
    const t = title.toLowerCase();
    if (t.includes('remarqued')) return 'Remarqued';
    if (t.includes('traycased') || t.includes('traycase')) return 'Traycased';
    if (t.includes('hand-numbered') || t.includes('hand numbered')) return 'Hand-numbered';
    if (t.includes('lettered')) return 'Lettered';
    if (t.includes('deluxe')) return 'Deluxe';
    if (t.includes('artist edition')) return 'Artist';
    if (t.includes('collector')) return 'Collector';
    if (t.includes('signed')) return 'Collector';
    if (t.includes('limited') || t.includes('numbered')) return 'Limited';
    if (t.includes('trade edition') || t.includes('trade')) return 'Trade';
    return 'Standard';
  }

  /**
   * Parse a raw price string (e.g. "£45.00", "$195", "$60–$850") to a number.
   * When a price range is present, the first (lowest) value is used.
   * Returns 0 when the price cannot be determined.
   */
  protected parsePrice(priceStr: string): number {
    if (!priceStr) return 0;
    const match = priceStr.match(/[\d,]+\.?\d*/);
    if (!match) return 0;
    return parseFloat(match[0].replace(/,/g, ''));
  }

  /**
   * Assemble a flat description string suitable for embedding.
   * Strips HTML entities; skips empty fields to avoid navigation-noise strings.
   */
  protected createDescription(raw: RawBook, author: string, edition_type: EditionType): string {
    const clean = (s: string) =>
      s
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

    const parts = [
      raw.title ? `Title: ${clean(raw.title)}` : '',
      author && author !== 'Unknown' ? `Author: ${clean(author)}` : '',
      raw.publisher ? `Publisher: ${clean(raw.publisher)}` : '',
      raw.price && raw.price !== '0' ? `Price: ${clean(raw.price)}` : '',
      raw.availability ? `Availability: ${clean(raw.availability)}` : '',
      edition_type ? `Edition: ${edition_type}` : '',
    ].filter(Boolean);

    return parts.join('. ');
  }

  /** Ensure a URL is absolute. baseUrl must include scheme + host. */
  protected absoluteUrl(href: string, baseUrl: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${baseUrl}${href}`;
    return `${baseUrl}/${href}`;
  }

  /** Respectful delay between requests. */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
