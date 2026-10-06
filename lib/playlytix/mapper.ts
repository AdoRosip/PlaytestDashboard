import type { Category, Project, Question, QuestionType, Response, Tester, TesterSegments } from '../types';
import { categoryForQuestion, type GameConfig } from '../games';
import { computeNormalizedScore } from '../scoring';
import { computeTesterQuality, isConcerning, qualityExcludedCategoryIds } from '../outliers';
import { mapProfileExtras } from './profileMapper';

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
const types: Record<string, QuestionType> = {
  Rating1_5: 'rating_1_5', Rating1_10: 'rating_1_10', ScaleAgree: 'rating_1_5',
  ScaleQuality: 'rating_1_5', ScaleIntent: 'rating_1_5', SingleChoice: 'multiple_choice',
  ShortText: 'free_text', LongText: 'free_text', URL: 'free_text', File: 'file_upload',
};

/** Build a client DTO with explicit profile/media allowlists and no operator fields. */
export function mapPortalData(input: unknown, clientId: string, testId: string, config: GameConfig) {
  const data = object(input);
  const test = object(data.test);
  if (String(id(test.TestID)) !== testId) throw new Error('Unexpected test');
  const projectId = `portal_${clientId}_${testId}`;
  const warnings = ['People are represented by submissions; repeat submissions cannot be deduplicated. Participant counts in charts include submissions with answers. Registry enrichment is unavailable in Portal mode.'];
  if (config.id === 'portal-generic') warnings.push('No game-specific configuration: headline KPIs and inverse scoring are unavailable.');
  const categories: Category[] = config.categories.map(c => ({ ...c, projectId }));
  const seenQuestions = new Set<number>();
  const questions: Question[] = array(data.questions).map(object).map(q => {
    if (!Number.isFinite(q.DisplayOrder)) throw new Error('Invalid question order');
    return q;
  }).sort((a, b) => {
    return (a.DisplayOrder as number) - (b.DisplayOrder as number);
  }).flatMap(q => {
    const questionId = id(q.QuestionID);
    if (seenQuestions.has(questionId)) throw new Error('Duplicate question');
    seenQuestions.add(questionId);
    const typeName = text(q.TypeName);
    if (typeName === 'SectionHeader') return [];
    const type = types[typeName] || 'unknown';
    const rating = type === 'rating_1_5' || type === 'rating_1_10';
    const scaleMax = type === 'rating_1_10' ? 10 : 5;
    if (rating && q.Scale != null) {
      const scale = object(q.Scale);
      if (scale.min !== 1 || scale.max !== scaleMax) throw new Error('Rating scale does not match question type');
    }
    if (type === 'unknown') warnings.push(`Unsupported question type: ${typeName}. Answers remain unscored.`);
    const questionText = text(q.QuestionText);
    let categoryId = categoryForQuestion(config, questionText);
    if (q.Category != null) {
      const category = object(q.Category);
      categoryId = `${projectId}_category_${text(category.key)}`;
      if (!categories.some(c => c.id === categoryId)) categories.push({ id: categoryId, projectId,
        name: text(category.label), description: '', order: categories.length, color: '#4c7dff' });
    }
    return [{ id: `${projectId}_q_${questionId}`, projectId, text: questionText,
      description: q.QuestionDescription == null ? undefined : text(q.QuestionDescription),
      type, categoryId, sourceColumn: String(questionId), displayOrder: q.DisplayOrder as number,
      scaleMin: rating ? 1 : undefined, scaleMax: rating ? scaleMax : undefined,
      isInverseScored: rating && config.inverseScoringPatterns.some(p => p.test(questionText)),
    }];
  });
  const questionMap = new Map(questions.map(q => [q.sourceColumn, q]));
  const testers: Tester[] = [];
  const responses: Response[] = [];
  const seenSubmissions = new Set<number>();
  for (const raw of array(data.responses)) {
    const row = object(raw);
    const submissionId = id(row.responseId);
    if (seenSubmissions.has(submissionId)) throw new Error('Duplicate submission');
    seenSubmissions.add(submissionId);
    const submittedAt = text(row.submittedAt);
    if (!Number.isFinite(Date.parse(submittedAt))) throw new Error('Invalid submission date');
    const profile = object(row.tester);
    const segments: TesterSegments = {};
    const fields = { country: 'country', gender: 'gender', ageRange: 'age_group', platforms: 'platform', gamerType: 'playstyles', gamingPreferences: 'genres', gamingHoursPerWeek: 'gaming_hours', hasController: 'has_controller', hasMicrophone: 'has_mic' } as const;
    for (const [field, segment] of Object.entries(fields)) {
      if (profile[field] != null) segments[segment] = Array.isArray(profile[field])
        ? (profile[field] as unknown[]).map(text).join(', ') : text(profile[field]);
    }
    const testerId = `${projectId}_s_${submissionId}`;
    testers.push({ id: testerId, testerId: `Tester-${submissionId}`, email: '', discord: '', segments,
      ageGroup: segments.age_group || '', country: segments.country || '', gamingProfile: segments.playstyles || '',
      hardware: 'Unavailable', similarGamesPlayed: [], rawProfileJson: {},
      ...mapProfileExtras(row, profile, testerId, new Map(questions.map(q => [q.sourceColumn, q.id]))),
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
      const rating = q.type === 'rating_1_5' || q.type === 'rating_1_10';
      const candidate = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
      const numericValue = rating && candidate >= 1 && candidate <= q.scaleMax! ? candidate : null;
      if (rating && value.trim() && numericValue === null) warnings.push(`Invalid rating in submission #${submissionId}; excluded from scores.`);
      responses.push({ id: `${testerId}_${q.id}`, projectId, testerId, questionId: q.id,
        rawAnswer: value, numericValue, normalizedScore: computeNormalizedScore(q, numericValue), submittedAt, matchStatus: 'matched' });
    }
    array(row.files);
  }
  const stats = object(data.stats);
  if (stats.totalResponses !== testers.length) throw new Error('Incomplete API dataset');
  const quality = computeTesterQuality({ testers, questions, responses, excludedCategoryIds: qualityExcludedCategoryIds(config.categories) });
  for (const tester of testers) {
    const q = quality.get(tester.id);
    if (q) { tester.quality = q; tester.avgRating = q.avgRating; tester.isOutlier = isConcerning(q); }
  }
  const project: Project = { id: projectId, name: text(test.TestName), gameName: config.gameName,
    playtestName: text(test.TestName), createdAt: '', totalResponses: testers.length, matchedTesters: testers.length, unmatchedTesters: 0,
    steamMatchGenres: Array.isArray(test.steamMatchGenres) ? test.steamMatchGenres.map(text) : undefined };
  return { project, questions, testers, responses, categories, warnings };
}
