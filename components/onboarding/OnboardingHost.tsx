'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './onboarding.css';
import { selectGameConfig, useDashboardStore } from '@/lib/store';
import { isRankingStudy } from '@/lib/ranking';
import { TOUR_COPY, planTour, scopedPath, useOnboarding, type TourStep } from '@/lib/onboarding';

// ─────────────────────────────────────────────────────────────────────────────
// Runs the guided tour (see `lib/onboarding.ts`): once on the first visit with
// data loaded, and again from the sidebar's "Replay tour".
//
// Each step: put the page in the state the step needs (its demo), navigate to
// its route, wait for its element, then highlight it. A step whose element
// never shows up (no transcript for that video, say) is skipped in the
// direction the viewer was going. However the tour ends, it restores the
// cross-filter, closes the profile it opened and returns to the page it
// started on.
// ─────────────────────────────────────────────────────────────────────────────

const START_DELAY_MS = 900;
const DEFAULT_WAIT_MS = 5000;
const POLL_MS = 120;
/** Let charts and drawers finish animating before measuring the element. */
const SETTLE_MS = 250;

type Router = ReturnType<typeof useRouter>;

function find(target: string): Element | null {
  for (const el of document.querySelectorAll(`[data-tour="${target}"]`)) if (el.getClientRects().length) return el;
  return null;
}

/** The step's element, unless a modal dialog is open and the element is behind it. */
function showable(target: string): Element | null {
  const el = find(target);
  const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
  return el && (!modal || modal.contains(el)) ? el : null;
}

/** Playwright and other automated browsers: the overlay would swallow their clicks. */
function automated() {
  return typeof navigator !== 'undefined' && navigator.webdriver;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Click the profile tab a step wants, once the profile has rendered. */
function selectTab(tab: 'answers' | 'videos') {
  const button = document.querySelector<HTMLButtonElement>(`[role="dialog"] [role="tab"][id$="-${tab}-tab"]`);
  if (button && button.getAttribute('aria-selected') !== 'true') button.click();
}

const here = () => window.location.pathname + window.location.search;

/**
 * Start the tour at step `startAt`. Returns a teardown that removes the
 * popover and undoes the demos without marking the tour done (an unmount, or
 * Strict Mode's rehearsal). The viewer ending it marks it done.
 */
function runTour(planned: TourStep[], startAt: number, router: Router): () => void {
  // Own copy: steps whose element never shows up are dropped from it as the tour goes.
  const steps = [...planned];
  const origin = here();
  const ownDrill = useDashboardStore.getState().drill;
  const opensProfile = steps.some((step) => step.demo?.testerId);
  let active: Driver | null = null;
  let index = startAt;
  let move = 0;
  let over = false;

  /** Remove the open popover without that counting as the viewer closing it. */
  const dismiss = () => { const d = active; active = null; d?.destroy(); };

  const restore = () => {
    over = true;
    move += 1;
    unsubscribe();
    dismiss();
    const store = useDashboardStore.getState();
    useDashboardStore.setState({ drill: ownDrill });
    if (opensProfile && store.testerPanelOpen) store.closeTesterPanel();
  };

  const end = () => {
    if (over) return;
    restore();
    if (here() !== origin) router.push(origin);
    useOnboarding.getState().finish();
  };

  /** Put the page in the state `step` needs: its demo on, every other step's demo off. */
  const stage = (step: TourStep) => {
    const store = useDashboardStore.getState();
    const demo = step.demo;
    useDashboardStore.setState({
      drill: demo?.drill ? { ...ownDrill, [demo.drill.questionId]: [demo.drill.value] } : ownDrill,
    });
    if (demo?.testerId) {
      if (!store.testerPanelOpen || store.activeTesterId !== demo.testerId) store.openTesterPanel(demo.testerId);
    } else if (store.testerPanelOpen) {
      store.closeTesterPanel();
    }
    if (step.path) {
      const href = scopedPath(window.location.pathname, step.path);
      if (decodeURI(window.location.pathname) !== decodeURI(href)) router.push(href);
    }
  };

  const show = (i: number, element: Element | undefined) => {
    const copy = TOUR_COPY[steps[i].id];
    const first = i === 0;
    const last = i === steps.length - 1;
    const d = driver({
      popoverClass: 'plx-tour',
      overlayColor: '#060917',
      overlayOpacity: 0.5,
      stagePadding: 6,
      stageRadius: 10,
      smoothScroll: true,
      allowClose: true,
      // A stray click outside should not throw the whole tour away; the X and Esc still end it.
      overlayClickBehavior: 'none',
      // The tour drives the page; clicks on the highlighted element would fight it.
      disableActiveInteraction: true,
      onPopoverRender: (popover) => {
        // Welcome and done are not counted; the rest read "2 of 9".
        if (first || last) return;
        popover.progress.textContent = `${i} of ${steps.length - 2}`;
        popover.progress.style.display = 'block';
      },
      // Removed by `dismiss` for the next step: nothing to do. Otherwise the
      // viewer closed it (the X or Esc), which ends the tour.
      onDestroyed: () => { if (active === d) { active = null; end(); } },
    });
    active = d;
    index = i;
    d.highlight({
      element,
      popover: {
        title: copy.title,
        description: copy.description,
        side: copy.side,
        align: copy.align,
        showButtons: ['next', 'previous', 'close'],
        nextBtnText: first ? 'Start tour' : last ? 'Done' : 'Next',
        prevBtnText: first ? 'Skip' : 'Back',
        onNextClick: () => { if (last) end(); else void go(i + 1, 1); },
        onPrevClick: () => { if (first) end(); else void go(i - 1, -1); },
      },
    });
  };

  /** Move to step `from`, skipping steps whose element never appears, in direction `dir`. */
  const go = async (from: number, dir: 1 | -1) => {
    const current = ++move;
    const stale = () => over || move !== current;
    dismiss();
    for (let i = from; i >= 0 && i < steps.length; i += dir < 0 ? -1 : 0) {
      const step = steps[i];
      stage(step);
      if (!step.target) { show(i, undefined); return; }
      const deadline = Date.now() + (step.wait ?? DEFAULT_WAIT_MS);
      let element: Element | null = null;
      while (!element && Date.now() < deadline) {
        if (step.demo?.testerId) selectTab(step.demo.testerTab ?? 'answers');
        element = showable(step.target);
        if (!element) await sleep(POLL_MS);
        if (stale()) return;
      }
      if (element) {
        await sleep(SETTLE_MS);
        if (stale()) return;
        // Looked up again: the settle may have re-rendered it.
        show(i, showable(step.target) ?? element);
        return;
      }
      // Never appeared: drop it, so the count reads "8 of 8" rather than skipping a number.
      // Moving forward, the next step slides into index `i`; moving back, step down.
      steps.splice(i, 1);
    }
    // Welcome and done have no target, so the walk always stops on one; this is a safety net.
    end();
  };

  // The viewer closed the profile the tour opened (Esc, its X, the backdrop):
  // the step pointing into it is gone, so the tour ends with it.
  const unsubscribe = useDashboardStore.subscribe((state, prev) => {
    if (prev.testerPanelOpen && !state.testerPanelOpen && active && steps[index]?.demo?.testerId) end();
  });

  void go(startAt, 1);
  return restore;
}

export default function OnboardingHost() {
  const router = useRouter();
  const isLoaded = useDashboardStore((s) => s.isLoaded);
  const hydrated = useOnboarding((s) => s.hydrated);
  const done = useOnboarding((s) => s.done);
  const running = useOnboarding((s) => s.running);
  const hydrate = useOnboarding((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  // First visit: start once the report is on screen.
  useEffect(() => {
    if (!hydrated || !isLoaded || done || running || automated()) return;
    const timer = setTimeout(() => useOnboarding.getState().start(0), START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hydrated, isLoaded, done, running]);

  // Started (first visit or "Replay tour"): plan against the data now loaded and go.
  useEffect(() => {
    if (!running) return;
    if (!isLoaded) { useOnboarding.getState().finish(); return; }
    const store = useDashboardStore.getState();
    const steps = planTour({
      categories: store.categories,
      questions: store.questions,
      responses: store.responses,
      testers: store.testers,
      qualitativeOverview: !isRankingStudy(store.questions) && selectGameConfig(store).overviewMode === 'qualitative',
      desktop: window.matchMedia('(min-width: 1024px)').matches,
    });
    if (store.drawerOpen) store.closeDrawer();
    if (store.mobileDrawer) store.closeMobileDrawer();
    return runTour(steps, Math.min(useOnboarding.getState().startAt, steps.length - 1), router);
  }, [running, isLoaded, router]);

  return null;
}
