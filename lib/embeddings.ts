import { HfInference } from '@huggingface/inference';

const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';
const HF_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

const hf = new HfInference(HF_API_TOKEN);

/**
 * Embed a single text string using HuggingFace Inference API
 */
export async function embedText(text: string): Promise<number[]> {
  if (!text.trim()) {
    throw new Error('Cannot embed empty text');
  }

  const embeddings = await embedBatch([text]);
  return embeddings[0];
}

/**
 * Embed multiple texts in batch with retry logic for rate limits
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  let lastError: Error | undefined;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const embeddings = await hf.featureExtraction({
        model: HF_MODEL,
        inputs: texts,
      });

      if (!Array.isArray(embeddings) || embeddings.length === 0) {
        throw new Error('Invalid response from HuggingFace API');
      }

      for (const embedding of embeddings) {
        if (!Array.isArray(embedding) || embedding.length !== 384) {
          throw new Error(
            `Wrong embedding dimension. Expected 384, got ${Array.isArray(embedding) ? embedding.length : 'non-array'}`
          );
        }
      }

      console.log(`Embedded ${texts.length} text(s) successfully`);
      return embeddings as number[][];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (attempt < maxRetries - 1) {
        const delay = 2000 * Math.pow(2, attempt);
        console.warn(
          `Embedding failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Embedding failed after ${maxRetries} attempts: ${lastError?.message}`
  );
}
