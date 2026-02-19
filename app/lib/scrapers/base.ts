import { RawBook, CleanedBook, EditionType } from '../types';

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
   * Clean and normalise an array of RawBooks into CleanedBooks.
   * Works the same way for every publisher: extract author and edition from
   * the title string, parse the price to a number, and assemble a description.
   */
  cleanData(rawBooks: RawBook[]): CleanedBook[] {
    return rawBooks.map((raw, index) => {
      const author = this.extractAuthor(raw.title);
      const edition = this.extractEdition(raw.title);
      const price = this.parsePrice(raw.price);
      const description = this.createDescription(raw, author, edition);

      return {
        id: `${this.publisherName.toLowerCase().replace(/\s+/g, '-')}_${index}`,
        title: raw.title,
        author,
        price,
        availability: raw.availability.toLowerCase().includes('sold') ? 'Sold Out' : 'Available',
        edition,
        description,
        url: raw.url,
        imageUrl: raw.imageUrl,
        publisher: raw.publisher,
        reviews: raw.reviews ?? 0,
        scrapedAt: new Date(),
      };
    });
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
   * Priority: Remarqued > Traycased > Hand-numbered > Lettered > Deluxe > Collector > Standard
   * Covers all known fine-press synonym forms.
   */
  protected extractEdition(title: string): EditionType {
    const t = title.toLowerCase();
    if (t.includes('remarqued')) return 'Remarqued';
    if (t.includes('traycased') || t.includes('traycase')) return 'Traycased';
    if (
      t.includes('hand-numbered') ||
      t.includes('hand numbered') ||
      t.includes('numbered')
    )
      return 'Hand-numbered';
    if (t.includes('lettered')) return 'Lettered';
    if (t.includes('deluxe')) return 'Deluxe';
    if (t.includes('collector') || t.includes('signed') || t.includes('limited'))
      return 'Collector';
    return 'Standard';
  }

  /**
   * Parse a raw price string (e.g. "£45.00", "$195", "0") to a number.
   * Returns 0 when the price cannot be determined.
   */
  protected parsePrice(priceStr: string): number {
    if (!priceStr) return 0;
    const match = priceStr.match(/[\d,]+\.?\d*/);
    if (!match) return 0;
    return parseFloat(match[0].replace(/,/g, ''));
  }

  /** Assemble a flat description string suitable for embedding. */
  protected createDescription(raw: RawBook, author: string, edition: EditionType): string {
    return [
      `Title: ${raw.title}`,
      `Author: ${author}`,
      `Publisher: ${raw.publisher}`,
      `Price: ${raw.price}`,
      `Availability: ${raw.availability}`,
      `Edition: ${edition}`,
    ].join('. ');
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
