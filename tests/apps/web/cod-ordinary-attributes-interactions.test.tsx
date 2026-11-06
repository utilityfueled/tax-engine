// @vitest-environment jsdom
// Spec: spec/federal/cod-ordinary-attribute-sources.yaml guided-controls.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CodNolDetails } from '@/components/guided-interview/cod-nol-details';
import type { CodNolData } from '@/lib/guided-cod-nol';

it('collects original later attribute records and clears stale confirmations', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: CodNolData = {};
  function Harness() { const [data, setData] = useState(latest); return <CodNolDetails data={data} onChange={next => { latest = next ?? {}; setData(latest); }} />; }
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
    await act(async () => root.render(<Harness />)); await click('Add later-attribute sources');
    expect(latest.attributeSources?.regular).toBeUndefined();
    await click('Add regular attribute ledger'); await click('Record no regular attributes');
    expect(latest.attributeSources?.regular?.records).toEqual([]);
    await click('Add regular attribute');
    expect(latest.attributeSources?.regular?.records?.[0]?.originalAmount).toBeUndefined();
    await change('Regular attribute 1 kind', 'passive_credit'); await change('Regular attribute 1 original amount', '3000.49');
    await change('Regular attribute 1 current-year use', '0');
    expect(latest.attributeSources?.regular?.records?.[0]?.currentYearUse).toBe('0');
    await change('Regular attribute 1 sources checked after the last edit', 'true');
    await change('Later-attribute packet checked after the last edit', 'true');
    expect(latest.attributeSources?.sourceFactsConfirmed).toBe(true);
    await change('Regular attribute 1 original amount', '3000.50');
    expect(latest.attributeSources?.sourceFactsConfirmed).toBeNull();
    expect(latest.attributeSources?.regular?.records?.[0]?.sourceFactsConfirmed).toBeNull();
    expect(element.querySelector('input[type="number"]')).toBeNull();
    expect(latest.attributeSources?.regular?.records?.[0]).not.toHaveProperty('reduction');
  } finally { await act(async () => root.unmount()); element.remove(); }
});
