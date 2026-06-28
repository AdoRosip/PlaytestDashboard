import OpenAI from 'openai';

// Input the overview page sends: the worst-scoring areas plus the evidence
// (themes + representative negative quotes) behind each one.
export interface FlawInput {
  area: string;
  score: number;        // 0–100 normalized
  negativePct: number;  // % of responses rated low
  themes: { label: string; summary: string; severity: string }[];
  quotes: string[];
}

export interface FlawRecommendation {
  area: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  problem: string;        // one-sentence diagnosis of what's wrong
  recommendation: string; // concrete, specific fix
}

export interface FlawRecommendationsResult {
  recommendations: FlawRecommendation[];
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY not set in .env.local' }, { status: 500 });
  }

  const { gameName, flaws } = (await req.json()) as {
    gameName: string;
    flaws: FlawInput[];
  };

  if (!flaws || flaws.length === 0) {
    return Response.json({ recommendations: [] } satisfies FlawRecommendationsResult);
  }

  const flawBlocks = flaws.map((f) => {
    const themeLines = f.themes.length
      ? f.themes.map((t) => `    • [${t.severity}] ${t.label}: ${t.summary}`).join('\n')
      : '    • (no themes extracted)';
    const quoteLines = f.quotes.length
      ? f.quotes.map((q) => `    • "${q}"`).join('\n')
      : '    • (no quotes available)';
    return `Area: ${f.area}
  Score: ${f.score}/100 · ${f.negativePct}% of responses rated this low
  Recurring themes:
${themeLines}
  Representative tester quotes:
${quoteLines}`;
  }).join('\n\n');

  const prompt = `You are a senior game design consultant reviewing playtest results for "${gameName || 'this game'}".
Below are the lowest-scoring areas of the game — the ones that received the most negative feedback.
For each area, give the developer a concrete, prioritised recommendation on how to fix it.

${flawBlocks}

Return a JSON object with exactly this structure:
{
  "recommendations": [
    {
      "area": "The exact area name from above",
      "priority": "Critical | High | Medium | Low",
      "problem": "One sentence diagnosing the core issue, grounded in the themes/quotes",
      "recommendation": "One or two sentences with a specific, concrete fix the team can act on"
    }
  ]
}

Rules:
- Return one recommendation per area provided, in the same order (worst first).
- priority should reflect the score and the severity of the themes (lower score + higher-severity themes = higher priority).
- problem and recommendation must be specific to THIS game's feedback — reference the actual themes/quotes, never generic platitudes.
- Keep each field concise. Do not invent issues that aren't supported by the data.`;

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const raw = completion.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<FlawRecommendationsResult>;
    return Response.json({
      recommendations: parsed.recommendations ?? [],
    } satisfies FlawRecommendationsResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenAI request failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
