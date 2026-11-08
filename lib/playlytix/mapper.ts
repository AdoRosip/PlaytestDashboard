import type { Category, Project, Question, QuestionType, Response, Tester, TesterSegments } from '../types';
import { categoryForQuestion, type GameConfig } from '../games';
import { computeNormalizedScore } from '../scoring';
import { computeTesterQuality, isConcerning, qualityExcludedCategoryIds } from '../outliers';
import { mapProfileExtras } from './profileMapper';
import { formatRanking, parseRankingAnswer } from '../ranking';

export function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid API object');
  return value;
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function positiveId(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null;
}
/** An answer as display text; null when the value has no usable form. */
function answerText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value); // e.g. Duration minutes
  // Multi-select answers arrive as a list of option labels.
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value.join(', ');
  return null;
}
const types: Record<string, QuestionType> = {
  Rating1_5: 'rating_1_5', Rating1_10: 'rating_1_10', ScaleAgree: 'rating_1_5',
  ScaleQuality: 'rating_1_5', ScaleIntent: 'rating_1_5', SingleChoice: 'multiple_choice',
  ShortText: 'free_text', LongText: 'free_text', URL: 'free_text', File: 'file_upload', Duration: 'duration',
  Ranking: 'ranking',
};
/** Form layout rather than questions: section titles and blocks of instructions or links. */
const layoutTypes = new Set(['SectionHeader', 'InfoBlock']);

/**
 * Build a client DTO with explicit profile/media allowlists and no operator fields.
 *
 * Only a payload that is not the requested test at all is rejected. A malformed
 * question, submission, answer or profile field is skipped and counted in
 * `warnings`, so one bad row never takes the whole report down.
 */
export function mapPortalData(input: unknown, clientId: string, testId: string, config: GameConfig) {
  const data = object(input);
  const test = object(data.test);
  if (String(id(test.TestID)) !== testId) throw new Error('Unexpected test');
  const rawQuestions = array(data.questions);
  const rawResponses = array(data.responses);
  const projectId = `portal_${clientId}_${testId}`;
  const warnings = ['People are represented by submissions; repeat submissions cannot be deduplicated. Participant counts in charts include submissions with answers. Registry enrichment is unavailable in Portal mode.'];
  if (config.id === 'portal-generic') warnings.push('No game-specific configuration: headline KPIs and inverse scoring are unavailable.');
  // Counted per reason so a bad column reads as one warning, not one per submission.
  const issues = new Map<string, number>();
  const skip = (reason: string) => issues.set(reason, (issues.get(reason) ?? 0) + 1);

  const categories: Category[] = config.categories.map(c => ({ ...c, projectId }));
  const seenQuestions = new Set<number>();
  const order = (q: Record<string, unknown>) => Number.isFinite(q.DisplayOrder) ? q.DisplayOrder as number : Infinity;
  const questions: Question[] = rawQuestions.filter((q): q is Record<string, unknown> => {
    if (!isRecord(q)) skip('Skipped a malformed question');
    return isRecord(q);
  }).sort((a, b) => order(a) - order(b)).flatMap(q => {
    const questionId = positiveId(q.QuestionID);
    if (questionId === null || typeof q.TypeName !== 'string' || typeof q.QuestionText !== 'string') {
      skip('Skipped a malformed question');
      return [];
    }
    if (seenQuestions.has(questionId)) {
      skip('Skipped a duplicate question');
      return [];
    }
    seenQuestions.add(questionId);
    const typeName = q.TypeName;
    if (layoutTypes.has(typeName)) return [];
    let type = types[typeName] || 'unknown';
    const scaleMax = type === 'rating_1_10' ? 10 : 5;
    // A scale that contradicts the type would mis-score every answer, so show them unscored.
    if ((type === 'rating_1_5' || type === 'rating_1_10') && q.Scale != null
      && (!isRecord(q.Scale) || q.Scale.min !== 1 || q.Scale.max !== scaleMax)) {
      skip('A rating scale did not match its question type; its answers are shown unscored');
      type = 'unknown';
    } else if (type === 'unknown') skip(`Unsupported question type ${typeName}; answers remain unscored`);
    const rating = type === 'rating_1_5' || type === 'rating_1_10';
    const questionText = q.QuestionText;
    // Option order is the scale's own order ("Far too easy" … "Far too hard"), which
    // charts keep. Only used for display, so a malformed list is ignored, not fatal.
    // A ranking's items come as Items: [{ name, url }], in the order the form lists them.
    const options = type === 'multiple_choice' && Array.isArray(q.Options) && q.Options.every(o => typeof o === 'string')
      ? (q.Options as string[]).map(o => o.trim()).filter(Boolean)
      : type === 'ranking' && Array.isArray(q.Items)
        ? [...new Set(q.Items.flatMap(i => isRecord(i) && typeof i.name === 'string' && i.name.trim() ? [i.name.trim()] : []))]
        : undefined;
    let categoryId = categoryForQuestion(config, questionText);
    if (q.Category != null) {
      const category = q.Category;
      if (isRecord(category) && typeof category.key === 'string' && typeof category.label === 'string') {
        categoryId = `${projectId}_category_${category.key}`;
        if (!categories.some(c => c.id === categoryId)) categories.push({ id: categoryId, projectId,
          name: category.label, description: '', order: categories.length, color: '#4c7dff' });
      } else skip('Ignored a malformed question category');
    }
    return [{ id: `${projectId}_q_${questionId}`, projectId, text: questionText,
      description: typeof q.QuestionDescription === 'string' ? q.QuestionDescription : undefined,
      type, categoryId, sourceColumn: String(questionId), displayOrder: Number.isFinite(q.DisplayOrder) ? q.DisplayOrder as number : undefined,
      scaleMin: rating ? 1 : undefined, scaleMax: rating ? scaleMax : undefined, options,
      isInverseScored: rating && config.inverseScoringPatterns.some(p => p.test(questionText)),
    }];
  });
  const questionMap = new Map(questions.map(q => [q.sourceColumn, q]));
  const questionIds = new Map(questions.map(q => [q.sourceColumn, q.id]));
  const testers: Tester[] = [];
  const responses: Response[] = [];
  const seenSubmissions = new Set<number>();
  for (const row of rawResponses) {
    if (!isRecord(row)) {
      skip('Skipped a malformed submission');
      continue;
    }
    const submissionId = positiveId(row.responseId);
    if (submissionId === null) {
      skip('Skipped a submission without a valid ID');
      continue;
    }
    if (seenSubmissions.has(submissionId)) {
      skip('Skipped a duplicate submission');
      continue;
    }
    seenSubmissions.add(submissionId);
    // The date only places the submission on the timeline; its answers are still valid without it.
    const submittedAt = typeof row.submittedAt === 'string' && Number.isFinite(Date.parse(row.submittedAt)) ? row.submittedAt : '';
    if (!submittedAt) skip('A submission has no valid submission date');
    const profile = isRecord(row.tester) ? row.tester : {};
    if (!isRecord(row.tester)) skip('A submission has no tester profile');
    const segments: TesterSegments = {};
    const fields = { country: 'country', gender: 'gender', ageRange: 'age_group', platforms: 'platform', gamerType: 'playstyles', gamingPreferences: 'genres', gamingHoursPerWeek: 'gaming_hours', hasController: 'has_controller', hasMicrophone: 'has_mic' } as const;
    for (const [field, segment] of Object.entries(fields)) {
      if (profile[field] == null) continue;
      const values = Array.isArray(profile[field]) ? profile[field] as unknown[] : [profile[field]];
      const strings = values.filter((v): v is string => typeof v === 'string');
      if (strings.length < values.length) skip('Ignored a malformed profile field');
      if (strings.length) segments[segment] = strings.join(', ');
    }
    const testerId = `${projectId}_s_${submissionId}`;
    testers.push({ id: testerId, testerId: `Tester-${submissionId}`, email: '', discord: '', segments,
      ageGroup: segments.age_group || '', country: segments.country || '', gamingProfile: segments.playstyles || '',
      hardware: 'Unavailable', similarGamesPlayed: [], rawProfileJson: {},
      ...mapProfileExtras(row, profile, testerId, questionIds, { testId, submissionId }),
    });
    if (!Array.isArray(row.answers)) skip('A submission has a malformed answer list');
    const answered = new Set<number>();
    for (const rawAnswer of Array.isArray(row.answers) ? row.answers : []) {
      const questionId = isRecord(rawAnswer) ? positiveId(rawAnswer.questionId) : null;
      if (!isRecord(rawAnswer) || questionId === null) {
        skip('Skipped a malformed answer');
        continue;
      }
      if (!seenQuestions.has(questionId)) {
        skip('Skipped an answer to an unknown question');
        continue;
      }
      if (answered.has(questionId)) {
        skip('Skipped a duplicate answer');
        continue;
      }
      answered.add(questionId);
      const q = questionMap.get(String(questionId));
      if (!q) continue; // section header
      // A ranking counts only when it orders every item exactly once; otherwise it is shown as given.
      const ranking = q.type === 'ranking' ? parseRankingAnswer(rawAnswer.value, q.options) : null;
      const value = ranking ? formatRanking(ranking) : answerText(rawAnswer.value);
      if (value === null) {
        // A missing value is simply unanswered; anything else is a shape we can't read.
        if (rawAnswer.value != null) skip('Skipped an answer with an unreadable value');
        continue;
      }
      const rating = q.type === 'rating_1_5' || q.type === 'rating_1_10';
      const candidate = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
      const numericValue = rating && candidate >= 1 && candidate <= q.scaleMax! ? candidate : null;
      if (rating && value.trim() && numericValue === null) skip('Invalid rating excluded from scores');
      if (q.type === 'ranking' && !ranking && value.trim()) skip('A ranking did not list each item exactly once; it is shown but not counted');
      responses.push({ id: `${testerId}_${q.id}`, projectId, testerId, questionId: q.id,
        rawAnswer: value, numericValue, normalizedScore: computeNormalizedScore(q, numericValue),
        ...(ranking ? { ranking } : {}), submittedAt, matchStatus: 'matched' });
    }
  }
  const reported = isRecord(data.stats) ? data.stats.totalResponses : undefined;
  if (typeof reported === 'number' && reported !== testers.length) {
    warnings.push(`The Portal reports ${reported} submissions; ${testers.length} were loaded.`);
  }
  for (const [reason, count] of issues) warnings.push(`${reason}${count > 1 ? ` (${count}×)` : ''}.`);
  const quality = computeTesterQuality({ testers, questions, responses, excludedCategoryIds: qualityExcludedCategoryIds(config.categories) });
  for (const tester of testers) {
    const q = quality.get(tester.id);
    if (q) { tester.quality = q; tester.avgRating = q.avgRating; tester.isOutlier = isConcerning(q); }
  }
  const testName = typeof test.TestName === 'string' && test.TestName.trim() ? test.TestName : `Playtest ${testId}`;
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;
  // The generic config has no real game title, so show the Portal test's name instead.
  const gameName = config.id === 'portal-generic' ? testName : config.gameName;
  const project: Project = { id: projectId, name: testName, gameName, gameConfigId: config.id,
    playtestName: testName, createdAt: '', totalResponses: testers.length, matchedTesters: testers.length, unmatchedTesters: 0,
    steamMatchGenres: strings(test.steamMatchGenres), steamMatchModes: strings(test.steamMatchModes) };
  return { project, questions, testers, responses, categories, warnings };
}
