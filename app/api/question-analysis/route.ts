import OpenAI from 'openai';
import type { Question, Response as PlaytestResponse, Tester } from '@/lib/types';

export interface QuestionAnalysisResult {
  summary: string;
  themes: { label: string; insight: string }[];
  highlights: string[];
  actionable: string;
  // Demographic patterns — only populated when the AI finds a genuine signal
  segmentInsights: { segment: string; finding: string }[];
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY not set in .env.local' }, { status: 500 });
  }

  const { question, responses, testers } = (await req.json()) as {
    question: Question;
    responses: PlaytestResponse[];
    testers: Tester[];
  };

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
    return `- "${r.rawAnswer.trim()}"${suffix}`;
  }).join('\n');

  const prompt = `You are analysing playtest feedback for a video game. Analyse tester responses to one specific question and look for both content patterns AND demographic patterns.

Question: "${question.text}"
Type: ${question.type}
Total responses analysed: ${meaningful.length}

Responses (tester context in square brackets when available):
${responseLines}

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
  ]
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
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenAI request failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
