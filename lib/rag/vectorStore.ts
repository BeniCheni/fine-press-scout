import { QdrantClient } from '@qdrant/js-client-rest';
import type { SearchResult, SearchParams } from '@/types';

interface FilterCondition {
  key: string;
  match?: {
    text: string;
  };
}

interface QdrantFilter {
  must?: FilterCondition[];
}

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY,
});

// ========== FUZZY MATCHING ALGORITHM FOR AUTHOR SEARCH ==========
// The following functions implement fuzzy matching to handle author name variations
// Uses Levenshtein distance to calculate string similarity (threshold: 0.7 or 70%)
// Supports exact matches, substrings, and similar names (e.g., "Steve King" ~ "Stephen King")

/**
 * Calculate similarity between two strings using Levenshtein distance
 * Returns a score between 0 and 1, where 1 is an exact match
 *
 * Algorithm: Levenshtein distance calculates the minimum number of single-character edits
 * (insertions, deletions, substitutions) needed to transform one string into another.
 * The similarity score is derived as: 1 - (distance / maxLength)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (!s1 || !s2) return 0;

  if (s1 === s2) return 1;

  if (s1.includes(s2) || s2.includes(s1)) return 0.95;

  // Levenshtein distance calculation
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = Array(len2 + 1)
    .fill(null)
    .map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  const similarity = 1 - distance / maxLen;

  return Math.max(0, similarity);
}

/**
 * Filter results by author with fuzzy matching
 */
function filterByAuthor(
  results: Array<{
    id: string;
    score: number;
    payload: SearchResult['payload'];
  }>,
  authorName: string,
  threshold: number = 0.7
): Array<{ id: string; score: number; payload: SearchResult['payload'] }> {
  const filtered = results.filter((result) => {
    const resultAuthor = result.payload.author || '';
    const similarity = calculateStringSimilarity(authorName, resultAuthor);
    if (similarity > 0) {
      console.log(
        `  Comparing "${authorName}" vs "${resultAuthor}": similarity=${similarity.toFixed(2)}, matches=${similarity >= threshold}`
      );
    }
    return similarity >= threshold;
  });
  return filtered;
}

export async function searchVectors(
  params: SearchParams
): Promise<SearchResult[]> {
  const searchParams = {
    vector: params.vector,
    limit: params.limit * 2, // Get more results to account for author filtering
    with_payload: true,
  };

  // Separate author filter from other filters, use Qdrant's text matching for fuzzy lookups
  let authorNameToFilter: string | null = null;
  let qdrantFilter: QdrantFilter | null = null;

  if (params.filter !== undefined) {
    const qdrantFilterData = params.filter as QdrantFilter;
    const mustConditions = (qdrantFilterData.must || []) as FilterCondition[];
    const authorCondition = mustConditions.find(
      (cond: FilterCondition) => cond.key === 'author'
    );

    if (authorCondition) {
      authorNameToFilter =
        (authorCondition.match?.text as string | undefined) || null;
    }

    qdrantFilter = qdrantFilterData;
  }

  // Include filter in search params if provided
  if (qdrantFilter !== undefined) {
    searchParams.filter = qdrantFilter;
  }

  const results = await qdrant.search('fine_press_books', searchParams);

  let mappedResults = results.map((result) => ({
    id: result.id as string,
    score: result.score,
    payload: result.payload as SearchResult['payload'],
  }));

  // Apply additional author filter with fuzzy matching if specified
  // This catches variations in author names that Qdrant's text matching might miss
  if (authorNameToFilter) {
    mappedResults = filterByAuthor(mappedResults, authorNameToFilter);
  }

  // Trim results back to requested limit
  mappedResults = mappedResults.slice(0, params.limit);

  // Sort results if sortBy parameter is provided
  if (params.sortBy) {
    mappedResults.sort((a, b) => {
      const priceA = a.payload.price ?? 0;
      const priceB = b.payload.price ?? 0;

      if (params.sortBy === 'price_asc') {
        return priceA - priceB;
      } else if (params.sortBy === 'price_desc') {
        return priceB - priceA;
      }
      return 0;
    });
  }

  return mappedResults;
}
