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

const AURORA_ALPHA = 'openrouter/aurora-alpha';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message } = MessageSchema.parse(body);

    const queryEmbedding: number[] = await embedText(message);
    const pricePatterns = [
      {
        regex: /(?:exactly|equals?)\s+\$?(\d+(?:\.\d{1,2})?)/i,
        operator: 'eq',
      },
      {
        regex: /(?:at\s+most|maximum)\s+\$?(\d+(?:\.\d{1,2})?)/i,
        operator: 'lte',
      },
      {
        regex: /(?:at\s+least|minimum)\s+\$?(\d+(?:\.\d{1,2})?)/i,
        operator: 'gte',
      },
      {
        regex: /(?:under|less\s+than|below)\s+\$?(\d+(?:\.\d{1,2})?)/i,
        operator: 'lte',
      },
      {
        regex: /(?:over|more\s+than|above)\s+\$?(\d+(?:\.\d{1,2})?)/i,
        operator: 'gte',
      },
    ];

    let priceFilter;
    for (const pattern of pricePatterns) {
      const match = message.match(pattern.regex);
      if (match) {
        const price = parseFloat(match[1]);
        const rangeConstraints: Record<string, number> = {};

        if (pattern.operator === 'lte') {
          rangeConstraints.lte = price;
        } else if (pattern.operator === 'gte') {
          rangeConstraints.gte = price;
        } else if (pattern.operator === 'eq') {
          rangeConstraints.gte = price;
          rangeConstraints.lte = price;
        }

        priceFilter = {
          must: [
            {
              key: 'price',
              range: rangeConstraints,
            },
          ],
        };
        break;
      }
    }

    // Parse limit from the message (e.g., "top 5", "show me 20", "find the top 15 results")
    const limitPatterns = [
      {
        regex:
          /(?:top|first|show me|give me|find|list)\s+(?:the\s+)?(?:top\s+)?(\d+)/i,
      },
      { regex: /\b(\d+)\s+(?:results?|books?|items?)/i },
    ];

    let resultLimit = 10;
    for (const pattern of limitPatterns) {
      const match = message.match(pattern.regex);
      if (match) {
        const parsedLimit = parseInt(match[1], 10);
        if (parsedLimit > 0 && parsedLimit <= 100) {
          resultLimit = parsedLimit;
          break;
        }
      }
    }

    // Parse author from the message (e.g., "by Neal Stephenson", "author: H.P. Lovecraft", "written by Stephen King")
    // Matches author names including those with initials (e.g., "H.P. Lovecraft", "J.R.R. Tolkien")
    let authorFilter;
    const authorMatch =
      message.match(
        /\bby\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*(?:\s+[A-Z]\.? ?[A-Z]+\.?)*)/i
      ) ||
      message.match(
        /\bfrom\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*(?:\s+[A-Z]\.? ?[A-Z]+\.?)*)/i
      ) ||
      message.match(
        /\b(?:author|writer):\s*([A-Z][a-z]+(?: [A-Z][a-z]+)*(?:\s+[A-Z]\.? ?[A-Z]+\.?)*)/i
      ) ||
      message.match(
        /\bwritten\s+by\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*(?:\s+[A-Z]\.? ?[A-Z]+\.?)*)/i
      );

    if (authorMatch) {
      const authorName = authorMatch[1].trim();
      authorFilter = {
        must: [
          {
            key: 'author',
            match: {
              text: authorName,
            },
          },
        ],
      };
    }

    let combinedFilter;
    if (priceFilter && authorFilter) {
      combinedFilter = {
        must: [...priceFilter.must, ...authorFilter.must],
      };
    } else if (priceFilter) {
      combinedFilter = priceFilter;
    } else if (authorFilter) {
      combinedFilter = authorFilter;
    }

    const searchResults = await searchVectors({
      vector: queryEmbedding,
      limit: resultLimit,
      filter: combinedFilter,
      sortBy: 'price_desc',
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
      model: openrouter(AURORA_ALPHA),
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
          details: error.issues,
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
