import { HfInference } from '@huggingface/inference';

const MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

// Lazy-initialised; avoids crashing at module load when the key is absent.
let hf: HfInference | null = null;

function getClient(): HfInference {
  if (!hf) {
    const token = process.env.HUGGINGFACE_API_KEY;
    if (!token) throw new Error('HUGGINGFACE_API_KEY is not set in environment.');
    hf = new HfInference(token);
  }
  return hf;
}

/**
 * Return a 384-dimensional embedding vector for `text` using
 * sentence-transformers/all-MiniLM-L6-v2 via the HuggingFace Inference API.
 * Retries with exponential back-off on 503 (model loading) responses.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await client.featureExtraction({
        model: MODEL,
        inputs: text,
      });

      // HuggingFace returns number[] | number[][] depending on whether
      // a single string or array was passed. We always pass a string.
      if (Array.isArray(result) && typeof result[0] === 'number') {
        return result as number[];
      }
      if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0] as number[];
      }
      throw new Error(`Unexpected embedding shape: ${JSON.stringify(result).slice(0, 80)}`);
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isLoading = msg.includes('loading') || msg.includes('503');
      if (isLoading && attempt < MAX_RETRIES - 1) {
        const wait = BASE_DELAY_MS * 2 ** attempt;
        console.warn(`HuggingFace model loading; retrying in ${wait}ms…`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}
