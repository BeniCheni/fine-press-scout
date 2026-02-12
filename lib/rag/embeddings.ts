import { HfInference } from '@huggingface/inference';

const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';
const HF_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

const hf = new HfInference(HF_API_TOKEN);

export async function embedText(text: string): Promise<number[]> {
  try {
    if (!text.trim()) {
      throw new Error('Cannot embed empty text');
    }

    const embeddings = await hf.featureExtraction({
      model: HF_MODEL,
      inputs: [text],
    });

    if (!Array.isArray(embeddings) || embeddings.length === 0) {
      throw new Error('Invalid response from HuggingFace API');
    }

    const embedding = embeddings[0];
    if (!Array.isArray(embedding) || embedding.length !== 384) {
      throw new Error(
        `Wrong embedding dimension. Expected 384, got ${Array.isArray(embedding) ? embedding.length : 'non-array'}`
      );
    }

    return embedding;
  } catch (error) {
    console.error('Error embedding text:', error);
    throw error;
  }
}
