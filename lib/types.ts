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
  isOutlier?: boolean;
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

export interface FilterState {
  categoryId: string | null;
  questionType: QuestionType | null;
  scoreRange: [number, number] | null;
  matchStatus: MatchStatus | null;
  ageGroup: string | null;
  country: string | null;
}
