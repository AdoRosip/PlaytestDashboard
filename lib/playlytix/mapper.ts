import type { Project, Question, QuestionType, Response, Tester, TesterSegments } from '../types';
import { categoryForQuestion, type GameConfig } from '../games';
import { computeNormalizedScore } from '../scoring';
import { computeTesterQuality, isConcerning, qualityExcludedCategoryIds } from '../outliers';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid API object');
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid API array');
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid API string');
  return value;
}
export function id(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('Invalid API id');
  return value as number;
}
const types: Record<string, QuestionType> = { Rating1_5: 'rating_1_5', ShortText: 'free_text', LongText: 'free_text', URL: 'free_text', File: 'file_upload' };

/** Build an allowlisted analytics DTO; no raw profile, identity, payment or file URLs. */
export function mapPortalData(input: unknown, clientId: string, testId: string, config: GameConfig) {
  const data = object(input);
  const test = object(data.test);
  if (String(id(test.TestID)) !== testId) throw new Error('Unexpected test');
  const projectId = `portal_${clientId}_${testId}`;
  const warnings = ['People are represented by submissions; repeat submissions cannot be deduplicated. Participant counts in charts include submissions with answers. AI and registry enrichment are unavailable in Portal mode.'];
  if (config.id === 'portal-generic') warnings.push('No game-specific configuration: categories, headline KPIs and inverse scoring are unavailable.');
  const seenQuestions = new Set<number>();
  const questions: Question[] = array(data.questions).map(object).sort((a, b) => {
    if (!Number.isFinite(a.DisplayOrder) || !Number.isFinite(b.DisplayOrder)) throw new Error('Invalid question order');
    return (a.DisplayOrder as number) - (b.DisplayOrder as number);
  }).flatMap(q => {
    const questionId = id(q.QuestionID);
    if (seenQuestions.has(questionId)) throw new Error('Duplicate question');
    seenQuestions.add(questionId);
    const typeName = text(q.TypeName);
    if (typeName === 'SectionHeader') return [];
    const type = types[typeName] || 'unknown';
    if (type === 'unknown') warnings.push(`Unsupported question type: ${typeName}. Answers remain unscored.`);
    const questionText = text(q.QuestionText);
    return [{ id: `${projectId}_q_${questionId}`, projectId, text: questionText,
      description: q.QuestionDescription == null ? undefined : text(q.QuestionDescription),
      type, categoryId: categoryForQuestion(config, questionText), sourceColumn: String(questionId),
      scaleMin: type === 'rating_1_5' ? 1 : undefined, scaleMax: type === 'rating_1_5' ? 5 : undefined,
      isInverseScored: type === 'rating_1_5' && config.inverseScoringPatterns.some(p => p.test(questionText)),
    }];
  });
  const questionMap = new Map(questions.map(q => [q.sourceColumn, q]));
  const testers: Tester[] = [];
  const responses: Response[] = [];
  const seenSubmissions = new Set<number>();
  let attachments = 0;
  for (const raw of array(data.responses)) {
    const row = object(raw);
    const submissionId = id(row.responseId);
    if (seenSubmissions.has(submissionId)) throw new Error('Duplicate submission');
    seenSubmissions.add(submissionId);
    const submittedAt = text(row.submittedAt);
    if (!Number.isFinite(Date.parse(submittedAt))) throw new Error('Invalid submission date');
    const profile = object(row.tester);
    const segments: TesterSegments = {};
    const fields = { country: 'country', gender: 'gender', ageRange: 'age_group', platforms: 'platform', gamerType: 'playstyles', gamingPreferences: 'genres' } as const;
    for (const [field, segment] of Object.entries(fields)) {
      if (profile[field] != null) segments[segment] = Array.isArray(profile[field])
        ? (profile[field] as unknown[]).map(text).join(', ') : text(profile[field]);
    }
    const testerId = `${projectId}_s_${submissionId}`;
    testers.push({ id: testerId, testerId: `Submission #${submissionId}`, email: '', discord: '', segments,
      ageGroup: segments.age_group || '', country: segments.country || '', gamingProfile: segments.playstyles || '',
      hardware: 'Unavailable', similarGamesPlayed: [], rawProfileJson: {},
    });
    const answered = new Set<number>();
    for (const rawAnswer of array(row.answers)) {
      const a = object(rawAnswer);
      const questionId = id(a.questionId);
      if (answered.has(questionId) || !seenQuestions.has(questionId)) throw new Error('Invalid answer reference');
      answered.add(questionId);
      const q = questionMap.get(String(questionId));
      if (!q) continue;
      const value = text(a.value);
      const numericValue = q.type === 'rating_1_5' && /^[1-5]$/.test(value.trim()) ? Number(value) : null;
      if (q.type === 'rating_1_5' && value.trim() && numericValue === null) warnings.push(`Invalid rating in submission #${submissionId}; excluded from scores.`);
      responses.push({ id: `${testerId}_${q.id}`, projectId, testerId, questionId: q.id,
        rawAnswer: value, numericValue, normalizedScore: computeNormalizedScore(q, numericValue), submittedAt, matchStatus: 'matched' });
    }
    attachments += array(row.files).length;
  }
  if (attachments) warnings.push(`${attachments} attachments omitted from this report; view files in the Portal.`);
  const stats = object(data.stats);
  if (stats.totalResponses !== testers.length) throw new Error('Incomplete API dataset');
  const quality = computeTesterQuality({ testers, questions, responses, excludedCategoryIds: qualityExcludedCategoryIds(config.categories) });
  for (const tester of testers) {
    const q = quality.get(tester.id);
    if (q) { tester.quality = q; tester.avgRating = q.avgRating; tester.isOutlier = isConcerning(q); }
  }
  const project: Project = { id: projectId, name: text(test.TestName), gameName: config.gameName,
    playtestName: text(test.TestName), createdAt: '', totalResponses: testers.length, matchedTesters: testers.length, unmatchedTesters: 0 };
  return { project, questions, testers, responses, categories: config.categories.map(c => ({ ...c, projectId })), warnings };
}
