import { create } from 'zustand';
import type { Category, Question, Response, Tester } from './types';
import { isRatingType } from './scoring';
import { answerKey, type DrillValue } from './crossFilter';
import { screenshotGroups, videoFiles } from './dossier';

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding: one guided tour, shown once on the first visit, that walks across
// the pages and points at the features that are easy to miss (clickable charts,
// the cross-filter, transcript seeking, search…). Navigation itself is not
// toured: it is visible on its own.
//
// Where a feature only appears after an action (the cross-filter bar needs a
// clicked bar, the profile tabs need an open profile) the step says so in
// `demo`, and the tour performs it while the step is showing. The tour undoes
// all of it when it ends.
//
// Whether the viewer finished the tour lives under its own localStorage key,
// not in the dashboard store: in Portal mode the store's key is wiped on every
// load (see `lib/store.ts`), and "seen the tour" has to outlive that.
//
// The driver.js side (navigation, highlighting, popovers) lives in
// `components/onboarding/OnboardingHost.tsx`. This file only holds state, copy
// and the pure planner, so it stays unit-testable without a DOM.
// ─────────────────────────────────────────────────────────────────────────────

/** Bump the suffix to show the tour to everyone again. */
export const TOUR_STORAGE_KEY = 'playlytix-tour-v1';

export type StepId =
  | 'welcome'
  | 'filters'
  | 'evidence'
  | 'category-chart'
  | 'cross-filter'
  | 'ai-summary'
  | 'segment-breakdown'
  | 'question-profile'
  | 'tester-tabs'
  | 'transcript'
  | 'responses-search'
  | 'done';

type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';
export type StepCopy = { title: string; description: string; side?: Side; align?: Align };

/** What the tour does on screen while a step shows. Steps without one get a clean page. */
export type TourDemo = {
  /** A cross-filter answer to select, on top of whatever the viewer had selected. */
  drill?: { questionId: string; value: DrillValue };
  /** Tester whose profile is open. */
  testerId?: string;
  /** Profile tab to switch to; the answers tab otherwise. */
  testerTab?: 'videos';
};

export type TourStep = {
  id: StepId;
  /** Route to be on, unprefixed (`/categories/abc`). Absent: stay where the tour is. */
  path?: string;
  /** `data-tour` value of the element to point at. Absent: a centred popover. */
  target?: string;
  demo?: TourDemo;
  /** How long to wait for the target to appear before skipping the step, in ms. */
  wait?: number;
};

/**
 * Step copy. Targets are `data-tour` attributes; the first visible match in the
 * DOM wins, so marking every chart on a page is fine: the tour lands on the topmost.
 */
export const TOUR_COPY: Record<StepId, StepCopy> = {
  welcome: {
    title: 'Welcome to your playtest report',
    description:
      'A one-minute tour of the features that are easy to miss. It moves between pages for you ' +
      'and puts everything back the way it was when it ends.',
  },
  filters: {
    title: 'Filter the whole report',
    description:
      'Narrow every page to a group of testers: age, gender, hardware, how they rated the game and more. ' +
      'A banner at the top shows whenever a filter is on.',
    side: 'right',
    align: 'start',
  },
  evidence: {
    title: 'Read the answers behind a bar',
    description: 'Click any bar to open the responses behind it, with each tester’s profile one click away.',
    side: 'bottom',
    align: 'start',
  },
  'category-chart': {
    title: 'Click a bar to filter',
    description:
      'Click any bar to see only the testers who gave that answer, here and on every other page. ' +
      'Several bars on one question include any of them; bars on different questions must all match.',
    side: 'bottom',
  },
  'cross-filter': {
    title: 'Your filter follows you',
    description:
      'We picked one answer for you. This bar shows what you are filtering by and how many testers match, ' +
      'and it stays on as you move between pages. Click a chip to remove one answer, or Clear to reset.',
    side: 'bottom',
  },
  'ai-summary': {
    title: 'Summarise written answers',
    description:
      'Get an AI summary of everything testers wrote for this question. It only reads the testers your filters leave in view.',
    side: 'top',
    align: 'start',
  },
  'segment-breakdown': {
    title: 'Compare tester groups',
    description: 'See how different groups rated this question. Switch between age, gaming hours, hardware, country and gender here.',
    side: 'bottom',
    align: 'end',
  },
  'question-profile': {
    title: 'See the whole tester',
    description:
      "Open a tester's profile to read all of their answers and, where they uploaded them, watch their gameplay videos and screenshots.",
    side: 'left',
  },
  'tester-tabs': {
    title: 'Answers, videos, screenshots',
    description: 'Switch between everything this tester submitted. The number on each tab shows how many there are.',
    side: 'bottom',
    align: 'start',
  },
  transcript: {
    title: 'Click a line to jump there',
    description:
      'Each line jumps the video to that moment, and the current line follows playback. ' +
      'Search for a word, or let AI summarise the session into key moments you can jump to.',
    side: 'top',
  },
  'responses-search': {
    title: 'Search every answer',
    description: 'Type a word, like a mechanic, a bug or a feature, to find every answer and question that mentions it.',
    side: 'bottom',
    align: 'start',
  },
  done: {
    title: 'That’s the tour',
    description: 'You can take it again any time from “Replay tour” at the bottom of the sidebar.',
  },
};

export type TourInput = {
  categories: Category[];
  questions: Question[];
  responses: Response[];
  testers: Tester[];
  /** The overview is the qualitative layout, the one with clickable rating bars. */
  qualitativeOverview: boolean;
  /** The docked filter panel only exists at `lg` and up. */
  desktop: boolean;
};

const isChoice = (q: Question) => q.type === 'yes_no' || q.type === 'multiple_choice';
const isChart = (q: Question) => isRatingType(q.type) || isChoice(q) || q.type === 'duration';

/** The most given answer to `q`, as the cross-filter stores it; undefined when nobody answered. */
function commonAnswer(q: Question, responses: Response[]): DrillValue | undefined {
  const counts = new Map<DrillValue, number>();
  for (const r of responses) {
    if (r.questionId !== q.id) continue;
    const value = isRatingType(q.type) ? r.numericValue : answerKey(r.rawAnswer ?? '') || null;
    if (value !== null && value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: DrillValue | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) if (count > bestCount) { best = value; bestCount = count; }
  return best;
}

/**
 * The tour for this dataset: only the steps whose feature exists in it, each
 * pointed at real data (the first category with charts, a rated question, a
 * tester who uploaded a video). Starts with `welcome` and ends with `done`.
 */
export function planTour({ categories, questions, responses, testers, qualitativeOverview, desktop }: TourInput): TourStep[] {
  const steps: TourStep[] = [{ id: 'welcome' }];

  if (desktop) steps.push({ id: 'filters', path: '/overview', target: 'filters' });
  if (qualitativeOverview) steps.push({ id: 'evidence', path: '/overview', target: 'evidence' });

  // Questionnaire order; prefer a category that shows both a chart and an AI summary.
  const ordered = [...categories].sort((a, b) => a.order - b.order);
  const answered = new Set(responses.map((r) => r.questionId));
  const inCategory = (c: Category) => questions.filter((q) => q.categoryId === c.id);
  const withChart = ordered.filter((c) => inCategory(c).some((q) => isChart(q) && answered.has(q.id)));
  const category = withChart.find((c) => inCategory(c).some((q) => q.type === 'free_text')) ?? withChart[0];

  if (category) {
    const path = `/categories/${encodeURIComponent(category.id)}`;
    steps.push({ id: 'category-chart', path, target: 'category-chart' });
    // Rating and choice charts are clickable; duration charts are not.
    const source = inCategory(category).find((q) => (isRatingType(q.type) || isChoice(q)) && commonAnswer(q, responses) !== undefined);
    const value = source && commonAnswer(source, responses);
    if (source && value !== undefined) {
      steps.push({ id: 'cross-filter', path, target: 'cross-filter', demo: { drill: { questionId: source.id, value } } });
    }
    if (inCategory(category).some((q) => q.type === 'free_text')) steps.push({ id: 'ai-summary', path, target: 'ai-summary' });
  }

  // A rated question, from the toured category when it has one.
  const rated = (q: Question) => isRatingType(q.type) && responses.some((r) => r.questionId === q.id && r.numericValue !== null);
  const question = (category && inCategory(category).find(rated)) ?? questions.find(rated);
  if (question) {
    const path = `/questions/${encodeURIComponent(question.id)}`;
    steps.push({ id: 'segment-breakdown', path, target: 'segment-breakdown' });
    steps.push({ id: 'question-profile', path, target: 'question-profile' });

    // Show off a profile with something besides answers: a transcribed video
    // (the videos tab opens on the first one) beats any video, which beats screenshots.
    const transcribed = (t: Tester) => !!videoFiles(t.files)[0]?.transcript;
    const hasVideo = (t: Tester) => videoFiles(t.files).length > 0;
    const hasShots = (t: Tester) => screenshotGroups(t.files, questions).some((g) => g.files.length > 0);
    const tester = testers.find(transcribed) ?? testers.find(hasVideo) ?? testers.find(hasShots);
    if (tester) {
      steps.push({ id: 'tester-tabs', path, target: 'tester-tabs', demo: { testerId: tester.id } });
      if (transcribed(tester)) {
        // The cues are fetched when the tab opens, so give them a little longer.
        steps.push({ id: 'transcript', path, target: 'transcript', demo: { testerId: tester.id, testerTab: 'videos' }, wait: 8000 });
      }
    }
  }

  steps.push({ id: 'responses-search', path: '/responses', target: 'responses-search' });
  steps.push({ id: 'done' });
  return steps;
}

/** `path` under the report the viewer is in: Portal reports live under `/tests/{id}`. */
export function scopedPath(currentPathname: string, path: string): string {
  const prefix = currentPathname.match(/^\/tests\/[1-9]\d*/)?.[0];
  return prefix ? prefix + path : path;
}

/** Parse the stored value, tolerating anything a past version or a user left there. */
export function parseDone(raw: string | null): boolean {
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { done?: unknown } | null)?.done === true;
  } catch {
    return false;
  }
}

export function serializeDone(done: boolean): string {
  return JSON.stringify({ done });
}

function readStorage(): boolean {
  try { return parseDone(localStorage.getItem(TOUR_STORAGE_KEY)); } catch { return false; }
}

function writeStorage(done: boolean) {
  try { localStorage.setItem(TOUR_STORAGE_KEY, serializeDone(done)); } catch { /* private mode: forget on reload */ }
}

type OnboardingState = {
  /** False until the stored value is read on the client; nothing starts before then. */
  hydrated: boolean;
  /** The viewer finished or skipped the tour. */
  done: boolean;
  running: boolean;
  /** Step index the running tour opens on. */
  startAt: number;
  hydrate: () => void;
  start: (startAt?: number) => void;
  /** Ended by the viewer, finished or skipped: it does not start on its own again. */
  finish: () => void;
  /** "Replay tour": straight into the first feature, past the welcome. */
  replay: () => void;
};

export const useOnboarding = create<OnboardingState>()((set, get) => ({
  hydrated: false,
  done: false,
  running: false,
  startAt: 0,
  hydrate: () => { if (!get().hydrated) set({ hydrated: true, done: readStorage() }); },
  start: (startAt = 0) => { if (!get().running) set({ running: true, startAt }); },
  finish: () => {
    writeStorage(true);
    set({ hydrated: true, done: true, running: false });
  },
  replay: () => get().start(1),
}));
