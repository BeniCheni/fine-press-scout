import * as cheerio from 'cheerio';
import { Document, DocumentSchema } from '@/types';
import crypto from 'crypto';
import { chromium } from 'playwright';

const BASE_URL = 'https://subterraneanpress.com';
const STORE_URL = `${BASE_URL}/all-books`;

/**
 * Generate a deterministic ID from URL and title to prevent duplicate ingestion.
 */
function generateId(url: string, title: string): string {
  return crypto
    .createHash('sha256')
    .update(`${url}:${title}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Parse price from text like "$45.00" or "Out of Print" or "Pre-Order: $50.00"
 */
function parsePrice(priceText: string): {
  price?: number;
  availability: 'in_print' | 'sold_out' | 'preorder';
} {
  const normalized = priceText.trim().toLowerCase();

  if (normalized.includes('out of print') || normalized.includes('sold out')) {
    return { availability: 'sold_out' };
  }

  if (normalized.includes('pre-order') || normalized.includes('preorder')) {
    const match = normalized.match(/\$(\d+(?:\.\d{2})?)/);
    return {
      price: match ? parseFloat(match[1]) : undefined,
      availability: 'preorder',
    };
  }

  const match = priceText.match(/\$(\d+(?:\.\d{2})?)/);
  if (match) {
    return {
      price: parseFloat(match[1]),
      availability: 'in_print',
    };
  }

  return { availability: 'in_print' };
}

/**
 * Infer edition type from title or description text.
 * Subterranean uses specific terminology in titles/descriptions.
 */
function inferEditionType(
  title: string,
  description: string
): 'trade' | 'limited' | 'lettered' | 'artist' | undefined {
  const combined = `${title} ${description}`.toLowerCase();

  if (combined.includes('lettered')) return 'lettered';
  if (combined.includes('limited edition')) return 'limited';
  if (combined.includes('artist edition')) return 'artist';
  if (
    combined.includes('signed') ||
    combined.includes('numbered') ||
    combined.includes('slipcased')
  ) {
    return 'limited';
  }
  if (
    combined.includes('trade edition') ||
    combined.includes('trade hardcover') ||
    combined.includes('trade paperback') ||
    combined.includes('trade')
  ) {
    return 'trade';
  }

  return undefined;
}

/**
 * Extract limitation text like "Limited to 500 copies" or "Lettered edition of 26"
 */
function extractLimitation(text: string): string | undefined {
  const patterns = [
    /limited to (\d+\s+copies)/i,
    /edition of (\d+)/i,
    /(\d+)\s+copy\s+edition/i,
    /(lettered edition of [A-Z])/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1] || match[0];
  }

  return undefined;
}

/**
 * Scrape Subterranean Press store page for book listings.
 * Uses Playwright to handle dynamic "Load More" button clicks.
 *
 * IMPORTANT: This scraper makes assumptions about Subterranean's HTML structure.
 * The actual site structure may differ. It could be updated systemically in the future by a sync job.
 * Key assumptions:
 * - Store page lists products in a grid/list format
 * - Each product has a title, link, price, and description
 * - Product links are relative URLs starting with /store/ or /product/
 * - A "Load More" button exists to paginate results
 *
 * You may need to adjust selectors after inspecting the actual HTML.
 */
export async function scrapeSubterranean(): Promise<Document[]> {
  console.log(`Launching browser and navigating to ${STORE_URL}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'FinePressScout/1.0 (https://github.com/benicheni/fine-press-scout)',
  });
  const page = await context.newPage();

  try {
    await page.goto(STORE_URL, { waitUntil: 'domcontentloaded' });
    console.log('Page loaded, looking for products and Load More button...');

    // Try different possible selectors for the Load More button
    const loadMoreSelectors = [
      'button:has-text("Load More")',
      'button:has-text("Show More")',
      'a:has-text("Load More")',
      'a:has-text("Show More")',
      '.load-more',
      '#load-more',
      '[class*="load-more"]',
      '[class*="show-more"]',
      'button[class*="load"]',
      'button[class*="more"]',
    ];

    let clickCount = 0;
    const maxClicks = 100; // Safety limit to prevent infinite loops

    while (clickCount < maxClicks) {
      // Try each selector to find the Load More button
      let loadMoreButton = null;

      for (const selector of loadMoreSelectors) {
        try {
          const button = page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            loadMoreButton = button;
            break;
          }
        } catch {
          // Button isn't found with this selector, try next
          continue;
        }
      }

      if (!loadMoreButton) {
        console.log('No more Load More button found. All content loaded.');
        break;
      }

      console.log(`Clicking Load More button (click ${clickCount + 1})...`);

      try {
        // Get current product count before clicking
        const productCountBefore = await page
          .locator(
            '.product-item, .product, .store-item, article[itemtype*="Product"]'
          )
          .count();

        await loadMoreButton.click();
        clickCount++;

        // Wait for new content to load (wait for product count to increase)
        try {
          await page.waitForFunction(
            (prevCount) => {
              const currentCount = document.querySelectorAll(
                '.product-item, .product, .store-item, article[itemtype*="Product"]'
              ).length;
              return currentCount > prevCount;
            },
            productCountBefore,
            { timeout: 10000 }
          );

          // Add a small delay to ensure all content is rendered
          await page.waitForTimeout(1000);
        } catch (error) {
          console.log(
            `No new products loaded, assuming end of content: ${JSON.stringify(error, null, 2)}.`
          );
          break;
        }
      } catch (error) {
        console.log(
          `Could not click Load More button, assuming end of content${JSON.stringify(error, null, 2)}.`
        );
        break;
      }
    }

    if (clickCount >= maxClicks) {
      console.warn(
        `Reached maximum click limit (${maxClicks}). There may be more content available.`
      );
    }

    console.log(
      `Finished loading content after ${clickCount} Load More clicks.`
    );
    console.log('Extracting HTML for parsing...');

    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);

    const documents: Document[] = [];

    // SELECTOR ASSUMPTIONS - ADJUST THESE BASED ON ACTUAL HTML:
    // Subterranean likely uses a product grid with class names like:
    // .product, .product-item, .store-item, or similar
    // Each product likely has:
    // - Title in an <a> or <h2>/<h3> tag
    // - Price in a span/div with class like .price
    // - Description in a paragraph or div

    // Generic selectors that might work (inspect actual site to refine):
    const productSelectors = [
      '.product-item',
      '.product',
      '.store-item',
      'article[itemtype*="Product"]',
      // '.woocommerce-LoopProduct-link', // If using WooCommerce
    ];

    let $products = $('');
    for (const selector of productSelectors) {
      $products = $(selector);
      if ($products.length > 0) {
        console.log(
          `Found ${$products.length} products using selector: ${selector}`
        );
        break;
      }
    }

    if ($products.length === 0) {
      console.warn(
        'No products found. The site structure may have changed. Inspect the HTML and adjust selectors in /lib/scrapers/subterranean.ts'
      );
      return documents;
    }

    $products.each((_, element) => {
      try {
        const $el = $(element);

        const title =
          $el.find('h2 a').text().trim() ||
          $el.find('h3 a').text().trim() ||
          $el.find('a.product-title').text().trim() ||
          $el.find('.product-name').text().trim();

        if (!title) return;

        const relativeUrl =
          $el.find('h2 a').attr('href') ||
          $el.find('h3 a').attr('href') ||
          $el.find('a').first().attr('href');

        if (!relativeUrl) return;

        const url = relativeUrl.startsWith('http')
          ? relativeUrl
          : `${BASE_URL}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;

        const priceText =
          $el.find('.price').text().trim() ||
          $el.find('[class*="price"]').text().trim() ||
          $el.find('span[itemprop="price"]').text().trim();

        const { price, availability } = parsePrice(priceText);

        const description =
          $el.find('.product-description').text().trim() ||
          $el.find('p').first().text().trim() ||
          '';

        // author may be in title like "Book Title by Author Name"
        const authorMatch = title.match(/by\s+(.+)$/i);
        const author = authorMatch ? authorMatch[1].trim() : undefined;

        const editionType = inferEditionType(title, description);
        const limitation = extractLimitation(`${title} ${description}`);

        const rawText = `${title}\n${description}\nPrice: ${priceText}\nPublisher: Subterranean Press`;

        const document: Document = {
          id: generateId(url, title),
          title,
          author,
          publisher: 'Subterranean Press',
          url,
          description,
          price,
          currency: price !== undefined ? 'USD' : undefined,
          editionType,
          limitation,
          availability,
          genreTags: [], // TODO: Can enhance later with genre classification
          scrapedAt: new Date().toISOString(),
          rawText,
        };

        const validated = DocumentSchema.safeParse(document);
        if (validated.success) {
          documents.push(validated.data);
        } else {
          console.warn(`Validation failed for "${title}":`, validated.error);
        }
      } catch (error) {
        console.error('Error parsing product:', error);
      }
    });

    console.log(`✓ Scraped ${documents.length} books from Subterranean Press`);
    return documents;
  } catch (error) {
    await browser.close();
    throw error;
  }
}
