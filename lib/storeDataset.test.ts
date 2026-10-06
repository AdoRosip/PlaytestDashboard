import { describe, expect, it } from 'vitest';
import { useDashboardStore } from './store';

describe('dataset clearing', () => {
  it('drops loaded report data in one state change', () => {
    useDashboardStore.getState().loadMockData();
    useDashboardStore.getState().setFilter({ ageGroups: ['25-34'] });
    useDashboardStore.getState().openDrawer('question-1');
    const observedProjects: (string | null)[] = [];
    const unsubscribe = useDashboardStore.subscribe(state => {
      observedProjects.push(state.project?.id ?? null);
    });

    useDashboardStore.getState().clearDataset();
    unsubscribe();

    const state = useDashboardStore.getState();
    expect(observedProjects).toEqual([null]);
    expect(state.isLoaded).toBe(false);
    expect(state.testers).toEqual([]);
    expect(state.questions).toEqual([]);
    expect(state.responses).toEqual([]);
    expect(state.themes).toEqual([]);
    expect(state.aiCache).toEqual({});
    expect(state.filters.ageGroups).toEqual([]);
    expect(state.drawerOpen).toBe(false);
  });
});
