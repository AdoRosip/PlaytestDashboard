import * as XLSX from 'xlsx';
import type { QuestionType, SegmentKey, TesterSegments, Tester, Question, Response, Category, Project } from './types';
import { computeTesterQuality, isConcerning, qualityExcludedCategoryIds } from './outliers';
import { computeNormalizedScore, isRatingType } from './scoring';
import { categoryForQuestion, type GameConfig } from './games';
import { isEmailLike } from './testerIdentity';

const IGNORED_SHEETS = ['sheet2'];
const RESPONSES_KEYWORDS = ['response', 'answer', 'form'];
const REGISTRATION_KEYWORDS = ['registration', 'synced', 'profile', 'tester'];

function detectSheetRole(name: string): 'responses' | 'registration' | 'ignore' | 'unknown' {
  const lower = name.toLowerCase();
  if (IGNORED_SHEETS.includes(lower)) return 'ignore';
  // Prefer an explicit response marker when a name contains both concepts
  // (for example "Tester Responses").
  if (RESPONSES_KEYWORDS.some((k) => lower.includes(k))) return 'responses';
  if (REGISTRATION_KEYWORDS.some((k) => lower.includes(k))) return 'registration';
  return 'unknown';
}

// Strict, anchored pattern for meta-column detection — only short, standalone
// timestamp fields. An anchored match (rather than a broad substring search)
// keeps long question headers that merely mention "time"/"date" from being
// mis-typed as a timestamp column — e.g. "...automation meaningfully evolved
// over time?" is a rating question, not a timestamp.
const META_TIMESTAMP_PATTERN = /^(timestamp|submitted|submission.?time|date|created.?at|response.?date|time.?stamp)$/i;
// Admin/internal field names. Kept loose because real admin columns are terse
// ("Admin Notes", "Payment Status"), but detectQuestionType gates this behind a
// word-count guard so a question that merely says "NOTE:" isn't treated as admin.
const ADMIN_PATTERNS = /admin|internal|note|payment|paid|status|amount|__empty/i;
export const ID_PATTERNS = /\bid\b|tester.?id|user.?id|uid/i;
export const EMAIL_PATTERNS = /email/i;
export const DISCORD_PATTERNS = /discord/i;

// ---------------------------------------------------------------------------
// Category auto-assignment + inverse-scoring detection are game-specific and
// now live in the active GameConfig (lib/games/*). The helpers below close over
// a config's rules; the parser builds them once per import.
// ---------------------------------------------------------------------------
function makeSuggestCategory(config: GameConfig) {
  return (questionText: string): string | null => categoryForQuestion(config, questionText);
}

function makeIsInverseScored(config: GameConfig) {
  return (text: string): boolean => config.inverseScoringPatterns.some((p) => p.test(text));
}
const UPLOAD_PATTERNS = /upload|attachment|file|link|evidence/i;
const YES_NO_VALUES = new Set(['yes', 'no', 'true', 'false', '1', '0']);

function explicitRatingScale(header: string): 5 | 10 | null {
  const compact = header.replace(/[–—]/g, '-');
  if (
    /\b1\s*(?:-|to|through)\s*10\b/i.test(compact) ||
    /\b(?:out of|scale(?:\s+of)?|\/)\s*10\b/i.test(compact) ||
    /\b10\s*=\s*(?:best|highest|excellent)/i.test(compact)
  ) return 10;
  if (
    /\b1\s*(?:-|to|through)\s*5\b/i.test(compact) ||
    /\b(?:out of|scale(?:\s+of)?|\/)\s*5\b/i.test(compact) ||
    /\b5\s*=\s*(?:best|highest|excellent)/i.test(compact)
  ) return 5;
  return null;
}

function detectQuestionType(header: string, values: string[]): QuestionType {
  // Meta columns (timestamp / admin) are short field names, never long question
  // prose. Guard on word count so a real question that contains "time"
  // ("...evolved over time?") or a "NOTE:" instruction prefix isn't mis-typed as
  // a meta column — those mis-types render as an empty card on the category page.
  const wordCount = header.trim().split(/\s+/).length;
  if (META_TIMESTAMP_PATTERN.test(header)) return 'timestamp';
  if (wordCount <= 4 && ADMIN_PATTERNS.test(header)) return 'internal_admin';
  if (UPLOAD_PATTERNS.test(header)) return 'file_upload';

  const nonEmpty = values.filter((v) => v.trim().length > 0);
  if (nonEmpty.length === 0) return 'unknown';

  // Rating detection — tolerant of a few non-numeric outliers. On a 1–5 frequency
  // scale a tester will occasionally type "Never" / "N/A" instead of a number;
  // that shouldn't demote the whole question out of rating analysis (and, for
  // negatively-valenced ones, out of inverse scoring). As long as the strong
  // majority of answers are numbers in a 1–5 / 1–10 range it's a rating; the
  // stray text answers parse to a null score downstream.
  const numeric = nonEmpty.map(Number).filter((n) => !isNaN(n));
  const numericFrac = numeric.length / nonEmpty.length;
  if (numericFrac === 1 || (numeric.length >= 5 && numericFrac >= 0.85)) {
    const declaredScale = explicitRatingScale(header);
    if (declaredScale === 5) return 'rating_1_5';
    if (declaredScale === 10) return 'rating_1_10';
    const max = Math.max(...numeric);
    const min = Math.min(...numeric);
    if (min >= 1 && max <= 5) return 'rating_1_5';
    if (min >= 1 && max <= 10) return 'rating_1_10';
  }

  // check yes/no
  const unique = new Set(nonEmpty.map((v) => v.toLowerCase().trim()));
  if (unique.size <= 3 && [...unique].every((v) => YES_NO_VALUES.has(v))) return 'yes_no';

  // check multiple choice (few distinct values)
  if (unique.size <= 8 && nonEmpty.length >= 5) return 'multiple_choice';

  return 'free_text';
}

export function findColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const header of headers) {
    if (patterns.some((p) => p.test(header))) return header;
  }
  return null;
}

export function safeIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  // xlsx with cellDates:true gives us a real Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
  }
  // numeric Excel serial date
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S).toISOString();
  }
  // string — try parsing it
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ---------------------------------------------------------------------------
// Registration column → segment key classifier
// ---------------------------------------------------------------------------
const SEGMENT_RULES: [SegmentKey, RegExp][] = [
  ['age_group',     /what is your age|age group/i],
  ['gender',        /gender/i],
  ['country',       /which country|country.*live/i],
  ['employment',    /employment status/i],
  ['availability',  /availability.*work|current availability/i],
  ['platform',      /platform.*play|play.*platform/i],
  ['gamer_type',    /type of gamer/i],
  ['gaming_pref',   /gaming preference/i],
  ['gaming_hours',  /hours.*gaming|typical hours/i],
  ['industry',      /industr/i],
  ['has_controller',/do you have a controller/i],
  ['has_mic',       /do you have a microphone/i],
  // Genre / playstyle enrichment from the "Type of Gamer" registry file.
  ['genres',        /what genres|genres.*play/i],
  ['playstyles',    /preferred playstyle|playstyles?/i],
];

const HW_CPU_PATTERN = /^\s*cpu\s*$/i;
const HW_GPU_PATTERN = /\bgpu\b|display\s*adapter|graphics\s*card|video\s*card|\bvga\b/i;
const HW_RAM_PATTERN = /^\s*ram\s*$|\bsystem\s*memory\b/i;

export function classifySegmentColumn(header: string): SegmentKey | 'hw_cpu' | 'hw_gpu' | 'hw_ram' | null {
  if (HW_CPU_PATTERN.test(header)) return 'hw_cpu';
  if (HW_GPU_PATTERN.test(header)) return 'hw_gpu';
  if (HW_RAM_PATTERN.test(header)) return 'hw_ram';
  for (const [key, pattern] of SEGMENT_RULES) {
    if (pattern.test(header)) return key;
  }
  return null;
}

export function deriveHardwareTier(ram: string, gpu: string): 'Low' | 'Mid' | 'High' | 'Unknown' {
  const g = gpu.trim();

  // ── HIGH ────────────────────────────────────────────────────────────
  if (
    /rtx\s*40[7-9]\d|rtx\s*4[1-9]\d\d/i.test(g) ||  // RTX 4070/4080/4090+
    /rtx\s*40[456]/i.test(g) === false && /rtx\s*4\d\d\d/i.test(g) ||  // any other RTX 4xxx
    /rtx\s*30[789]\d/i.test(g) ||                      // RTX 3070/3080/3090
    /rtx\s*2080/i.test(g) ||                            // RTX 2080 / Super / Ti
    /rx\s*6[789]\d\d/i.test(g) ||                       // RX 6700 XT / 6800 / 6900
    /rx\s*7[6-9]\d\d/i.test(g) ||                       // RX 7600-7900
    /radeon\s*vii/i.test(g)
  ) return 'High';

  // ── MID ─────────────────────────────────────────────────────────────
  if (
    /rtx\s*40[456]/i.test(g) ||           // RTX 4050/4060 (Ti)
    /rtx\s*30[56]\d?/i.test(g) ||          // RTX 3050/3060 (Ti)
    /rtx\s*20[67]\d/i.test(g) ||           // RTX 2060/2070
    /gtx\s*1080/i.test(g) ||               // GTX 1080 / Ti
    /gtx\s*1070/i.test(g) ||               // GTX 1070 / Ti
    /gtx\s*166\d/i.test(g) ||              // GTX 1660 / Ti / Super
    /gtx\s*1650\s*ti/i.test(g) ||          // GTX 1650 Ti (not base 1650)
    /rx\s*5[5-7]\d\d/i.test(g) ||          // RX 5500 XT / 5600 XT / 5700 XT
    /rx\s*6[3-6]\d\d/i.test(g) ||          // RX 6300–6650
    /rx\s*58[05]|rx\s*590/i.test(g) ||     // RX 580 / 585 / 590
    /arc\s*a[57][57]0/i.test(g)            // Intel Arc A550/A580/A750/A770
  ) return 'Mid';

  // ── LOW ─────────────────────────────────────────────────────────────
  if (
    /gtx\s*1060/i.test(g) ||
    /gtx\s*1050/i.test(g) ||
    /gtx\s*1030/i.test(g) ||
    /gtx\s*1630/i.test(g) ||
    /gtx\s*1650(?!\s*ti)/i.test(g) ||      // GTX 1650 base (not Ti)
    /gtx\s*9[5-9]\d\d?/i.test(g) ||        // GTX 950/960/970/980
    /gtx\s*[678]\d\d/i.test(g) ||           // GTX 6xx/7xx/8xx (old)
    /rx\s*5[0-4]\d\d/i.test(g) ||           // RX 5000–5450
    /rx\s*57[05]/i.test(g) ||               // RX 570/575
    /rx\s*5[5-6]\d(?!\d)/i.test(g) ||       // RX 550/560
    /rx\s*4\d\d/i.test(g) ||                // RX 400 series
    /intel\s*(uhd|iris|hd\s*graph)/i.test(g) ||               // Intel integrated
    /amd\s*(vega\s*\d|radeon\s*graphics(?!\s+rx))/i.test(g) || // AMD integrated APU
    /\bintegrated\b/i.test(g) ||
    /arc\s*a[23]\d\d/i.test(g) ||           // Intel Arc A310/A380 (entry)
    /\bgt\s+\d{3,4}(?!\s*[xi])/i.test(g)   // GT xxx (not GTX/GTi)
  ) return 'Low';

  // ── RAM fallback when GPU model is unrecognised ──────────────────────
  // Validate range 4–512 GB to avoid false-matching GPU model numbers like "3060"
  const parseRamGb = (s: string) => {
    const m = s.match(/\b(\d+)\s*gb\b/i);
    const n = m ? parseInt(m[1]) : 0;
    return n >= 4 && n <= 512 ? n : 0;
  };
  const ramGb = parseRamGb(ram) || parseRamGb(gpu);
  if (ramGb >= 32) return 'High';
  if (ramGb >= 16) return 'Mid';
  if (ramGb >= 8)  return 'Low';

  return 'Unknown';
}

export interface ParseResult {
  project: Project;
  testers: Tester[];
  categories: Category[];
  questions: Question[];
  responses: Response[];
  warnings: string[];
}

export function parseExcelFile(buffer: ArrayBuffer, fileName: string, config: GameConfig): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const warnings: string[] = [];
  const suggestCategory = makeSuggestCategory(config);
  const isInverseScoredQuestion = makeIsInverseScored(config);

  // Identify sheets
  let responsesSheet: XLSX.WorkSheet | null = null;
  let registrationSheet: XLSX.WorkSheet | null = null;

  const fallbackResponseSheets: XLSX.WorkSheet[] = [];
  for (const name of workbook.SheetNames) {
    const role = detectSheetRole(name);
    if (role === 'responses' && !responsesSheet) {
      responsesSheet = workbook.Sheets[name];
    } else if (role === 'registration' && !registrationSheet) {
      registrationSheet = workbook.Sheets[name];
    } else if (role === 'unknown') {
      fallbackResponseSheets.push(workbook.Sheets[name]);
    }
  }

  if (!responsesSheet) {
    warnings.push('Could not find an explicitly named Responses sheet. Using the first unclassified sheet.');
    responsesSheet = fallbackResponseSheets[0] ?? workbook.Sheets[workbook.SheetNames[0]];
  }

  // Parse registration data
  const idMap = new Map<string, Tester>();
  const emailMap = new Map<string, Tester>();
  const discordMap = new Map<string, Tester>();
  const ambiguousIds = new Set<string>();
  const ambiguousEmails = new Set<string>();
  const ambiguousDiscords = new Set<string>();
  const addUniqueKey = (
    map: Map<string, Tester>,
    ambiguous: Set<string>,
    key: string,
    tester: Tester,
  ) => {
    if (!key || ambiguous.has(key)) return;
    if (map.has(key)) {
      map.delete(key);
      ambiguous.add(key);
      return;
    }
    map.set(key, tester);
  };
  const isUsableContactKey = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized) && !new Set(['no', 'n/a', 'na', 'none', 'unknown', '-', '0']).has(normalized);
  };
  if (registrationSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(registrationSheet, { defval: '' });
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      const idCol = findColumn(headers, [ID_PATTERNS]) ?? headers[0];
      const emailCol = findColumn(headers, [EMAIL_PATTERNS]);
      const discordCol = findColumn(headers, [DISCORD_PATTERNS]);

      rows.forEach((row, i) => {
        const id = String(row[idCol] ?? '').trim();
        const email = emailCol ? String(row[emailCol] ?? '').trim() : '';
        const discord = discordCol ? String(row[discordCol] ?? '').trim() : '';

        // Build segments from all registration columns dynamically
        const segments: TesterSegments = {};
        let hwGpu = '', hwRam = '';
        for (const header of headers) {
          const role = classifySegmentColumn(header);
          const value = String(row[header] ?? '').trim();
          if (!role || !value) continue;
          if (role === 'hw_cpu') continue;
          if (role === 'hw_gpu') { hwGpu = value; continue; }
          if (role === 'hw_ram') { hwRam = value; continue; }
          segments[role] = value;
        }
        const hwTier = deriveHardwareTier(hwRam, hwGpu);
        segments.hardware_tier = hwTier; // always set — 'Unknown' visible in breakdown

        const tester: Tester = {
          id: `tstr_${i}`,
          testerId: id || `T-${String(i).padStart(3, '0')}`,
          email,
          discord,
          segments,
          ageGroup: segments.age_group ?? '',
          country: segments.country ?? '',
          gamingProfile: segments.gamer_type ?? '',
          hardware: hwTier !== 'Unknown' ? `${hwTier}-end` : (hwGpu || hwRam || 'Unknown'),
          similarGamesPlayed: [],
          rawProfileJson: row as Record<string, unknown>,
        };

        if (id) addUniqueKey(idMap, ambiguousIds, id, tester);
        if (isUsableContactKey(email)) {
          addUniqueKey(emailMap, ambiguousEmails, email.toLowerCase(), tester);
        }
        if (isUsableContactKey(discord)) {
          addUniqueKey(discordMap, ambiguousDiscords, discord.toLowerCase(), tester);
        }
      });
      if (ambiguousIds.size + ambiguousEmails.size + ambiguousDiscords.size > 0) {
        warnings.push('Duplicate registration identifiers were ignored instead of being matched ambiguously.');
      }
    }
  }

  // Parse responses
  const responseRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(responsesSheet, { defval: '' });
  if (responseRows.length === 0) {
    warnings.push('Responses sheet appears to be empty.');
  }

  const headers = responseRows.length > 0 ? Object.keys(responseRows[0]) : [];

  // Identify meta columns
  const idCol = findColumn(headers, [ID_PATTERNS]);
  const emailCol = findColumn(headers, [EMAIL_PATTERNS]);
  const discordCol = findColumn(headers, [DISCORD_PATTERNS]);
  const timestampCol = findColumn(headers, [META_TIMESTAMP_PATTERN]);

  const metaCols = new Set([idCol, emailCol, discordCol, timestampCol].filter(Boolean) as string[]);

  // Build questions from non-meta columns
  const questionCols = headers.filter((h) => !metaCols.has(h));
  const questions: Question[] = questionCols.map((col, i) => {
    const values = responseRows.map((r) => String(r[col] ?? ''));
    const text = col.replace(/\r\n/g, ' ').trim(); // flatten multi-line Google Form headers
    const categoryId = suggestCategory(col);
    const category = config.categories.find((c) => c.id === categoryId);
    const type = category && /admin|internal/i.test(category.name)
      ? 'internal_admin'
      : detectQuestionType(col, values);
    return {
      id: `q_${String(i).padStart(3, '0')}`,
      projectId: 'proj_import',
      text,
      type,
      categoryId,
      sourceColumn: col,
      scaleMin: type === 'rating_1_5' ? 1 : type === 'rating_1_10' ? 1 : undefined,
      scaleMax: type === 'rating_1_5' ? 5 : type === 'rating_1_10' ? 10 : undefined,
      // Auto-flip negatively-valenced ratings (high answer = worse experience).
      isInverseScored: isRatingType(type) && isInverseScoredQuestion(text) ? true : undefined,
    };
  });

  // Build responses + participant testers. The response sheet is the source of
  // truth for participation; registration only enriches submitted rows.
  const participantTesters: Tester[] = [];
  let unmatchedCount = 0;
  let matchedCount = 0;
  const responses: Response[] = [];

  responseRows.forEach((row, rowIdx) => {
    const hasSubmission = questionCols.some(col => String(row[col] ?? '').trim().length > 0);
    if (!hasSubmission) return;

    const rawId = idCol ? String(row[idCol] ?? '').trim() : '';
    const rawEmail = emailCol ? String(row[emailCol] ?? '').trim().toLowerCase() : '';
    const rawDiscord = discordCol ? String(row[discordCol] ?? '').trim().toLowerCase() : '';
    const submittedAt = safeIso(timestampCol ? row[timestampCol] : null);

    const matchedProfile =
      (rawId ? idMap.get(rawId) : undefined) ??
      (isUsableContactKey(rawEmail) ? emailMap.get(rawEmail) : undefined) ??
      (isUsableContactKey(rawDiscord) ? discordMap.get(rawDiscord) : undefined);
    let matchStatus: 'matched' | 'unmatched' | 'needs_check' = 'matched';
    let tester: Tester;

    if (matchedProfile) {
      matchedCount++;
      tester = {
        ...matchedProfile,
        id: `tstr_resp_${rowIdx}`,
      };
    } else {
      matchStatus = 'needs_check';
      unmatchedCount++;
      const placeholderId = `tstr_unmatched_${rowIdx}`;
      tester = {
        id: placeholderId,
        // Email is only a private matching key. It must never become the
        // display identifier when the questionnaire has no tester id.
        testerId: rawId && !isEmailLike(rawId) ? rawId : `Unmatched-${rowIdx}`,
        email: rawEmail,
        discord: rawDiscord,
        segments: {},
        ageGroup: '', country: '', gamingProfile: '',
        hardware: '', similarGamesPlayed: [], rawProfileJson: {},
      };
    }
    participantTesters.push(tester);

    questions.forEach((q) => {
      const rawAnswer = String(row[q.sourceColumn] ?? '').trim();
      if (!rawAnswer) return;

      const numericValue = !isNaN(Number(rawAnswer)) && rawAnswer.length > 0
        ? Number(rawAnswer)
        : null;

      const normalizedScore = computeNormalizedScore(q, numericValue);

      responses.push({
        id: `r_${rowIdx}_${q.id}`,
        projectId: 'proj_import',
        testerId: tester.id,
        questionId: q.id,
        rawAnswer,
        numericValue,
        normalizedScore,
        submittedAt,
        matchStatus,
      });
    });
  });

  const defaultCategories: Category[] = config.categories;

  // ── Tester avg rating + outlier / quality detection ───────────────────────
  // Robust per-question-deviation method, implemented in lib/outliers.ts.
  const quality = computeTesterQuality({
    testers: participantTesters,
    questions,
    responses,
    excludedCategoryIds: qualityExcludedCategoryIds(defaultCategories),
  });
  for (const tester of participantTesters) {
    const q = quality.get(tester.id);
    if (!q) continue;
    tester.quality = q;
    tester.avgRating = q.avgRating;
    tester.isOutlier = isConcerning(q);
  }

  const project: Project = {
    id: 'proj_import',
    name: fileName.replace(/\.(xlsx|xls)$/i, ''),
    gameName: config.gameName,
    playtestName: fileName,
    createdAt: new Date().toISOString(),
    totalResponses: participantTesters.length,
    matchedTesters: matchedCount,
    unmatchedTesters: unmatchedCount,
  };

  return {
    project,
    testers: participantTesters,
    categories: defaultCategories,
    questions,
    responses,
    warnings,
  };
}
