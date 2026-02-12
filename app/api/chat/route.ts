import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { embedText } from '@/lib/rag/embeddings';
import { searchVectors } from '@/lib/rag/vectorStore';
import { buildSystemPrompt, buildContextString } from '@/lib/rag/prompt';

const MessageSchema = z.object({
  message: z.string().min(1).max(1000),
});

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const MISTRAL_7B_INSTRUCT_FREE = 'openai/gpt-3.5-turbo';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message } = MessageSchema.parse(body);

    const queryEmbedding: number[] = await embedText(message);

    const searchResults = await searchVectors({
      vector: queryEmbedding,
      limit: 5,
    });

    const contextString = buildContextString(searchResults);
    const systemPrompt = buildSystemPrompt();

    const sources = searchResults.map((result) => ({
      title: result.payload.title,
      url: result.payload.url,
      publisher: result.payload.publisher,
      price: result.payload.price,
      availability: result.payload.availability,
    }));

    const result = streamText({
      model: openrouter(MISTRAL_7B_INSTRUCT_FREE),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Context:\n${contextString}\n\nQuestion: ${message}`,
        },
      ],
    });

    const sourceHeaders = {
      'X-Sources': JSON.stringify(sources),
    };

    return result.toTextStreamResponse({
      headers: sourceHeaders,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: error.errors,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
