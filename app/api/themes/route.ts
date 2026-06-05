import OpenAI from 'openai';
import type { Question, Response as PlaytestResponse, Category } from '@/lib/types';

// Requires OPENAI_API_KEY in .env.local
export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY not set in .env.local' }, { status: 500 });
  }

  const { questions, responses, categories } = (await req.json()) as {
    questions: Question[];
    responses: PlaytestResponse[];
    categories: Category[];
  };

  const freeTextQuestions = questions.filter((q) => q.type === 'free_text');

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const categoryList = categories.map((c) => `${c.id}: ${c.name}`).join('\n');

  const MAX_RESPONSE_CHARS = 300;

  const questionSections = freeTextQuestions
    .map((q) => {
      const qResponses = responses
        .filter((r) => r.questionId === q.id && r.rawAnswer?.trim())
        .map((r) => {
          const text = r.rawAnswer.replace(/[\r\n]+/g, ' ').trim();
          const truncated = text.length > MAX_RESPONSE_CHARS
            ? text.slice(0, MAX_RESPONSE_CHARS) + '…'
            : text;
          return `  [${r.id}] "${truncated}"`;
        })
        .join('\n');
      if (!qResponses) return null;
      const catName = q.categoryId ? (categoryMap[q.categoryId] ?? '') : '';
      return `[${q.id}]${catName ? ` (${catName})` : ''} ${q.text}\n${qResponses}`;
    })
    .filter(Boolean)
    .join('\n\n');

  if (!questionSections) {
    return Response.json({ error: 'No free-text responses found to analyse' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const openai = new OpenAI({ apiKey });

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 8000,
          tool_choice: 'required',
          tools: [
            {
              type: 'function',
              function: {
                name: 'record_theme',
                description:
                  'Record a single identified theme from the playtest feedback. ' +
                  'Call this once per theme — aim for 5–10 themes total.',
                parameters: {
                  type: 'object',
                  properties: {
                    label: {
                      type: 'string',
                      description: 'Short theme title (5–8 words)',
                    },
                    summary: {
                      type: 'string',
                      description:
                        '2–3 sentence analysis of this theme and its impact on the player experience',
                    },
                    severity: {
                      type: 'string',
                      enum: ['Critical', 'High', 'Medium', 'Low'],
                      description:
                        'Impact severity — Critical = game-breaking, High = major friction, Medium = notable, Low = minor or positive',
                    },
                    confidence: {
                      type: 'number',
                      description:
                        '0.0–1.0 confidence this is a real recurring pattern (0.9+ = very clear, 0.7+ = likely)',
                    },
                    frequency: {
                      type: 'number',
                      description: 'Number of unique responses that support this theme',
                    },
                    representativeQuotes: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '2–3 verbatim quotes copied exactly from the responses below',
                    },
                    linkedResponseIds: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Response IDs matching the [id] prefixes below that support this theme',
                    },
                    categoryId: {
                      type: 'string',
                      description: 'Category ID this theme primarily belongs to (e.g. cat_06)',
                    },
                    questionId: {
                      type: 'string',
                      description: 'Question ID this theme primarily relates to (e.g. q_022)',
                    },
                    priority: {
                      type: 'string',
                      enum: ['Critical', 'High', 'Medium', 'Low'],
                      description: 'Recommended fix priority',
                    },
                  },
                  required: [
                    'label',
                    'summary',
                    'severity',
                    'confidence',
                    'frequency',
                    'representativeQuotes',
                    'linkedResponseIds',
                  ],
                },
              },
            },
          ],
          messages: [
            {
              role: 'system',
              content:
                'You are analysing open-text playtest feedback. Identify 5–10 recurring themes — distinct issues or patterns supported by multiple responses. ' +
                'Call record_theme once per theme. ' +
                'Only use quotes that appear verbatim in the data. ' +
                'linkedResponseIds must exactly match the [id] prefixes shown. ' +
                'A theme needs at least 2 supporting responses, ideally across multiple questions.',
            },
            {
              role: 'user',
              content: `CATEGORIES:\n${categoryList}\n\nRESPONSES BY QUESTION:\n${questionSections}`,
            },
          ],
        });

        const toolCalls = completion.choices[0]?.message?.tool_calls ?? [];

        for (const tc of toolCalls) {
          if (tc.type !== 'function') continue;
          if (tc.function.name === 'record_theme') {
            try {
              const theme = JSON.parse(tc.function.arguments);
              send({ type: 'theme', data: theme });
            } catch {
              // skip malformed
            }
          }
        }

        send({ type: 'done' });
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }

      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
