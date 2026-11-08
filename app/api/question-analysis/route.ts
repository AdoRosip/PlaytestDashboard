import OpenAI from 'openai';
import type { Question, Response as PlaytestResponse, Tester } from '@/lib/types';
import { requireDashboardAuth } from '@/lib/server/requestAuth';
import type { RankingContext } from '@/lib/ranking';

export interface QuestionAnalysisResult {
  summary: string;
  themes: { label: string; insight: string }[];
  highlights: string[];
  actionable: string;
  // Demographic patterns — only populated when the AI finds a genuine signal
  segmentInsights: { segment: string; finding: string }[];
  /** Ranking tests only: what testers liked and disliked about each ranked item. */
  optionInsights?: { option: string; liked: string; disliked: string }[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function POST(req: Request) {
  const authError = requireDashboardAuth(req);
  if (authError) return authError;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY not set in .env.local' }, { status: 500 });
  }

  const { question, responses, testers, rankingContext } = (await req.json()) as {
    question: Question;
    responses: PlaytestResponse[];
    testers: Tester[];
    /** When the answers explain a ranking: each tester's order, best first. */
    rankingContext?: RankingContext;
  };
  const rankings = rankingContext?.byTester ?? {};
  const rankedItems = [...new Set(Object.values(rankings).flat())];

  const testerMap = new Map(testers.map((t) => [t.id, t]));

  const meaningful = responses
    .filter((r) => r.rawAnswer.trim().length > 3)
    .slice(0, 80);

  if (meaningful.length === 0) {
    return Response.json({
      summary: 'No responses with enough content to analyse.',
      themes: [],
      highlights: [],
      actionable: '',
      segmentInsights: [],
    } satisfies QuestionAnalysisResult);
  }

  const responseLines = meaningful.map((r) => {
    const t = r.testerId ? testerMap.get(r.testerId) : undefined;
    const ctx: string[] = [];
    if (t?.ageGroup) ctx.push(t.ageGroup);
    if (t?.segments?.hardware_tier) ctx.push(`${t.segments.hardware_tier} hardware`);
    if (t?.gamingProfile) ctx.push(t.gamingProfile);
    if (t?.segments?.gaming_hours) ctx.push(`${t.segments.gaming_hours} hrs/week`);
    const suffix = ctx.length ? ` [${ctx.join(', ')}]` : '';
    const order = r.testerId ? rankings[r.testerId] : undefined;
    const ranked = order ? ` [ranked best→worst: ${order.join(' > ')}]` : '';
    return `- "${r.rawAnswer.trim()}"${ranked}${suffix}`;
  }).join('\n');

  const rankingBrief = rankedItems.length ? `
These answers explain a ranking. Testers answered "${rankingContext!.question}", and each answer is followed by that tester's own order, best first.
Ranked items: ${rankedItems.join(', ')}
In "summary", say which items testers preferred and the main reasons why. Also return "optionInsights": exactly one entry per ranked item, in the order listed above, with what testers liked and disliked about it (one sentence each; an empty string if nobody said).
` : '';

  const prompt = `You are analysing playtest feedback for a video game. Analyse tester responses to one specific question and look for both content patterns AND demographic patterns.

Question: "${question.text}"
Type: ${question.type}
Total responses analysed: ${meaningful.length}

Responses (tester context in square brackets when available):
${responseLines}
${rankingBrief}
Return a JSON object with exactly this structure:
{
  "summary": "2-3 sentence overview of what testers generally said",
  "themes": [
    { "label": "Short theme name", "insight": "One sentence explaining this theme" }
  ],
  "highlights": ["A particularly representative or insightful quote"],
  "actionable": "One concrete, specific recommendation for the game developer",
  "segmentInsights": [
    { "segment": "e.g. Hardware Tier", "finding": "e.g. All 6 Low-hardware testers mentioned performance issues, vs 1 out of 8 High-hardware testers" }
  ]${rankedItems.length ? `,
  "optionInsights": [
    { "option": "One of the ranked items", "liked": "What testers liked about it", "disliked": "What testers disliked about it" }
  ]` : ''}
}

Rules:
- themes: 2-4 themes maximum
- highlights: 1-3 real quotes from the responses (verbatim)
- actionable: must be specific and concrete, not generic
- segmentInsights: ONLY include if you notice a genuine, noteworthy pattern (3+ data points minimum). Look for correlations between negative/positive responses and: age group, hardware tier, gaming hours, gaming profile. If no meaningful demographic pattern exists, return an empty array — do not fabricate patterns.`;

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const raw = completion.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<QuestionAnalysisResult>;
    const result: QuestionAnalysisResult = {
      summary: parsed.summary ?? '',
      themes: parsed.themes ?? [],
      highlights: parsed.highlights ?? [],
      actionable: parsed.actionable ?? '',
      segmentInsights: parsed.segmentInsights ?? [],
    };
    if (rankedItems.length && Array.isArray(parsed.optionInsights)) {
      // Keep only the items that were actually ranked, in their listed order.
      const byOption = new Map(parsed.optionInsights.map((o) => [str(o?.option).trim(), o]));
      result.optionInsights = rankedItems.flatMap((option) => {
        const o = byOption.get(option);
        return o ? [{ option, liked: str(o.liked), disliked: str(o.disliked) }] : [];
      });
    }
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenAI request failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
