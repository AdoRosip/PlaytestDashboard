export type QuestionType =
  | 'rating_1_5'
  | 'rating_1_10'
  | 'yes_no'
  | 'multiple_choice'
  | 'free_text'
  | 'file_upload'
  | 'timestamp'
  | 'internal_admin'
  | 'unknown';

export type SegmentKey =
  | 'age_group'
  | 'gender'
  | 'country'
  | 'employment'
  | 'availability'
  | 'platform'
  | 'gamer_type'
  | 'gaming_pref'
  | 'gaming_hours'
  | 'industry'
  | 'hardware_tier'
  | 'has_controller'
  | 'has_mic';

export type TesterSegments = Partial<Record<SegmentKey, string>>;

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  age_group:      'Age Group',
  gender:         'Gender',
  country:        'Country',
  employment:     'Employment',
  availability:   'Availability',
  platform:       'Platform',
  gamer_type:     'Gamer Type',
  gaming_pref:    'Gaming Prefs',
  gaming_hours:   'Hours / week',
  industry:       'Industry',
  hardware_tier:  'Hardware Tier',
  has_controller: 'Controller',
  has_mic:        'Microphone',
};

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
export type MatchStatus = 'matched' | 'unmatched' | 'needs_check';

// ── Tester data-quality / outlier flags ──────────────────────────────────────
// Two distinct concepts: sentiment outliers (harsh / overly positive raters —
// usually legitimate feedback you want to *read*) and quality outliers
// (straight-liners — low-information noise you may want to *exclude*).
export type TesterFlagType = 'harsh_critic' | 'overly_positive' | 'straight_liner';

export interface TesterFlag {
  type: TesterFlagType;
  detail: string; // human-readable reason, e.g. "Scored 38 vs 67 group · 2.8σ below"
}

export interface TesterQuality {
  benchmarkN: number;            // number of benchmark rating responses
  avgNorm?: number;              // mean normalized (0–100) benchmark score
  avgRating?: number;            // avgNorm on a 0–5 display scale
  severity?: number;            // shrunk per-question deviation (rater leniency/severity)
  robustZ?: number;             // severity standardized via median + MAD
  sentiment: 'harsh' | 'generous' | 'typical';
  straightLining: boolean;
  flags: TesterFlag[];
}

export interface Tester {
  id: string;
  testerId: string;
  email: string;
  discord: string;
  segments: TesterSegments;
  // convenience fields derived from segments for filtering / export
  ageGroup: string;
  country: string;
  gamingProfile: string;
  hardware: string;
  similarGamesPlayed: string[];
  rawProfileJson: Record<string, unknown>;
  adminNotes?: string;
  paymentAmount?: number;
  // derived
  avgRating?: number;
  isOutlier?: boolean; // convenience: harsh critic OR straight-liner (the "concerning" flags)
  quality?: TesterQuality;
}

export interface Category {
  id: string;
  projectId: string;
  name: string;
  description: string;
  order: number;
  color: string;
}

export interface Question {
  id: string;
  projectId: string;
  text: string;
  type: QuestionType;
  categoryId: string | null;
  sourceColumn: string;
  scaleMin?: number;
  scaleMax?: number;
  // When true, a high numeric answer is *negative* (e.g. "how frustrated were
  // you?"). Score normalization and outlier math invert these.
  isInverseScored?: boolean;
  // derived
  avgScore?: number;
  responseCount?: number;
  lowScorePct?: number;
}

export interface Response {
  id: string;
  projectId: string;
  testerId: string | null;
  questionId: string;
  rawAnswer: string;
  numericValue: number | null;
  normalizedScore: number | null; // 0–100
  submittedAt: string;
  matchStatus: MatchStatus;
}

export interface Theme {
  id: string;
  projectId: string;
  categoryId: string | null;
  questionId: string | null;
  label: string;
  summary: string;
  frequency: number;
  severity: Severity;
  confidence: number; // 0–1
  representativeQuotes: string[];
  linkedResponseIds: string[];
  affectedCategory?: string;
  affectedQuestions?: string[];
  priority?: Priority;
}

export interface Project {
  id: string;
  name: string;
  gameName: string;
  playtestName: string;
  createdAt: string;
  totalResponses: number;
  matchedTesters: number;
  unmatchedTesters: number;
}

export interface RatingDistribution {
  value: number;
  count: number;
  pct: number;
}

export interface CategoryStat {
  category: Category;
  avgScore: number; // 0–100 normalized
  questionCount: number;
  responseCount: number;
  negativePct: number;
  severity: Severity;
  topThemes: string[];
}

export interface SegmentComparison {
  field: string;
  segments: {
    label: string;
    avgScore: number;
    issueCount: number;
    responseCount: number;
  }[];
}

// Player sentiment bands, derived from each tester's avg experience rating.
// Detractors rate low, "Almost Believers" sit on the fence (3–4), Believers
// rate high. Used to read feedback from one mindset at a time.
export type SentimentBand = 'detractors' | 'almost_believers' | 'believers';

export interface FilterState {
  ageGroups: string[];
  genders: string[];
  // Continent groups (Europe, Asia, …). Replaces the per-country filter in the
  // UI; the per-country `countries` field is retained but currently unused.
  continents: string[];
  countries: string[];
  hardwareTiers: string[];
  sessionPlaytime: null | '<1h' | '1-3h' | '3-6h' | '6h+';
  // Restrict to a single player-sentiment band (null = all bands).
  playerSentiment: SentimentBand | null;
  playedFactorio: boolean;
  playedSatisfactory: boolean;
  // Data-quality exclusions (default off — removing testers changes headline scores)
  excludeStraightLiners: boolean;
  // Drops sentiment outliers in *both* directions (harsh critics + overly positive).
  excludeSentimentOutliers: boolean;
}
