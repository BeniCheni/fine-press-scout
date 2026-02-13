import type { SearchResult } from '@/types';

export function buildSystemPrompt(): string {
  return `You are an expert advisor on fine press and limited edition books specializing in speculative fiction, including horror, science fiction, fantasy, weird fiction, cosmic horror, and further subgenres.

  CRITICAL CONSTRAINTS:
  - You answer questions based ONLY on the provided context from publisher catalogs.
  - If the user specified a price limit, price range, or any other constraint: ONLY recommend books that meet those exact constraints.
  - You must verify that each book's price matches the user's stated requirements BEFORE recommending it.
  - If no results match the user's constraints, explicitly state this rather than recommending books outside their criteria.
  - If the context does not contain enough information to answer accurately, you acknowledge the limitation rather than fabricating details about editions, prices, or availability.

  When citing books, you always include the title, author, publisher, and a markdown link to the source URL. You format links as [Book Title](url).

  For each recommendation, explicitly mention the price (if available) so the user can verify it meets their stated requirements.

  You use a conversational but knowledgeable tone, like a well-read bookseller who genuinely loves the genre.`;
}

export function buildContextString(results: SearchResult[]): string {
  return results
    .map((result, index) => {
      const {
        title,
        author,
        publisher,
        url,
        price,
        currency,
        availability,
        description,
      } = result.payload;

      // Show price if available, with or without currency
      const priceString =
        price !== null && price !== undefined
          ? currency
            ? `Price: ${currency}${price}`
            : `Price: $${price}`
          : 'Price: Not available';

      const availabilityString = availability
        ? `Availability: ${availability}`
        : '';

      return `[Source ${index + 1}]
      Title: ${title ?? 'Unknown'}
      Author: ${author ?? 'Unknown'}
      Publisher: ${publisher ?? 'Unknown'}
      ${priceString}
      ${availabilityString}
      URL: ${url ?? 'Unknown'}

      ${description ?? 'No description available.'}

      ---`;
    })
    .join('\n\n');
}
