import { QdrantClient } from '@qdrant/js-client-rest';
import { extractFilters } from '../lib/rag/query';

const client = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });

const testQueries = [
  'Laird Barron lettered editions under $300',
  'Thomas Ligotti titles in print',
  'What does Zagava have available right now?',
  'cosmic horror under $150',
];

async function main(): Promise<void> {
  for (const query of testQueries) {
    const { qdrantMust: filters, analysis: queryAnalysis } = extractFilters(query);

    console.log('\nQuery:', query);
    console.log('Analysis:', JSON.stringify(queryAnalysis, null, 2));

    try {
      const results = await client.search('books', {
        vector: new Array(384).fill(0),
        limit: 3,
        filter: { must: filters },
        with_payload: false,
        with_vector: false,
      });

      console.log('Filter payload:', JSON.stringify({ must: filters }, null, 2));
      console.log(`Results returned: ${results.length}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Qdrant rejected filter payload:', message);
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Script failed:', message);
  process.exitCode = 1;
});
