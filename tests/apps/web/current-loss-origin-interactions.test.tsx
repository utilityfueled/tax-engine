// @vitest-environment jsdom
// Spec: spec/federal/guided-current-loss-origin.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CurrentLossOriginDetails } from '@/components/guided-interview/current-loss-origin-details';
import type { CurrentLossOriginData } from '@/lib/guided-current-loss-origin';

it('collects current origin facts without guessing losses or AMT answers', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: CurrentLossOriginData | undefined;
  function Harness() { const [data, setData] = useState(latest); return <CurrentLossOriginDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) {
    const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
    if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click());
  }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click('Add current-year loss sources'); expect(latest).toEqual({});
    await click('Add current business source'); expect(latest?.businessSources?.[0]?.sourceId).toBeUndefined();
    expect(latest?.businessSources?.[0]?.allInvestmentAtRisk).toBeUndefined();
    await change('Current business 1 source', 'scheduleC'); await change('Current business 1 owner', 'primary');
    await change('Current business 1 actual business name', 'Actual business source');
    await change('Current loss source tax year', '2025'); await change('Current loss packet reference', 'Actual reviewed packet');
    await click('Add independent current AMT comparison');
    expect(latest?.alternativeTax?.regularDepreciationSameAsAlternativeConfirmed).toBeUndefined();
    await change('Current regular and AMT depreciation are the same', 'false');
    expect(latest?.alternativeTax?.regularDepreciationSameAsAlternativeConfirmed).toBe(false);
    await change('Current business 1 sources checked after the last edit', 'true');
    await change('Current AMT comparison checked after the last edit', 'true');
    await change('Current loss sources checked after the last edit', 'true');
    expect(latest?.sourceFactsConfirmed).toBe(true); expect(latest?.businessSources?.[0]?.sourceFactsConfirmed).toBe(true);
    expect(latest?.alternativeTax?.sourceFactsConfirmed).toBe(true);
    await change('Current business 1 actual business name', 'Changed actual source');
    expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.businessSources?.[0]?.sourceFactsConfirmed).toBeNull();
    expect(latest?.alternativeTax?.sourceFactsConfirmed).toBeNull();
    await change('Current regular and AMT depreciation are the same', '');
    expect(latest?.alternativeTax?.regularDepreciationSameAsAlternativeConfirmed).toBeNull();
    expect(element.querySelector('input[type="number"]')).toBeNull();
    expect(latest).not.toHaveProperty('netOperatingLoss');
    await click('Remove current business 1'); expect(latest?.businessSources).toEqual([]);
    await click('Record no current business sources'); expect(latest?.businessSources).toEqual([]);
    await click('Remove current AMT comparison'); expect(latest?.alternativeTax).toBeUndefined();
    await click('Remove current-year loss sources'); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
