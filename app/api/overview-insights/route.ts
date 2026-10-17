import OpenAI from 'openai';
import { requireDashboardAuth } from '@/lib/server/requestAuth';

// Client sends a compact, sampled view of the feedback. Rating-heavy forms
// also send their category scorecard and best/worst rated questions.
export interface OverviewInsightsInput {
  gameName: string;
  kpis: { label: string; avg: number | null; max: number; positivePct: number | null; negativePct: number | null }[];
  choices: { question: string; options: { label: string; pct: number }[] }[];
  freeText: { question: string; answers: string[] }[];
  categories?: { name: string; score: number; n: number }[];         // 0–100 normalized
  ratedQuestions?: { question: string; score: number; side: 'best' | 'worst' }[];
}

export interface OverviewInsight {
  title: string;
  detail: string;
  quote?: string;
}

export interface OverviewInsightsResult {
  strengths: OverviewInsight[];
  concerns: OverviewInsight[];
  recommendations: {
    area: string;
    priority: 'Critical' | 'High' | 'Medium' | 'Low';
    problem: string;
    recommendation: string;
  }[];
}

export async function POST(req: Request) {
  const authError = requireDashboardAuth(req);
  if (authError) return authError;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY not set in .env.local' }, { status: 500 });
  }

  const body = (await req.json()) as OverviewInsightsInput;
  const { gameName, kpis = [], choices = [], freeText = [], categories = [], ratedQuestions = [] } = body ?? {};

  if (freeText.length === 0 && kpis.length === 0 && categories.length === 0) {
    return Response.json({ strengths: [], concerns: [], recommendations: [] } satisfies OverviewInsightsResult);
  }

  const kpiBlock = kpis
    .map((k) => `- ${k.label}: ${k.avg != null ? `${k.avg.toFixed(2)}/${k.max}` : 'n/a'}` +
      (k.positivePct != null ? ` (${k.positivePct}% positive, ${k.negativePct}% negative)` : ''))
    .join('\n') || '(none)';

  const choiceBlock = choices
    .map((c) => `- ${c.question}\n${c.options.map((o) => `    · ${o.label}: ${o.pct}%`).join('\n')}`)
    .join('\n') || '(none)';

  const categoryBlock = categories
    .map((c) => `- ${c.name}: ${c.score}/100 (n=${c.n})`)
    .join('\n') || '(none)';

  const ratedBlock = ratedQuestions
    .map((q) => `- [${q.side}] ${q.question}: ${q.score}/100`)
    .join('\n') || '(none)';

  // Bound the payload: cap answers per question and answer length.
  const ftBlock = freeText
    .map((f) => {
      const answers = f.answers.slice(0, 18).map((a) => `    · ${a.slice(0, 220)}`).join('\n');
      return `Q: ${f.question}\n${answers}`;
    })
    .join('\n\n');

  const prompt = `You are a senior game design consultant analysing playtest feedback for "${gameName || 'this game'}".
Read the actual answers carefully. Ground every point in the data below — never invent issues or use generic platitudes.

RATINGS:
${kpiBlock}

CATEGORY SCORES (0–100, higher is better):
${categoryBlock}

BEST AND WORST RATED QUESTIONS (0–100):
${ratedBlock}

DIRECT-CHOICE QUESTIONS:
${choiceBlock}

OPEN-ENDED ANSWERS (sampled):
${ftBlock}

Return a JSON object with exactly this structure:
{
  "strengths": [ { "title": "short label", "detail": "1 sentence on what players liked, grounded in the answers", "quote": "a short verbatim tester quote that supports it" } ],
  "concerns":  [ { "title": "short label", "detail": "1 sentence on the problem, grounded in the answers", "quote": "a short verbatim tester quote that supports it" } ],
  "recommendations": [ { "area": "the concern this addresses", "priority": "Critical | High | Medium | Low", "problem": "one-sentence diagnosis", "recommendation": "one concrete, specific fix the team can act on" } ]
}

Rules:
- 3 to 5 strengths, 3 to 5 concerns, and one recommendation per concern (worst first).
- Quotes must be real excerpts from the answers above, lightly trimmed. Omit "quote" if none fits.
- Priority reflects how strongly and how often the concern shows up in the data, including low category scores.
- Be specific to THIS game's mechanics and systems as the answers describe them. Keep every field concise.`;

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    const raw = completion.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<OverviewInsightsResult>;
    return Response.json({
      strengths: parsed.strengths ?? [],
      concerns: parsed.concerns ?? [],
      recommendations: parsed.recommendations ?? [],
    } satisfies OverviewInsightsResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenAI request failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
