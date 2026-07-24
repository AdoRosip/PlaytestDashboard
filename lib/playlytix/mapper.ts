// Pure transform: Playlytix portal API JSON -> the same ParseResult shape
// lib/parser.ts produces from an Excel upload. No server-only imports here —
// this runs client-side so switching the detected game can re-map an
// already-fetched payload instantly, without a second network round trip.
import type { Category, Project, Question, QuestionType, Response, Tester, TesterSegments } from '../types';
import { categoryForQuestion, type GameConfig } from '../games';
import { computeNormalizedScore, isRatingType } from '../scoring';
import { computeTesterQuality, isConcerning } from '../outliers';
import { deriveHardwareTier, type ParseResult } from '../parser';
import type { PlaylytixQuestionTypeName, PlaylytixTestResponsesPayload } from './types';

function mapQuestionType(typeName: PlaylytixQuestionTypeName): QuestionType {
  switch (typeName) {
    case 'Rating1_5': return 'rating_1_5';
    case 'File': return 'file_upload';
    case 'ShortText':
    case 'LongText':
    case 'URL':
    default:
      return 'free_text';
  }
}

/**
 * Map one `GET /tests/:id/responses` payload into the dashboard's internal
 * shape under the given game config (categories, category-assignment rules,
 * inverse-scoring patterns — see lib/games/*).
 *
 * Known gap: the payload's `files[]`, `comments[]`, `evaluationScore`,
 * `payoutAmount` and `payoutStatus` have no home in the current data model
 * (nothing in the dashboard renders them yet). They're preserved on each
 * tester's `rawProfileJson` so the data isn't silently dropped, but building
 * UI for them is separate follow-up work.
 */
export function mapPlaylytixTestToParseResult(
  payload: PlaylytixTestResponsesPayload,
  config: GameConfig,
): ParseResult {
  const warnings: string[] = [];
  const projectId = `proj_playlytix_${payload.test.TestID}`;

  const suggestCategory = (text: string) => categoryForQuestion(config, text);
  const isInverseScoredQuestion = (text: string) => config.inverseScoringPatterns.some((p) => p.test(text));

  // SectionHeaders are layout headings, not questions — the API docs say to skip
  // them entirely; they carry no answers and no files.
  const apiQuestions = payload.questions
    .filter((q) => q.TypeName !== 'SectionHeader')
    .slice()
    .sort((a, b) => a.DisplayOrder - b.DisplayOrder);

  const questions: Question[] = apiQuestions.map((q) => {
    const type = mapQuestionType(q.TypeName);
    return {
      id: `q_${q.QuestionID}`,
      projectId,
      text: q.QuestionText,
      type,
      categoryId: suggestCategory(q.QuestionText),
      sourceColumn: String(q.QuestionID),
      scaleMin: q.TypeName === 'Rating1_5' ? 1 : undefined,
      scaleMax: q.TypeName === 'Rating1_5' ? 5 : undefined,
      isInverseScored: isRatingType(type) && isInverseScoredQuestion(q.QuestionText) ? true : undefined,
    };
  });
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const testers: Tester[] = [];
  const responses: Response[] = [];
  let anonymizedCount = 0;

  for (const r of payload.responses) {
    const t = r.tester;
    const segments: TesterSegments = {};
    if (t.ageRange) segments.age_group = t.ageRange;
    if (t.gender) segments.gender = t.gender;
    if (t.country) segments.country = t.country;
    if (t.platforms) segments.platform = t.platforms;
    if (t.gamerType) segments.gamer_type = t.gamerType;
    if (t.gamingPreferences) segments.gaming_pref = t.gamingPreferences;
    const hwTier = deriveHardwareTier(t.ram ?? '', t.gpu ?? '');
    segments.hardware_tier = hwTier;

    if (t.anonymous) anonymizedCount++;

    const testerId = `tstr_playlytix_${r.responseId}`;
    const tester: Tester = {
      id: testerId,
      testerId: t.anonymous ? `Anonymous #${r.responseId}` : (t.email ?? `Tester #${r.responseId}`),
      email: t.anonymous ? '' : (t.email ?? ''),
      discord: '',
      segments,
      ageGroup: segments.age_group ?? '',
      country: segments.country ?? '',
      gamingProfile: segments.gamer_type ?? '',
      hardware: hwTier !== 'Unknown' ? `${hwTier}-end` : (t.gpu || t.ram || 'Unknown'),
      similarGamesPlayed: [],
      rawProfileJson: {
        ...t,
        responseId: r.responseId,
        submittedAt: r.submittedAt,
        evaluationScore: r.evaluationScore,
        payoutAmount: r.payoutAmount,
        payoutStatus: r.payoutStatus,
        files: r.files,
        comments: r.comments,
      },
    };
    testers.push(tester);

    for (const a of r.answers) {
      const q = questionById.get(`q_${a.questionId}`);
      if (!q) continue; // references a SectionHeader or an id we don't know — nothing to attach it to
      const numericValue = a.value.trim() !== '' && !isNaN(Number(a.value)) ? Number(a.value) : null;
      responses.push({
        id: `r_${r.responseId}_${q.id}`,
        projectId,
        testerId,
        questionId: q.id,
        rawAnswer: a.value,
        numericValue,
        normalizedScore: computeNormalizedScore(q, numericValue),
        submittedAt: r.submittedAt,
        matchStatus: 'matched',
      });
    }
  }

  // Tester avg rating + outlier detection, same method the Excel importer uses.
  const quality = computeTesterQuality({ testers, questions, responses });
  for (const tester of testers) {
    const q = quality.get(tester.id);
    if (!q) continue;
    tester.quality = q;
    tester.avgRating = q.avgRating;
    tester.isOutlier = isConcerning(q);
  }

  if (anonymizedCount > 0) {
    warnings.push(
      `${anonymizedCount} tester${anonymizedCount === 1 ? '' : 's'} opted out of name-sharing and appear as "Anonymous".`,
    );
  }
  const skippedSections = payload.questions.length - apiQuestions.length;
  if (skippedSections > 0) {
    warnings.push(
      `${skippedSections} section header${skippedSections === 1 ? '' : 's'} skipped (layout only, not a question).`,
    );
  }

  const categories: Category[] = config.categories;
  const project: Project = {
    id: projectId,
    name: payload.test.TestName,
    gameName: config.gameName,
    playtestName: payload.test.TestName,
    createdAt: new Date().toISOString(),
    totalResponses: testers.length,
    matchedTesters: testers.length,
    unmatchedTesters: 0,
  };

  return { project, testers, categories, questions, responses, warnings };
}
