'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Project, Tester, Category, Question, Response, Theme, FilterState,
} from './types';
import {
  mockProject, mockTesters, mockCategories, mockQuestions,
  mockResponses, mockThemes,
} from './mockData';
import {
  computeFilteredTesterIds, filterResponsesByTesterIds, filterTestersByIds,
  countActiveFilters,
} from './filtering';
import { computeTesterQuality, isConcerning, qualityExcludedCategoryIds } from './outliers';
import { computeNormalizedScore, scaleForType } from './scoring';
import { getGameConfigByName, type GameConfig } from './games';
import {
  buildPerQuestionSets, matchingTesterIds,
  toggleDrill as toggleDrillSelection, removeDrill as removeDrillSelection,
  type DrillSelection, type DrillValue,
} from './crossFilter';

/**
 * Recompute tester quality (avgRating / flags / outlier) over the current
 * questions + responses. Used whenever question metadata or category assignment
 * changes, since both alter the benchmark set or the scores feeding it.
 */
function applyQuality(
  testers: Tester[],
  questions: Question[],
  responses: Response[],
  config: GameConfig,
): Tester[] {
  const quality = computeTesterQuality({
    testers,
    questions,
    responses,
    excludedCategoryIds: qualityExcludedCategoryIds(config.categories),
  });
  return testers.map((t) => {
    const q = quality.get(t.id);
    if (!q) return t;
    return { ...t, quality: q, avgRating: q.avgRating, isOutlier: isConcerning(q) };
  });
}

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * One cached AI result, keyed by a signature derived from the exact inputs sent
 * to the model. Auto-running an analysis is only safe with this: without it,
 * every mount, filter toggle and duplicate tab would buy a fresh paid request.
 */
export interface AiCacheEntry {
  signature: string;
  status: 'running' | 'done' | 'error';
  data?: unknown;
  error?: string;
  at?: string;
}

interface DashboardState {
  project: Project | null;
  testers: Tester[];
  categories: Category[];
  questions: Question[];
  responses: Response[];
  themes: Theme[];
  isLoaded: boolean;
  filters: FilterState;

  // Cross-filter: answers clicked on a chart ("scored 1 or 2 on Q1"). Lives in
  // the store rather than in a page so it survives navigation — a selection made
  // on one category stays active on the next one and on question detail pages,
  // which is the whole point of the feature: "these testers rated the core loop
  // low — what did they say everywhere else?".
  //
  // Stored as the *selection*, not as the tester ids it resolves to. The ids are
  // derived (see `selectDrillTesterIds`); keeping the intent is what lets the
  // chips name their question, lets one constraint be removed without losing the
  // rest, lets the clicked bar light up again on return, and keeps the set from
  // going stale when the underlying data is re-imported.
  drill: DrillSelection;

  // AI theme analysis
  analysisStatus: AnalysisStatus;
  analysisError: string | null;

  // Signature-keyed cache for the other AI passes (overview takeaways, flaw
  // recommendations). Persisted, so a reload reuses the result instead of
  // re-buying it.
  aiCache: Record<string, AiCacheEntry>;
  beginAiRun: (key: string, signature: string) => void;
  completeAiRun: (key: string, signature: string, data: unknown) => void;
  failAiRun: (key: string, signature: string, message: string) => void;

  // Evidence drawer
  drawerOpen: boolean;
  drawerQuestionId: string | null;
  drawerRatingValue: number | null;

  // Tester profile panel
  testerPanelOpen: boolean;
  activeTesterId: string | null;

  // Filter panel (docked — desktop only, `lg` and up)
  filterPanelOpen: boolean;
  toggleFilterPanel: () => void;

  // Off-canvas overlays below `lg`. Nav and filters share one slot because on a
  // phone only one may usefully cover the content at a time.
  mobileDrawer: 'nav' | 'filters' | null;
  openMobileDrawer: (which: 'nav' | 'filters') => void;
  closeMobileDrawer: () => void;

  // Actions
  loadMockData: () => void;
  loadFromExcel: (data: {
    project: Project;
    testers: Tester[];
    categories: Category[];
    questions: Question[];
    responses: Response[];
  }) => void;
  setFilter: (patch: Partial<FilterState>) => void;
  clearFilters: () => void;
  /** Add/remove one clicked answer on one question. */
  toggleDrillValue: (questionId: string, value: DrillValue) => void;
  /** Drop one question's whole constraint. */
  clearDrillQuestion: (questionId: string) => void;
  /** Drop every cross-filter constraint (panel filters untouched). */
  clearDrill: () => void;
  /** Drop both the panel filters and the cross-filter — the banner's "Clear all". */
  clearAllFilters: () => void;
  openDrawer: (questionId: string, ratingValue?: number) => void;
  closeDrawer: () => void;
  openTesterPanel: (testerId: string) => void;
  closeTesterPanel: () => void;
  updateCategory: (categoryId: string, patch: Partial<Category>) => void;
  assignQuestionToCategory: (questionId: string, categoryId: string | null) => void;
  updateQuestion: (questionId: string, patch: Partial<Question>) => void;
  addCategory: (name: string) => void;
  runThemeAnalysis: () => Promise<void>;
  clearThemes: () => void;
}

const defaultFilters: FilterState = {
  ageGroups: [],
  genders: [],
  continents: [],
  countries: [],
  hardwareTiers: [],
  sessionPlaytime: null,
  playerSentiment: null,
  playedFactorio: false,
  playedSatisfactory: false,
  excludeStraightLiners: false,
  excludeSentimentOutliers: false,
};

let analysisGeneration = 0;

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
  project: null,
  testers: [],
  categories: [],
  questions: [],
  responses: [],
  themes: [],
  isLoaded: false,
  filters: defaultFilters,
  drill: {},
  filterPanelOpen: true,
  mobileDrawer: null,
  analysisStatus: 'idle',
  analysisError: null,
  aiCache: {},
  drawerOpen: false,
  drawerQuestionId: null,
  drawerRatingValue: null,
  testerPanelOpen: false,
  activeTesterId: null,

  loadMockData: () => {
    analysisGeneration += 1;
    set({
      project: mockProject,
      testers: mockTesters,
      categories: mockCategories,
      questions: mockQuestions,
      responses: mockResponses,
      themes: mockThemes,
      isLoaded: true,
      // A new dataset resets both filters. Item 19 asks for no automatic resets,
      // but a cohort selected against the *previous* import would silently
      // misreport the new one — the ids and question ids simply don't carry over.
      filters: defaultFilters,
      drill: {},
      analysisStatus: 'idle',
      analysisError: null,
      aiCache: {},
      drawerOpen: false,
      drawerQuestionId: null,
      drawerRatingValue: null,
      testerPanelOpen: false,
      activeTesterId: null,
    });
  },

  loadFromExcel: (data) => {
    analysisGeneration += 1;
    set({
      project: data.project,
      testers: data.testers,
      categories: data.categories,
      questions: data.questions,
      responses: data.responses,
      themes: [],
      analysisStatus: 'idle',
      analysisError: null,
      aiCache: {},
      isLoaded: true,
      // A new dataset resets both filters. Item 19 asks for no automatic resets,
      // but a cohort selected against the *previous* import would silently
      // misreport the new one — the ids and question ids simply don't carry over.
      filters: defaultFilters,
      drill: {},
      drawerOpen: false,
      drawerQuestionId: null,
      drawerRatingValue: null,
      testerPanelOpen: false,
      activeTesterId: null,
    });
  },

  toggleFilterPanel: () => set((s) => ({ filterPanelOpen: !s.filterPanelOpen })),
  openMobileDrawer: (which) => set({ mobileDrawer: which }),
  closeMobileDrawer: () => set({ mobileDrawer: null }),

  beginAiRun: (key, signature) =>
    set((s) => ({ aiCache: { ...s.aiCache, [key]: { signature, status: 'running' } } })),

  // Both finishers no-op unless the entry still belongs to the run that started
  // it — a superseded request (filters changed mid-flight) must not overwrite a
  // newer one.
  completeAiRun: (key, signature, data) =>
    set((s) => {
      if (s.aiCache[key]?.signature !== signature) return {};
      return {
        aiCache: {
          ...s.aiCache,
          [key]: { signature, status: 'done', data, at: new Date().toISOString() },
        },
      };
    }),

  failAiRun: (key, signature, message) =>
    set((s) => {
      if (s.aiCache[key]?.signature !== signature) return {};
      return {
        aiCache: {
          ...s.aiCache,
          [key]: { signature, status: 'error', error: message, at: new Date().toISOString() },
        },
      };
    }),
  setFilter: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  clearFilters: () => set({ filters: defaultFilters }),

  toggleDrillValue: (questionId, value) =>
    set((s) => ({ drill: toggleDrillSelection(s.drill, questionId, value) })),
  clearDrillQuestion: (questionId) =>
    set((s) => ({ drill: removeDrillSelection(s.drill, questionId) })),
  clearDrill: () => set({ drill: {} }),
  clearAllFilters: () => set({ filters: defaultFilters, drill: {} }),

  openDrawer: (questionId, ratingValue) =>
    set({ drawerOpen: true, drawerQuestionId: questionId, drawerRatingValue: ratingValue ?? null }),
  closeDrawer: () =>
    set({ drawerOpen: false, drawerQuestionId: null, drawerRatingValue: null }),

  openTesterPanel: (testerId) =>
    set({ testerPanelOpen: true, activeTesterId: testerId }),
  closeTesterPanel: () =>
    set({ testerPanelOpen: false, activeTesterId: null }),

  updateCategory: (categoryId, patch) =>
    set((s) => ({
      categories: s.categories.map((c) => c.id === categoryId ? { ...c, ...patch } : c),
    })),

  assignQuestionToCategory: (questionId, categoryId) =>
    set((s) => {
      const questions = s.questions.map((q) => q.id === questionId ? { ...q, categoryId } : q);
      // Category drives the benchmark set, so re-derive tester quality.
       return {
         questions,
         testers: applyQuality(
           s.testers,
           questions,
           s.responses,
           getGameConfigByName(s.project?.gameName),
         ),
       };
    }),

  updateQuestion: (questionId, patch) =>
    set((s) => {
      const questions = s.questions.map((q) => {
        if (q.id !== questionId) return q;
        const next = { ...q, ...patch };
        // Changing the type implies a new scale unless one was passed explicitly.
        if (patch.type !== undefined && patch.scaleMin === undefined && patch.scaleMax === undefined) {
          const sc = scaleForType(patch.type);
          next.scaleMin = sc.scaleMin;
          next.scaleMax = sc.scaleMax;
        }
        return next;
      });
      const changed = questions.find((q) => q.id === questionId);
      if (!changed) return {};
      // Recompute this question's normalized scores, then re-derive quality.
      const responses = s.responses.map((r) =>
        r.questionId === questionId
          ? { ...r, normalizedScore: computeNormalizedScore(changed, r.numericValue) }
          : r,
      );
      return {
        questions,
        responses,
        // A type change swaps the scale, so a bucket already selected on this
        // question now means something else ("5" on a 1-5 scale is the top; on a
        // 1-10 scale it is the middle). Drop just that constraint rather than
        // leave a chip that silently re-points at a different cohort.
        drill: patch.type !== undefined ? removeDrillSelection(s.drill, questionId) : s.drill,
        testers: applyQuality(
          s.testers,
          questions,
          responses,
          getGameConfigByName(s.project?.gameName),
        ),
      };
    }),

  addCategory: (name) => {
    const { categories } = get();
    const newCat: Category = {
      id: `cat_${Date.now()}`,
      projectId: get().project?.id ?? '',
      name,
      description: '',
      order: categories.length + 1,
      color: '#00FFFF',
    };
    set((s) => ({ categories: [...s.categories, newCat] }));
  },

  clearThemes: () => {
    analysisGeneration += 1;
    set({ themes: [], analysisStatus: 'idle', analysisError: null });
  },

  runThemeAnalysis: async () => {
    const { questions, responses, categories, analysisStatus } = get();
    if (analysisStatus === 'running') return;
    const generation = ++analysisGeneration;
    set({ analysisStatus: 'running', analysisError: null, themes: [] });

    try {
      const res = await fetch('/api/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, responses, categories }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let themeIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (generation !== analysisGeneration) {
          await reader.cancel();
          return;
        }
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() ?? '';

        for (const message of messages) {
          const line = message.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              data?: Record<string, unknown>;
              message?: string;
            };

            if (event.type === 'theme' && event.data) {
              const theme: Theme = {
                id: `th_ai_${++themeIndex}_${Date.now()}`,
                projectId: get().project?.id ?? 'proj_import',
                categoryId: (event.data.categoryId as string) ?? null,
                questionId: (event.data.questionId as string) ?? null,
                label: (event.data.label as string) ?? '',
                summary: (event.data.summary as string) ?? '',
                frequency: (event.data.frequency as number) ?? 0,
                severity: (event.data.severity as Theme['severity']) ?? 'Medium',
                confidence: (event.data.confidence as number) ?? 0.5,
                representativeQuotes: (event.data.representativeQuotes as string[]) ?? [],
                linkedResponseIds: (event.data.linkedResponseIds as string[]) ?? [],
                priority: (event.data.priority as Theme['priority']) ?? 'Medium',
              };
              if (generation === analysisGeneration) {
                set((s) => ({ themes: [...s.themes, theme] }));
              }
            }

            if (event.type === 'done' && generation === analysisGeneration) {
              set({ analysisStatus: 'done' });
            }

            if (event.type === 'error' && generation === analysisGeneration) {
              set({ analysisStatus: 'error', analysisError: event.message ?? 'Analysis failed' });
            }
          } catch {
            // ignore malformed SSE events
          }
        }
      }

      // Guard: if stream ended without an explicit 'done' event
      if (generation === analysisGeneration) {
        set((s) => (s.analysisStatus === 'running' ? { analysisStatus: 'done' } : {}));
      }
    } catch (err) {
      if (generation !== analysisGeneration) return;
      set({
        analysisStatus: 'error',
        analysisError: err instanceof Error ? err.message : 'Analysis failed',
      });
    }
  },
    }),
    {
      name: 'playtest-dashboard-v1',
      storage: createJSONStorage(() => {
        // Wrap localStorage to silently handle QuotaExceededError
        return {
          getItem: (key) => {
            try { return localStorage.getItem(key); } catch { return null; }
          },
          setItem: (key, value) => {
            try { localStorage.setItem(key, value); } catch {
              console.warn('localStorage quota exceeded — uploaded data will not be persisted.');
            }
          },
          removeItem: (key) => {
            try { localStorage.removeItem(key); } catch { /* ignore */ }
          },
        };
      }),
      // Only persist data — not UI state (filters, cross-filter, panels, drawers).
      // The cross-filter deliberately follows `filters` here: both survive
      // navigation (they live in the store) but not a reload. Persisting a
      // cohort would mean reopening the dashboard to numbers that silently
      // exclude most testers, with the reason scrolled off the last session.
      partialize: (state) => ({
        project: state.project,
        testers: state.testers,
        categories: state.categories,
        questions: state.questions,
        responses: state.responses,
        themes: state.themes,
        aiCache: state.aiCache,
        isLoaded: state.isLoaded,
      }),
      // A run interrupted by a reload persists as `running`, which would
      // rehydrate into a spinner that never resolves. Drop those so the analysis
      // is simply eligible to run again.
      onRehydrateStorage: () => (state) => {
        if (!state?.aiCache) return;
        state.aiCache = Object.fromEntries(
          Object.entries(state.aiCache).filter(([, entry]) => entry.status !== 'running'),
        );
      },
    }
  )
);

// ─── Filter selectors ────────────────────────────────────────────────────────
//
// Two independent constraints narrow the same thing — the set of testers — and
// the visible cohort is their intersection:
//
//   segment  (filter panel: age, region, hardware, sentiment, quality)
//   ∩ drill  (cross-filter: answers clicked on charts)
//   = cohort (what every page renders)
//
// Composing them here rather than in the pages is what makes a cross-filter
// behave like a real filter: every view that already reads
// `selectFilteredResponses` / `selectFilteredTesters` honours it automatically,
// so a selection cannot silently stop applying when you navigate.
//
// Each selector memoises on input identity. That is not just for speed — these
// are called through `useDashboardStore`, which compares by reference, so
// returning a fresh Set/array each render would loop forever.

let segmentTesterIdsCache:
  | {
      filters: FilterState;
      testers: Tester[];
      responses: Response[];
      questions: Question[];
      value: Set<string> | null;
    }
  | null = null;

let drillTesterIdsCache:
  | {
      drill: DrillSelection;
      responses: Response[];
      value: Set<string> | null;
    }
  | null = null;

let cohortTesterIdsCache:
  | {
      segmentIds: Set<string>;
      drillIds: Set<string>;
      value: Set<string>;
    }
  | null = null;

let segmentResponsesCache:
  | {
      responses: Response[];
      testerIds: Set<string>;
      value: Response[];
    }
  | null = null;

let filteredResponsesCache:
  | {
      responses: Response[];
      testerIds: Set<string>;
      value: Response[];
    }
  | null = null;

let filteredTestersCache:
  | {
      testers: Tester[];
      testerIds: Set<string>;
      value: Tester[];
    }
  | null = null;

/**
 * Testers matching the filter panel only — the cross-filter is deliberately not
 * applied. This is the base the drill-driving charts build on, so a chart can
 * keep showing its full distribution while the selection made *on that same
 * chart* stays visible, instead of collapsing to 100% of the clicked bar.
 */
export const selectSegmentTesterIds = (state: DashboardState): Set<string> | null => {
  const { filters, testers, responses, questions } = state;

  if (
    segmentTesterIdsCache?.filters === filters &&
    segmentTesterIdsCache.testers === testers &&
    segmentTesterIdsCache.responses === responses &&
    segmentTesterIdsCache.questions === questions
  ) {
    return segmentTesterIdsCache.value;
  }

  const value = computeFilteredTesterIds({
    testers,
    responses,
    questions,
    filters,
    config: getGameConfigByName(state.project?.gameName),
  });
  segmentTesterIdsCache = { filters, testers, responses, questions, value };
  return value;
};

/**
 * Testers satisfying every cross-filter constraint (`null` = nothing selected).
 *
 * Resolved against the *unfiltered* responses: the drill is a statement about
 * who answered what, independent of the panel filters, and the intersection in
 * `selectFilteredTesterIds` applies the panel afterwards. Same result, but the
 * set survives panel changes instead of being rebuilt on every chip toggle.
 */
export const selectDrillTesterIds = (state: DashboardState): Set<string> | null => {
  const { drill, responses } = state;
  if (drillTesterIdsCache?.drill === drill && drillTesterIdsCache.responses === responses) {
    return drillTesterIdsCache.value;
  }
  const value = matchingTesterIds(buildPerQuestionSets(responses, drill));
  drillTesterIdsCache = { drill, responses, value };
  return value;
};

/** The visible cohort: segment ∩ drill. `null` = no constraint at all. */
export const selectFilteredTesterIds = (state: DashboardState): Set<string> | null => {
  const segmentIds = selectSegmentTesterIds(state);
  const drillIds = selectDrillTesterIds(state);
  if (segmentIds === null) return drillIds;
  if (drillIds === null) return segmentIds;

  if (
    cohortTesterIdsCache?.segmentIds === segmentIds &&
    cohortTesterIdsCache.drillIds === drillIds
  ) {
    return cohortTesterIdsCache.value;
  }
  const value = new Set([...segmentIds].filter((id) => drillIds.has(id)));
  cohortTesterIdsCache = { segmentIds, drillIds, value };
  return value;
};

/**
 * Responses narrowed by the filter panel but *not* by the cross-filter — the
 * base a page uses to draw a chart that is itself a cross-filter control.
 */
export const selectSegmentFilteredResponses = (state: DashboardState) => {
  const ids = selectSegmentTesterIds(state);
  if (ids === null) return state.responses;
  if (segmentResponsesCache?.responses === state.responses && segmentResponsesCache.testerIds === ids) {
    return segmentResponsesCache.value;
  }

  const value = filterResponsesByTesterIds(state.responses, ids);
  segmentResponsesCache = { responses: state.responses, testerIds: ids, value };
  return value;
};

export const selectFilteredResponses = (state: DashboardState) => {
  const ids = selectFilteredTesterIds(state);
  if (ids === null) return state.responses;
  if (filteredResponsesCache?.responses === state.responses && filteredResponsesCache.testerIds === ids) {
    return filteredResponsesCache.value;
  }

  const value = filterResponsesByTesterIds(state.responses, ids);
  filteredResponsesCache = { responses: state.responses, testerIds: ids, value };
  return value;
};

export const selectFilteredTesters = (state: DashboardState) => {
  const ids = selectFilteredTesterIds(state);
  if (ids === null) return state.testers;
  if (filteredTestersCache?.testers === state.testers && filteredTestersCache.testerIds === ids) {
    return filteredTestersCache.value;
  }

  const value = filterTestersByIds(state.testers, ids);
  filteredTestersCache = { testers: state.testers, testerIds: ids, value };
  return value;
};

/**
 * Filter-panel count only. Drives the badges attached to the panel itself, so it
 * must not count constraints the panel doesn't contain and can't clear.
 */
export const selectActiveFilterCount = (state: DashboardState): number =>
  countActiveFilters(state.filters);

/** Number of questions carrying a cross-filter constraint. */
export const selectCrossFilterCount = (state: DashboardState): number =>
  Object.keys(state.drill).length;

/** True when anything at all is narrowing the cohort. */
export const selectAnyFilterActive = (state: DashboardState): boolean =>
  countActiveFilters(state.filters) > 0 || Object.keys(state.drill).length > 0;

/** The active game config, resolved from the loaded project's gameName. */
export const selectGameConfig = (state: DashboardState): GameConfig =>
  getGameConfigByName(state.project?.gameName);

// ─── Other derived selectors ─────────────────────────────────────────────────

export const selectTester = (store: DashboardState, testerId: string) =>
  store.testers.find((t) => t.id === testerId);

export const selectQuestion = (store: DashboardState, questionId: string) =>
  store.questions.find((q) => q.id === questionId);

export const selectResponsesForQuestion = (store: DashboardState, questionId: string) =>
  store.responses.filter((r) => r.questionId === questionId);

export const selectResponsesForTester = (store: DashboardState, testerId: string) =>
  store.responses.filter((r) => r.testerId === testerId);

export const selectQuestionsForCategory = (store: DashboardState, categoryId: string) =>
  store.questions.filter((q) => q.categoryId === categoryId);
