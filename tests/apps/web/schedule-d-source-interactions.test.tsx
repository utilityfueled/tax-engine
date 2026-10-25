// @vitest-environment jsdom
// Spec: spec/federal/guided-schedule-d-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ScheduleDSourceDetails } from '@/components/guided-interview/schedule-d-source-details';
import type { ScheduleDSourceData } from '@/lib/guided-schedule-d-sources';
import { completeBrokerageSource, completeTransactionSource } from '../../guided-interview/complete-facts';

it('collects source classifications and exact original capital records', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  const investments = { dividendEntries: [], brokerageEntries: [{ ...completeBrokerageSource, transactions: [{ ...completeTransactionSource,
    specialGainCharacter: 'collectible' as const, proceeds: '9007199254740993.03', costBasis: '9007199254740992.02' }] }] };
  const before = JSON.stringify(investments); let latest: ScheduleDSourceData | undefined;
  function Harness() { const [data, setData] = useState(latest); return <ScheduleDSourceDetails investments={investments} data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) { const input = [...element.querySelectorAll('label')].find(node => node.textContent?.includes(label))?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!input) throw new Error(`Missing ${label}`); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  async function click(text: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === text); if (!button) throw new Error(`Missing ${text}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click('Add capital source worksheet');
    expect(latest?.sourceTaxYear).toBeUndefined(); expect(latest?.amtBasisAndCarryoversSameAsRegularConfirmed).toBeUndefined();
    await click('Copy current investment records for review');
    expect(latest?.longTermAssets?.[0]).toMatchObject({ sourceTaxYear: undefined, character: 'collectible', proceeds: '9007199254740993.03' });
    await change('Capital worksheet tax year', '2025'); await change('Prior short-term capital loss carryover', '-1000');
    await change('Does the return include Form 2439', 'false'); expect(latest?.form2439Present).toBe(false);
    await change('Asset 1 original tax year', '2025'); await change('Asset 1 original source reference', 'private actual source');
    await change('Have you reviewed the capital source worksheet after the last edit?', 'true'); expect(latest?.sourceFactsConfirmed).toBe(true);
    await change('Asset 1 proceeds', '0'); expect(latest?.longTermAssets?.[0]?.proceeds).toBe('0'); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change('Asset 1 proceeds', ''); expect(latest?.longTermAssets?.[0]?.proceeds).toBe('');
    expect(JSON.stringify(investments)).toBe(before);
    await click('Remove capital source worksheet'); expect(latest).toBeUndefined(); expect(JSON.stringify(investments)).toBe(before);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
