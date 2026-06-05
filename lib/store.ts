'use client';
import { create } from 'zustand';
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
  categoryId: null,
  questionType: null,
  scoreRange: null,
  matchStatus: null,
  ageGroup: null,
  country: null,
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  project: null,
  testers: [],
  categories: [],
  questions: [],
  responses: [],
  themes: [],
  isLoaded: false,
  filters: defaultFilters,
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
}));

// Derived selectors
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
