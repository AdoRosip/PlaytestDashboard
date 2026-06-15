import * as XLSX from 'xlsx';
import type { QuestionType, SegmentKey, TesterSegments, Tester, Question, Response, Category, Project } from './types';
import { computeTesterQuality, isConcerning } from './outliers';
import { computeNormalizedScore } from './scoring';

const IGNORED_SHEETS = ['sheet2'];
const RESPONSES_KEYWORDS = ['response', 'answer', 'form'];
const REGISTRATION_KEYWORDS = ['registration', 'synced', 'profile', 'tester'];

function detectSheetRole(name: string): 'responses' | 'registration' | 'ignore' {
  const lower = name.toLowerCase();
  if (IGNORED_SHEETS.includes(lower)) return 'ignore';
  if (REGISTRATION_KEYWORDS.some((k) => lower.includes(k))) return 'registration';
  if (RESPONSES_KEYWORDS.some((k) => lower.includes(k))) return 'responses';
  return 'responses'; // default first sheet to responses
}

// Broad pattern for question-type classification (any mention of time/date concepts)
const TIMESTAMP_PATTERNS = /timestamp|submitted|date|time/i;
// Strict pattern for meta-column detection — only short, standalone timestamp fields
// (avoids swallowing long question headers that happen to mention "timestamp")
const META_TIMESTAMP_PATTERN = /^(timestamp|submitted|submission.?time|date|created.?at|response.?date|time.?stamp)$/i;
const ADMIN_PATTERNS = /admin|internal|note|payment|paid|status|amount|__empty/i;
const ID_PATTERNS = /\bid\b|tester.?id|user.?id|uid/i;
const EMAIL_PATTERNS = /email/i;
const DISCORD_PATTERNS = /discord/i;

// ---------------------------------------------------------------------------
// Category auto-assignment — maps question text to a category ID.
// Each rule is [categoryId, regex]. First match wins.
// Rules are ordered from most-specific to most-generic.
// ---------------------------------------------------------------------------
const CATEGORY_RULES: [string, RegExp][] = [
  // Admin / Internal (must come first — catch evaluation score, amount, empty cols)
  ['cat_15', /evaluation.?score|admin.?note|__empty|amount/i],

  // Technical & Evidence (performance, recordings, uploads)
  ['cat_09', /record.*(gameplay|image)|upload|footage|timestamp.*(confused|frustrated|stuck|exciting)|notes.*file|files.*upload|performance.?issue|fps.?drop|stuttering|floater.*fps|explosions/i],

  // Player Background
  ['cat_01', /similar.?game|which.*game.*played|hours.*factorio|hours.*satisfactory|factorio|satisfactory/i],

  // Core Mechanics — Zero Gravity & Mining
  ['cat_06', /zero.?gravity|navigating.*zero|movement.*disorienting|disorienting.*difficult|improve.*movement|movement.*improve|mining.?ore|laser.*mining|mining.*laser|mining.*repetitive|repetitive.*mining|improve.*mining|mining.*improve/i],

  // Automation & Factory Systems (logistics + automation + space transport)
  ['cat_07', /automated.?system.*work.?together|floater.?management|accelerator|resources.*flow|visually.?reward|logistics.*resource.*transport|resource.*transport.*system|managing.*moving.*resource|moving.*resources/i],

  // UI & Quality of Life
  ['cat_08', /user.?interface.*overall|navigate.*menu|menu.*navigat|parts.*user.?interface|quality.?of.?life/i],

  // Game Clarity & Onboarding (mechanics, objectives, guidance, stuck, trial-error)
  ['cat_04', /game.?mechanic.*overall|mechanic.*unclear|mechanic.*confus|new.?mechanic.*introduced|help.*understand|objective.*instruction|instruction.*manual|audio.?log|what.*looking.?for|stuck.*unsure.*progress|unsure.*how.*progress|caused.*this.*feeling|when.*this.*happened|intuitive.*trial|trial.*error/i],

  // Progression & Engagement (progress system, tier reached, pacing, factory growth)
  ['cat_05', /progression.?system|how.?far.*progress|stopped.?progress|pacing.*unlock|factory.?automat.*evolv|automat.*evolv|most.?exciting/i],

  // Retention & Market Fit (continue, recommend, stand out, why continue/stop)
  ['cat_03', /continue.*playing.*test|recommend.*friend|stand.?out.?compared|continue.*or.*stop|want.*to.*continue/i],

  // Overall Experience (enjoyment, frustration, quit moments, favourite part, hours)
  ['cat_02', /enjoy.*game.*overall|playtest.*stopped|stopped.*playing|frustrated.*confused.*bored|friction.*frustration|friction.*unnecessary|how.?many.?hours.*play|favourite|favorite/i],
];

function suggestCategory(questionText: string): string | null {
  for (const [catId, pattern] of CATEGORY_RULES) {
    if (pattern.test(questionText)) return catId;
  }
  return null;
}
const UPLOAD_PATTERNS = /upload|attachment|file|link|evidence/i;
const YES_NO_VALUES = new Set(['yes', 'no', 'true', 'false', '1', '0']);

function detectQuestionType(header: string, values: string[]): QuestionType {
  if (TIMESTAMP_PATTERNS.test(header)) return 'timestamp';
  if (ADMIN_PATTERNS.test(header)) return 'internal_admin';
  if (UPLOAD_PATTERNS.test(header)) return 'file_upload';

  const nonEmpty = values.filter((v) => v.trim().length > 0);
  if (nonEmpty.length === 0) return 'unknown';

  // check if all values are numeric
  const allNumeric = nonEmpty.every((v) => !isNaN(Number(v)));
  if (allNumeric) {
    const nums = nonEmpty.map(Number);
    const max = Math.max(...nums);
    const min = Math.min(...nums);
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

function findColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const header of headers) {
    if (patterns.some((p) => p.test(header))) return header;
  }
  return null;
}

function safeIso(value: unknown): string {
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
];

const HW_CPU_PATTERN = /^\s*cpu\s*$/i;
const HW_GPU_PATTERN = /\bgpu\b|display\s*adapter|graphics\s*card|video\s*card|\bvga\b/i;
const HW_RAM_PATTERN = /^\s*ram\s*$|\bsystem\s*memory\b/i;

function classifySegmentColumn(header: string): SegmentKey | 'hw_cpu' | 'hw_gpu' | 'hw_ram' | null {
  if (HW_CPU_PATTERN.test(header)) return 'hw_cpu';
  if (HW_GPU_PATTERN.test(header)) return 'hw_gpu';
  if (HW_RAM_PATTERN.test(header)) return 'hw_ram';
  for (const [key, pattern] of SEGMENT_RULES) {
    if (pattern.test(header)) return key;
  }
  return null;
}

function deriveHardwareTier(ram: string, gpu: string): 'Low' | 'Mid' | 'High' | 'Unknown' {
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

export function parseExcelFile(buffer: ArrayBuffer, fileName: string): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const warnings: string[] = [];

  // Identify sheets
  let responsesSheet: XLSX.WorkSheet | null = null;
  let registrationSheet: XLSX.WorkSheet | null = null;

  for (const name of workbook.SheetNames) {
    const role = detectSheetRole(name);
    if (role === 'responses' && !responsesSheet) {
      responsesSheet = workbook.Sheets[name];
    } else if (role === 'registration' && !registrationSheet) {
      registrationSheet = workbook.Sheets[name];
    }
  }

  if (!responsesSheet) {
    warnings.push('Could not find a Responses sheet. Using first sheet.');
    responsesSheet = workbook.Sheets[workbook.SheetNames[0]];
  }

  // Parse registration data
  const testerMap: Map<string, Tester> = new Map();
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

        if (id) testerMap.set(id, tester);
        if (email) testerMap.set(email.toLowerCase(), tester);
        if (discord) testerMap.set(discord.toLowerCase(), tester);
      });
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
    const type = detectQuestionType(col, values);
    return {
      id: `q_${String(i).padStart(3, '0')}`,
      projectId: 'proj_import',
      text: col.replace(/\r\n/g, ' ').trim(), // flatten multi-line Google Form headers
      type,
      categoryId: suggestCategory(col),
      sourceColumn: col,
      scaleMin: type === 'rating_1_5' ? 1 : type === 'rating_1_10' ? 1 : undefined,
      scaleMax: type === 'rating_1_5' ? 5 : type === 'rating_1_10' ? 10 : undefined,
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

    const matchedProfile = testerMap.get(rawId) ?? testerMap.get(rawEmail) ?? testerMap.get(rawDiscord);
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
        testerId: rawId || rawEmail || `Unknown-${rowIdx}`,
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

  const defaultCategories: Category[] = [
    { id: 'cat_01', projectId: 'proj_import', name: 'Player Background',            description: 'Gaming history and genre experience — used as a segmentation lens', order: 1,  color: '#00FFFF' },
    { id: 'cat_02', projectId: 'proj_import', name: 'Overall Experience',           description: 'Enjoyment, frustration, favourite moments, and session length', order: 2,  color: '#0066FF' },
    { id: 'cat_03', projectId: 'proj_import', name: 'Retention & Market Fit',       description: 'Replay intent, NPS, and what makes the game stand out', order: 3,  color: '#6366F1' },
    { id: 'cat_04', projectId: 'proj_import', name: 'Game Clarity & Onboarding',   description: 'Mechanic comprehension, objectives, guidance, and feeling stuck', order: 4,  color: '#0000EE' },
    { id: 'cat_05', projectId: 'proj_import', name: 'Progression & Engagement',    description: 'Progress depth, pacing, stopping reasons, and peak excitement', order: 5,  color: '#FFF' },
    { id: 'cat_06', projectId: 'proj_import', name: 'Core Mechanics',              description: 'Zero-gravity movement and laser mining feel', order: 6,  color: '#00FFFF' },
    { id: 'cat_07', projectId: 'proj_import', name: 'Automation & Factory Systems',description: 'Logistics, resource transport, automation satisfaction', order: 7,  color: '#0066FF' },
    { id: 'cat_08', projectId: 'proj_import', name: 'UI & Quality of Life',        description: 'Interface clarity, menu navigation, and QoL requests', order: 8,  color: '#6366F1' },
    { id: 'cat_09', projectId: 'proj_import', name: 'Technical & Evidence',        description: 'Performance issues, bugs, and gameplay recordings', order: 9,  color: '#0000EE' },
    { id: 'cat_15', projectId: 'proj_import', name: 'Admin / Internal',            description: 'Internal scoring and payment data — excluded from report', order: 10, color: '#334155' },
  ];

  // ── Tester avg rating + outlier / quality detection ───────────────────────
  // Robust per-question-deviation method, implemented in lib/outliers.ts.
  const quality = computeTesterQuality({ testers: participantTesters, questions, responses });
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
    gameName: 'Exovia',
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
