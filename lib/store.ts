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

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error';

interface DashboardState {
  project: Project | null;
  testers: Tester[];
  categories: Category[];
  questions: Question[];
  responses: Response[];
  themes: Theme[];
  isLoaded: boolean;
  filters: FilterState;

  // AI theme analysis
  analysisStatus: AnalysisStatus;
  analysisError: string | null;

  // Evidence drawer
  drawerOpen: boolean;
  drawerQuestionId: string | null;
  drawerRatingValue: number | null;

  // Tester profile panel
  testerPanelOpen: boolean;
  activeTesterId: string | null;

  // Filter panel
  filterPanelOpen: boolean;
  toggleFilterPanel: () => void;

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
  openDrawer: (questionId: string, ratingValue?: number) => void;
  closeDrawer: () => void;
  openTesterPanel: (testerId: string) => void;
  closeTesterPanel: () => void;
  updateCategory: (categoryId: string, patch: Partial<Category>) => void;
  assignQuestionToCategory: (questionId: string, categoryId: string | null) => void;
  addCategory: (name: string) => void;
  runThemeAnalysis: () => Promise<void>;
  clearThemes: () => void;
}

const defaultFilters: FilterState = {
  ageGroups: [],
  genders: [],
  countries: [],
  hardwareTiers: [],
  sessionPlaytime: null,
  playedFactorio: false,
  playedSatisfactory: false,
};

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
  filterPanelOpen: true,
  analysisStatus: 'idle',
  analysisError: null,
  drawerOpen: false,
  drawerQuestionId: null,
  drawerRatingValue: null,
  testerPanelOpen: false,
  activeTesterId: null,

  loadMockData: () => {
    set({
      project: mockProject,
      testers: mockTesters,
      categories: mockCategories,
      questions: mockQuestions,
      responses: mockResponses,
      themes: mockThemes,
      isLoaded: true,
    });
  },

  loadFromExcel: (data) => {
    set({
      project: data.project,
      testers: data.testers,
      categories: data.categories,
      questions: data.questions,
      responses: data.responses,
      themes: [],
      isLoaded: true,
    });
  },

  toggleFilterPanel: () => set((s) => ({ filterPanelOpen: !s.filterPanelOpen })),
  setFilter: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  clearFilters: () => set({ filters: defaultFilters }),

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
    set((s) => ({
      questions: s.questions.map((q) => q.id === questionId ? { ...q, categoryId } : q),
    })),

  addCategory: (name) => {
    const { categories } = get();
    const newCat: Category = {
      id: `cat_${Date.now()}`,
      projectId: get().project?.id ?? '',
      name,
      description: '',
      order: categories.length + 1,
      color: '#94a3b8',
    };
    set((s) => ({ categories: [...s.categories, newCat] }));
  },

  clearThemes: () => set({ themes: [], analysisStatus: 'idle', analysisError: null }),

  runThemeAnalysis: async () => {
    const { questions, responses, categories } = get();
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
              set((s) => ({ themes: [...s.themes, theme] }));
            }

            if (event.type === 'done') {
              set({ analysisStatus: 'done' });
            }

            if (event.type === 'error') {
              set({ analysisStatus: 'error', analysisError: event.message ?? 'Analysis failed' });
            }
          } catch {
            // ignore malformed SSE events
          }
        }
      }

      // Guard: if stream ended without an explicit 'done' event
      set((s) => (s.analysisStatus === 'running' ? { analysisStatus: 'done' } : {}));
    } catch (err) {
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
      // Only persist data — not UI state (filters, open panels, drawers)
      partialize: (state) => ({
        project: state.project,
        testers: state.testers,
        categories: state.categories,
        questions: state.questions,
        responses: state.responses,
        themes: state.themes,
        isLoaded: state.isLoaded,
      }),
    }
  )
);

// ─── Filter selectors ────────────────────────────────────────────────────────

let filteredTesterIdsCache:
  | {
      filters: FilterState;
      testers: Tester[];
      responses: Response[];
      questions: Question[];
      value: Set<string> | null;
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

export const selectFilteredTesterIds = (state: DashboardState): Set<string> | null => {
  const { filters, testers, responses, questions } = state;

  if (
    filteredTesterIdsCache?.filters === filters &&
    filteredTesterIdsCache.testers === testers &&
    filteredTesterIdsCache.responses === responses &&
    filteredTesterIdsCache.questions === questions
  ) {
    return filteredTesterIdsCache.value;
  }

  const hasFilter =
    filters.ageGroups.length > 0 || filters.genders.length > 0 ||
    filters.countries.length > 0 || filters.hardwareTiers.length > 0 ||
    filters.sessionPlaytime !== null || filters.playedFactorio || filters.playedSatisfactory;

  if (!hasFilter) {
    filteredTesterIdsCache = { filters, testers, responses, questions, value: null };
    return null; // null = no filter active, use all testers
  }

  // Build session playtime lookup
  const playtimeQ = questions.find((q) =>
    /how many hours.*(?:play|game|session)|hours.*played.*(?:exo|game|session)/i.test(q.text)
  );
  const playtimeMap = new Map<string, number>();
  if (playtimeQ) {
    for (const r of responses) {
      if (r.questionId === playtimeQ.id && r.testerId && r.numericValue !== null) {
        playtimeMap.set(r.testerId, r.numericValue);
      }
    }
  }

  // Build "played game" lookups
  const buildGameSet = (pattern: RegExp) => {
    const q = questions.find((q) => pattern.test(q.text) && q.categoryId === 'cat_01');
    const set = new Set<string>();
    if (!q) return set;
    for (const r of responses) {
      if (r.questionId !== q.id || !r.testerId) continue;
      const n = r.numericValue ?? 0;
      const raw = r.rawAnswer.toLowerCase().trim();
      if (n > 0 || (raw && raw !== '0' && raw !== 'no' && raw !== 'none' && raw !== '')) {
        set.add(r.testerId);
      }
    }
    return set;
  };
  const factorioTesters = filters.playedFactorio ? buildGameSet(/factorio/i) : null;
  const satTesters = filters.playedSatisfactory ? buildGameSet(/satisfactory/i) : null;

  const result = new Set<string>();
  for (const t of testers) {
    if (filters.ageGroups.length > 0 && !filters.ageGroups.includes(t.ageGroup)) continue;
    if (filters.genders.length > 0 && !filters.genders.includes(t.segments.gender ?? '')) continue;
    if (filters.countries.length > 0) {
      const c = t.country || t.segments.country || '';
      if (!filters.countries.includes(c)) continue;
    }
    if (filters.hardwareTiers.length > 0 && !filters.hardwareTiers.includes(t.segments.hardware_tier ?? 'Unknown')) continue;
    if (filters.sessionPlaytime !== null) {
      const pt = playtimeMap.get(t.id);
      if (pt === undefined) continue;
      const ok =
        (filters.sessionPlaytime === '<1h'  && pt < 1) ||
        (filters.sessionPlaytime === '1-3h' && pt >= 1 && pt <= 3) ||
        (filters.sessionPlaytime === '3-6h' && pt > 3 && pt <= 6) ||
        (filters.sessionPlaytime === '6h+'  && pt > 6);
      if (!ok) continue;
    }
    if (factorioTesters && !factorioTesters.has(t.id)) continue;
    if (satTesters && !satTesters.has(t.id)) continue;
    result.add(t.id);
  }
  filteredTesterIdsCache = { filters, testers, responses, questions, value: result };
  return result;
};

export const selectFilteredResponses = (state: DashboardState) => {
  const ids = selectFilteredTesterIds(state);
  if (ids === null) return state.responses;
  if (filteredResponsesCache?.responses === state.responses && filteredResponsesCache.testerIds === ids) {
    return filteredResponsesCache.value;
  }

  const value = state.responses.filter((r) => r.testerId === null || ids.has(r.testerId));
  filteredResponsesCache = { responses: state.responses, testerIds: ids, value };
  return value;
};

export const selectFilteredTesters = (state: DashboardState) => {
  const ids = selectFilteredTesterIds(state);
  if (ids === null) return state.testers;
  if (filteredTestersCache?.testers === state.testers && filteredTestersCache.testerIds === ids) {
    return filteredTestersCache.value;
  }

  const value = state.testers.filter((t) => ids.has(t.id));
  filteredTestersCache = { testers: state.testers, testerIds: ids, value };
  return value;
};

export const selectActiveFilterCount = (state: DashboardState): number => {
  const f = state.filters;
  return (
    f.ageGroups.length + f.genders.length + f.countries.length + f.hardwareTiers.length +
    (f.sessionPlaytime !== null ? 1 : 0) +
    (f.playedFactorio ? 1 : 0) +
    (f.playedSatisfactory ? 1 : 0)
  );
};

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
