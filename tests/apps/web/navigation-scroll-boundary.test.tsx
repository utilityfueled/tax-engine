// @vitest-environment jsdom
// Spec: spec/federal/navigation-scroll-boundary.yaml, resize-retained-position.
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { NavigationScrollBoundary } from '@/components/navigation-scroll-boundary';
import { mountGuidedPanel } from './guided-panel-dom';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.style.removeProperty('--site-nav-height'); });

async function scene(initialScroll = 400) {
  let height = 87;
  let scrollY = initialScroll;
  let deliver: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { deliver = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    height, width: 390, top: 0, bottom: height, left: 0, right: 390, x: 0, y: 0, toJSON() {},
  }));
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
  const scroll = vi.spyOn(window, 'scrollBy').mockImplementation((options) => {
    if (typeof options !== 'object') throw Error('Explicit scroll options required');
    scrollY = Math.max(0, scrollY + (options.top ?? 0));
  });
  const dom = await mountGuidedPanel(<NavigationScrollBoundary><button>Source control</button></NavigationScrollBoundary>);
  return { ...dom, scroll, disconnect, setHeight(next: number) { height = next; },
    getScroll: () => scrollY, observe: () => deliver?.(), resize: () => window.dispatchEvent(new Event('resize')) };
}

it('preserves the native target gutter when resize delivery follows native scrolling', async () => {
  const dom = await scene();
  try {
    expect(dom.scroll).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--site-nav-height')).toBe('87px');
    // Native scroll used the old 87px header plus 8px gutter before resize delivery.
    const sourceDocumentTop = dom.getScroll() + 95;
    dom.setHeight(117);
    dom.resize();
    expect(sourceDocumentTop - dom.getScroll()).toBe(125);
    expect(dom.scroll).toHaveBeenLastCalledWith({ top: -30, behavior: 'instant' });
    expect(document.documentElement.style.getPropertyValue('--site-nav-height')).toBe('117px');
    dom.observe(); dom.resize();
    expect(dom.scroll).toHaveBeenCalledTimes(1);
    dom.setHeight(87); dom.observe();
    expect(sourceDocumentTop - dom.getScroll()).toBe(95);
    expect(dom.scroll).toHaveBeenLastCalledWith({ top: 30, behavior: 'instant' });
  } finally { await dom.dispose(); }
});

it('keeps page top stationary and removes resize ownership on unmount', async () => {
  document.documentElement.style.setProperty('--site-nav-height', '44px', 'important');
  const dom = await scene(0);
  dom.setHeight(117); dom.resize(); dom.observe();
  expect(dom.scroll).not.toHaveBeenCalled();
  await dom.dispose();
  expect(dom.disconnect).toHaveBeenCalledTimes(1);
  expect(document.documentElement.style.getPropertyValue('--site-nav-height')).toBe('44px');
  expect(document.documentElement.style.getPropertyPriority('--site-nav-height')).toBe('important');
  dom.setHeight(150); dom.resize(); dom.observe();
  expect(dom.scroll).not.toHaveBeenCalled();
  expect(document.documentElement.style.getPropertyValue('--site-nav-height')).toBe('44px');
});

it('preserves a later owner of the navigation custom property', async () => {
  const dom = await scene();
  document.documentElement.style.setProperty('--site-nav-height', '200px', 'important');
  await dom.dispose();
  expect(document.documentElement.style.getPropertyValue('--site-nav-height')).toBe('200px');
  expect(document.documentElement.style.getPropertyPriority('--site-nav-height')).toBe('important');
});
