import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TOUR_COPY, TOUR_STORAGE_KEY, parseDone, planTour, scopedPath, serializeDone, useOnboarding, type TourInput,
} from './onboarding';
import type { Category, Question, Response, Tester } from './types';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  useOnboarding.setState({ hydrated: false, done: false, running: false, startAt: 0 });
});

const category = (id: string, order: number): Category => ({ id, projectId: 'p', name: id, description: '', order, color: '' });
const question = (id: string, type: Question['type'], categoryId: string | null): Question =>
  ({ id, projectId: 'p', text: id, type, categoryId, sourceColumn: id });
const response = (questionId: string, testerId: string, rawAnswer: string, numericValue: number | null = null): Response =>
  ({ id: `${questionId}-${testerId}`, projectId: 'p', testerId, questionId, rawAnswer, numericValue, normalizedScore: null, submittedAt: '', matchStatus: 'matched' } as Response);
const tester = (id: string, files: Tester['files'] = []): Tester => ({ id, testerId: id, files } as Tester);

function input(patch: Partial<TourInput> = {}): TourInput {
  return {
    categories: [category('later', 2), category('first', 1)],
    questions: [
      question('q-rate', 'rating_1_5', 'first'),
      question('q-text', 'free_text', 'first'),
      question('q-later', 'rating_1_5', 'later'),
    ],
    responses: [
      response('q-rate', 't1', '4', 4), response('q-rate', 't2', '4', 4), response('q-rate', 't3', '2', 2),
      response('q-text', 't1', 'Fun'), response('q-later', 't1', '3', 3),
    ],
    testers: [
      tester('t1', [{ id: 'v1', name: 'plain.mp4' }]),
      tester('t2', [{ id: 'v2', name: 'run.mp4', transcript: { testId: '1', submissionId: 2, fileId: 3, cues: 10 } }]),
      tester('t3'),
    ],
    qualitativeOverview: false,
    desktop: true,
    ...patch,
  };
}

describe('planTour', () => {
  it('walks the pages in order, opening on welcome and closing on done', () => {
    expect(planTour(input()).map((s) => s.id)).toEqual([
      'welcome', 'filters', 'category-chart', 'cross-filter', 'ai-summary',
      'segment-breakdown', 'question-profile', 'tester-tabs', 'transcript', 'responses-search', 'done',
    ]);
  });

  it('tours the first category in questionnaire order and its rated question', () => {
    const steps = planTour(input());
    expect(steps.find((s) => s.id === 'category-chart')?.path).toBe('/categories/first');
    expect(steps.find((s) => s.id === 'segment-breakdown')?.path).toBe('/questions/q-rate');
  });

  it('demos the cross-filter with the most given answer', () => {
    expect(planTour(input()).find((s) => s.id === 'cross-filter')?.demo).toEqual({ drill: { questionId: 'q-rate', value: 4 } });
  });

  it('opens the profile of a tester with a transcribed video, on the videos tab for the transcript', () => {
    const steps = planTour(input());
    expect(steps.find((s) => s.id === 'tester-tabs')?.demo).toEqual({ testerId: 't2' });
    expect(steps.find((s) => s.id === 'transcript')?.demo).toEqual({ testerId: 't2', testerTab: 'videos' });
  });

  it('leaves out steps whose feature the dataset or screen does not have', () => {
    const ids = planTour(input({
      desktop: false,
      questions: [question('q-rate', 'rating_1_5', 'first')],
      testers: [tester('t1'), tester('t2', [{ id: 's', name: 'shot.png' }])],
    })).map((s) => s.id);
    expect(ids).not.toContain('filters');
    expect(ids).not.toContain('ai-summary');
    expect(ids).not.toContain('transcript');
    expect(ids).toContain('tester-tabs');
  });

  it('tours the profile but not the transcript when no video has one', () => {
    const ids = planTour(input({ testers: [tester('t1', [{ id: 'v', name: 'run.mp4' }])] })).map((s) => s.id);
    expect(ids).toContain('tester-tabs');
    expect(ids).not.toContain('transcript');
  });

  it('includes the overview evidence bars only on the qualitative overview', () => {
    expect(planTour(input({ qualitativeOverview: true })).map((s) => s.id)).toContain('evidence');
  });

  it('still makes a tour from an empty dataset', () => {
    expect(planTour(input({ categories: [], questions: [], responses: [], testers: [] })).map((s) => s.id))
      .toEqual(['welcome', 'filters', 'responses-search', 'done']);
  });

  it('has copy for every step', () => {
    for (const copy of Object.values(TOUR_COPY)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.description.length).toBeGreaterThan(0);
    }
  });
});

describe('scopedPath', () => {
  it('keeps Portal reports under their /tests/{id} prefix', () => {
    expect(scopedPath('/tests/42/overview', '/responses')).toBe('/tests/42/responses');
    expect(scopedPath('/overview', '/responses')).toBe('/responses');
  });
});

describe('parseDone', () => {
  it('round-trips what serializeDone writes', () => {
    expect(parseDone(serializeDone(true))).toBe(true);
    expect(parseDone(serializeDone(false))).toBe(false);
  });

  it('treats missing, corrupt or foreign values as not done', () => {
    expect(parseDone(null)).toBe(false);
    expect(parseDone('not json')).toBe(false);
    expect(parseDone('null')).toBe(false);
    expect(parseDone('{"done":"yes"}')).toBe(false);
  });
});

describe('useOnboarding', () => {
  it('reads whether the tour was done', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [TOUR_STORAGE_KEY]: serializeDone(true) }));
    useOnboarding.getState().hydrate();
    expect(useOnboarding.getState().done).toBe(true);
  });

  it('finishing stops the tour and remembers it', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    useOnboarding.getState().start();
    useOnboarding.getState().finish();
    expect(useOnboarding.getState()).toMatchObject({ running: false, done: true });
    expect(parseDone(storage.data.get(TOUR_STORAGE_KEY)!)).toBe(true);
  });

  it('replay starts past the welcome, and not twice', () => {
    useOnboarding.getState().replay();
    expect(useOnboarding.getState()).toMatchObject({ running: true, startAt: 1 });
    useOnboarding.getState().start(0);
    expect(useOnboarding.getState().startAt).toBe(1);
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    useOnboarding.getState().hydrate();
    useOnboarding.getState().finish();
    expect(useOnboarding.getState().done).toBe(true);
  });
});
