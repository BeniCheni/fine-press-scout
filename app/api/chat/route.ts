import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { queryBooks } from '../../lib/rag/query';
import { SYSTEM_PROMPT, buildContextBlock } from '../../lib/rag/prompt';
import type { ChatMessage } from '../../lib/types';

export const runtime = 'nodejs';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages: ChatMessage[];
    budget?: number;
    keyword?: string;
  };

  const { messages, budget, keyword } = body;

  // Build a query string from the last user message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const query = lastUserMsg?.content ?? 'fine press limited edition books';

  // ── Retrieve relevant in-stock titles from Qdrant ──────────────────────
  let contextBlock = '';
  try {
    const results = await queryBooks({ query, budget, keyword, topK: 8 });
    contextBlock = buildContextBlock(results);
  } catch (err) {
    console.error('Qdrant query failed (is Qdrant running?):', err);
    contextBlock = 'Retrieved Titles: (search service temporarily unavailable)';
  }

  // Inject retrieved titles as a system-level context message
  const augmentedMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'system' as const, content: contextBlock },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  // ── Stream the LLM response via OpenRouter ─────────────────────────────
  // Primary: Mistral 7B Instruct. Fallbacks handled by OpenRouter routing.
  const result = await streamText({
    model: openrouter('mistralai/mistral-7b-instruct'),
    messages: augmentedMessages,
    temperature: 0.7,
  });

  return result.toTextStreamResponse();
}
