import { InferenceClient } from "@huggingface/inference";
import { validateEnv } from "@/types";

const env = validateEnv();

const EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const client = new InferenceClient(env.HUGGINGFACE_API_KEY);

/**
 * Embed a single text string.
 */
export async function embedText(text: string): Promise<number[]> {
  const batch = await embedBatch([text]);
  return batch[0];
}

/**
 * Embed multiple texts in a single batch request.
 * Uses Hugging Face Inference Providers (router) via @huggingface/inference.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const maxRetries = 5;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.featureExtraction({
        model: EMBEDDING_MODEL,
        inputs: texts,
        provider: "hf-inference",
      });

      return result as number[][];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRateLimit =
        lastError.message.includes("429") ||
        lastError.message.includes("rate limit");
      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(
          `HuggingFace rate limit. Retry ${attempt}/${maxRetries} after ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("embedBatch failed unexpectedly");
}
