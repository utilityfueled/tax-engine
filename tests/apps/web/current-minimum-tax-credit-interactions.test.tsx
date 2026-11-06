// @vitest-environment jsdom
// Spec: current-minimum-tax-credit-sources.yaml guided-controls.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CodAttributeDetails } from '@/components/guided-interview/cod-attribute-details';
import type { CodAttributeData } from '@/lib/guided-cod-attributes';

it('collects signed current originals without default source facts', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: CodAttributeData | undefined;
  function Harness() { const [data, setData] = useState<CodAttributeData>({ currentMinimumTaxCredit: {} });
    return <CodAttributeDetails data={data} onChange={next => { latest = next; setData(next ?? {}); }} />; }
  async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(row => row.textContent === text);
    if (!button) throw new Error(`Missing ${text}`); await act(async () => button.click());
  }
  async function change(text: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === text)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${text}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<Harness />)); await click('Add signed current-year minimum-tax sources');
    expect(latest?.currentMinimumTaxCredit?.sourceYearCalculation?.sourceTaxYear).toBeUndefined();
    await click('Add current MTC K1 statement');
    expect(latest?.currentMinimumTaxCredit?.sourceYearCalculation?.k1Statements?.[0]?.depreciationAdjustment).toBeUndefined();
    await change('Current MTC K1 statement 1 depreciation adjustment', '-9007199254740993.03');
    expect(latest?.currentMinimumTaxCredit?.sourceYearCalculation?.k1Statements?.[0]?.depreciationAdjustment).toBe('-9007199254740993.03');
    await change('Current MTC K1 statement 1 all other original amounts are zero', 'false');
    expect((latest?.currentMinimumTaxCredit?.sourceYearCalculation?.k1Statements?.[0] as unknown as { standaloneOriginal: { allOtherAmountsZeroConfirmed: boolean } }).standaloneOriginal.allOtherAmountsZeroConfirmed).toBe(false);
    await click('Add independent current MTC NOL history'); await click('Record no current MTC NOL carryovers');
    expect(latest?.currentMinimumTaxCredit?.sourceYearCalculation?.minimumTaxCreditNolHistory?.carryoverSources).toEqual([]);
    expect(latest?.currentMinimumTaxCredit?.sourceYearCalculation?.minimumTaxCreditNolHistory?.carrybackSources).toBeUndefined();
    await change('Current MTC sources checked after the last edit', 'true');
    await change('Current MTC K1 statement 1 depreciation adjustment', '');
    expect(latest?.currentMinimumTaxCredit?.sourceYearCalculation?.sourceFactsConfirmed).toBeNull();
    expect(latest?.currentMinimumTaxCredit?.sourceYearCalculation?.k1Statements?.[0]?.depreciationAdjustment).toBe('');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
