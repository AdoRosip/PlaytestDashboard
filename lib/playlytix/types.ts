// Wire types for the Playlytix Portal REST API (see api-reference.html at the
// repo root — "Playlytix API Reference"). This is a *separate* system from the
// Supabase tester registry (lib/registry.ts): the portal is where developers
// run tests and testers submit responses; the registry is our own store of
// cross-game tester profiles used to enrich Excel imports.

/** `GET /tests` list item — PascalCase, straight from the portal's database. */
export interface PlaylytixTestListItem {
  TestID: number;
  TestName: string;
  IsActive: boolean;
  CreatedAt: string;
  StartDate: string | null;
  DueDate: string | null;
  DeveloperEmail: string | null;
  ResponseCount: number;
}

export type PlaylytixQuestionTypeName =
  | 'Rating1_5'
  | 'ShortText'
  | 'LongText'
  | 'URL'
  | 'File'
  | 'SectionHeader';

export interface PlaylytixQuestion {
  QuestionID: number;
  QuestionText: string;
  QuestionDescription: string | null;
  DisplayOrder: number;
  TypeName: PlaylytixQuestionTypeName;
}

export interface PlaylytixTester {
  anonymous: boolean;
  email: string | null;
  country: string | null;
  gender: string | null;
  ageRange: string | null;
  gpu: string | null;
  cpu: string | null;
  ram: string | null;
  platforms: string | null;
  gamerType: string | null;
  gamingPreferences: string | null;
}

export interface PlaylytixAnswer {
  questionId: number;
  /** Always a string, including ratings ("4"). */
  value: string;
}

export interface PlaylytixFile {
  questionId: number;
  fileName: string;
  contentType: string;
  /** 64-bit int serialized as a string. */
  sizeBytes: string;
  /** Temporary signed URL (~1h). Never cache. */
  url: string | null;
}

export interface PlaylytixComment {
  text: string;
  createdAt: string;
}

export type PlaylytixPayoutStatus = 'Pending' | 'Paid';

export interface PlaylytixResponse {
  responseId: number;
  submittedAt: string;
  evaluationScore: number | null;
  payoutAmount: number | null;
  payoutStatus: PlaylytixPayoutStatus;
  tester: PlaylytixTester;
  answers: PlaylytixAnswer[];
  files: PlaylytixFile[];
  comments: PlaylytixComment[];
}

export interface PlaylytixStats {
  totalResponses: number;
  /** Keyed by question id *as a string*. */
  ratingAverages: Record<string, number | null>;
}

/** `GET /tests/:id/responses` — the full per-test payload. */
export interface PlaylytixTestResponsesPayload {
  test: {
    TestID: number;
    TestName: string;
    DueDate: string | null;
  };
  questions: PlaylytixQuestion[];
  responses: PlaylytixResponse[];
  stats: PlaylytixStats;
}

export interface PlaylytixApiError {
  error: string;
}
