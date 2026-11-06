// @vitest-environment jsdom
// Spec: spec/federal/guided-navigation-scroll.yaml.
import React, { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SegmentationScreen } from '@/components/guided-interview/segmentation-screen';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, startInterview, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { mountGuidedPanel } from './guided-panel-dom';

let viewportTop = 640;
let pendingMovements: number[] = [];
let frames: FrameRequestCallback[] = [];
const elementScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

beforeEach(() => {
  localStorage.clear();
  viewportTop = 640;
  pendingMovements = [];
  frames = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number) => {
    if (typeof options !== 'object') throw new Error('Expected the actual navigation destination');
    const top = options.top ?? viewportTop;
    if (options.behavior === 'smooth') pendingMovements.push(top);
    else { viewportTop = top; pendingMovements = []; }
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', elementScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

function motion(reduced: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: reduced, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  })));
}
async function flushFrames() {
  const callbacks = frames;
  frames = [];
  await act(async () => callbacks.forEach(callback => callback(0)));
}
async function choose(container: HTMLElement, value: string) {
  const control = container.querySelector<HTMLInputElement>(`input[value="${value}"]`);
  if (!control) throw new Error(`Missing actual setup control ${value}`);
  await act(async () => control.click());
}

it.each([false, true])('setup navigation reaches its destination without pending movement and retains real answers and focus', async reduced => {
  motion(reduced);
  const workspace = createWorkspaceRecord('synthetic-stable-setup');
  const original = structuredClone(workspace);
  const complete = vi.fn();
  const panel = await mountGuidedPanel(<SegmentationScreen workspace={workspace} onComplete={complete} />);
  try {
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(viewportTop).toBe(640);
    await panel.click('Continue');
    expect(panel.container.querySelector('[aria-current="step"]')?.textContent).toBe('Filing Status');
    expect(viewportTop).toBe(0);
    expect(pendingMovements).toEqual([]);
    await flushFrames();
    expect(document.activeElement).toBe(panel.container.querySelector('.guided-segmentation'));
    await choose(panel.container, 'single');
    const callsAfterStep = vi.mocked(window.scrollTo).mock.calls.length;
    await choose(panel.container, 'mfj');
    expect(vi.mocked(window.scrollTo).mock.calls.length).toBe(callsAfterStep);
    // Separate actual forward/back actions, without draining animation frames between them.
    viewportTop = 1200;
    await panel.click('Continue');
    await choose(panel.container, 'w2-wages');
    await panel.click('Continue');
    await panel.click('Back');
    expect(panel.container.querySelector<HTMLInputElement>('input[value="w2-wages"]')?.checked).toBe(true);
    await panel.click('Back');
    expect(panel.container.querySelector<HTMLInputElement>('input[value="mfj"]')?.checked).toBe(true);
    expect(viewportTop).toBe(0);
    expect(pendingMovements).toEqual([]);
    await flushFrames();
    expect(document.activeElement).toBe(panel.container.querySelector('.guided-segmentation'));
    expect(complete).not.toHaveBeenCalled();
    expect(workspace).toEqual(original);
  } finally { await panel.dispose(); }
});

it.each([false, true])('interview navigation retains source state and focused controls at an immediate stable destination', async reduced => {
  motion(reduced);
  const workspace = createWorkspaceRecord('synthetic-stable-interview');
  workspace.returnSummary.targetTaxYear = 2026;
  const state = startInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null }, 2026);
  const route = buildSectionRoute(state.segmentation);
  // Navigation fixture: no calculated tax or source confirmation is supplied.
  state.completedSections = route.map(section => section.id);
  saveGuidedFlowState(localStorage, workspace.id, state);
  const original = structuredClone(state);
  const saved = () => JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id)) ?? '{}') as GuidedFlowState;
  const exit = vi.fn();
  const panel = await mountGuidedPanel(<GuidedInterviewShell workspace={workspace} onExitGuided={exit} />);
  const step = (id: string) => {
    const index = route.findIndex(section => section.id === id);
    const control = panel.container.querySelectorAll<HTMLButtonElement>('.guided-progress-step')[index];
    if (!control) throw new Error(`Missing actual interview navigation ${id}`);
    return control;
  };
  async function jump(id: string) {
    const control = step(id);
    control.focus();
    await act(async () => control.click());
    expect(document.activeElement).toBe(control);
    expect(control.getAttribute('aria-current')).toBe('step');
    expect(route[saved().currentSectionIndex]?.id).toBe(id);
  }
  try {
    await flushFrames();
    expect(window.scrollTo).not.toHaveBeenCalled();
    await jump('personal-info');
    expect(window.scrollTo).not.toHaveBeenCalled();
    await panel.change('First name', 'Avery');
    expect(window.scrollTo).not.toHaveBeenCalled();
    const entered = structuredClone(saved().sectionData);
    viewportTop = 1700;
    await jump('income-w2');
    expect(viewportTop).toBe(0);
    expect(pendingMovements).toEqual([]);
    viewportTop = 2100;
    await jump('deductions');
    await jump('personal-info');
    await flushFrames();
    expect(panel.control('First name').value).toBe('Avery');
    expect(saved().sectionData).toEqual(entered);
    expect(saved().taxYear).toBe(2026);
    expect(saved().segmentation).toEqual(original.segmentation);
    expect(viewportTop).toBe(0);
    expect(pendingMovements).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
    expect(panel.container.textContent).toContain('The 2026 rules and filing forms are not yet qualified.');
    expect(state).toEqual(original);
  } finally { await panel.dispose(); }
});
