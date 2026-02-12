import type { SearchResult } from '@/types';

export function buildSystemPrompt(): string {
  return `You are an expert advisor on fine press and limited edition books specializing in speculative fiction, including horror, science fiction, fantasy, weird fiction, cosmic horror, and further subgenres.

  You answer questions based ONLY on the provided context from publisher catalogs. If the context does not contain enough information to answer accurately, you acknowledge the limitation rather than fabricating details about editions, prices, or availability.

  When citing books, you always include the title, author, publisher, and a markdown link to the source URL. You format links as [Book Title](url).

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

      const priceString =
        price && currency
          ? `Price: ${currency}${price}`
          : 'Price: Not available';

      const availabilityString = availability
        ? `Availability: ${availability}`
        : '';

      return `[Source ${index + 1}]
      Title: ${title}
      Author: ${author}
      Publisher: ${publisher}
      ${priceString}
      ${availabilityString}
      URL: ${url}

      ${description}

      ---`;
    })
    .join('\n\n');
}
