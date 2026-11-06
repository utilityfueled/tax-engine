// @vitest-environment jsdom
// Spec: spec/federal/guided-crypto-donations.yaml controls.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionDeductions } from '@/components/guided-interview/section-deductions';
import { emptyDeductionData, type DeductionData } from '@/lib/guided-interview-flow';
import { buildGuidedCryptoDonations } from '@/lib/guided-crypto-donations';

it('collects original digital-asset gifts and explicit appraisal facts', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: DeductionData = { ...emptyDeductionData };
  function Harness() {
    const [data, setData] = useState(latest);
    return <SectionDeductions data={data} filingStatus="single" taxYear={2025} onDataChange={next => { latest = next; setData(next); }} />;
  }
  function control(label: string) {
    const input = [...element.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    return input;
  }
  async function change(label: string, value: string) {
    const input = control(`Digital-asset gift 1 ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  }
  async function click(text: string) {
    const button = [...element.querySelectorAll('button')].find(row => row.textContent === text);
    if (!button) throw new Error(`Missing ${text}`);
    await act(async () => button.click());
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(latest.cryptoDonations).toBeUndefined();
    await click('Add digital-asset gift');
    expect(latest.cryptoDonations).toEqual([{}]);
    expect(control('Digital-asset gift 1 qualified appraisal is required after reviewing all similar-property gifts').value).toBe('');
    for (const [label, value] of [
      ['asset', 'ETH'], ['exact quantity', '0.0000000000000000000000007'],
      ['original acquisition date', '2024-01-01'], ['donation date', '2025-06-01'],
      ['total fair market value at donation', '4000.25'], ['original cost basis', '0'],
      ['recipient name', 'Synthetic public charity'], ['recipient EIN, if available', '12-3456789'],
      ['recipient is a qualified charitable organization', 'true'], ['recipient tax category', 'fifty-percent'],
      ['property was a capital asset', 'true'], ['entire ownership interest was donated', 'true'],
      ['no goods or services were received in exchange', 'true'], ['required receipts and substantiation are complete', 'true'],
      ['qualified appraisal is required after reviewing all similar-property gifts', 'true'],
      ['required qualified appraisal was obtained', 'false'], ['checked after the last edit', 'true'],
    ]) await change(label, value);
    expect(() => buildGuidedCryptoDonations(latest.cryptoDonations, 2025)).toThrow(/appraisal/i);
    expect(latest.cryptoDonations?.[0].qualifiedAppraisalObtained).toBe(false);
    await change('required qualified appraisal was obtained', 'true');
    expect(control('Digital-asset gift 1 checked after the last edit').value).toBe('');
    await change('checked after the last edit', 'true');
    expect(buildGuidedCryptoDonations(latest.cryptoDonations, 2025)?.[0]).toMatchObject({ costBasis: '0', fairMarketValueAtDonation: '4000.25', quantity: '0.0000000000000000000000007', appraisalRequired: true, qualifiedAppraisalObtained: true });
    expect(latest.charitableContributions).toBe('');
    await change('original cost basis', '');
    expect(latest.cryptoDonations?.[0].costBasis).toBe('');
    await change('checked after the last edit', 'true');
    expect(() => buildGuidedCryptoDonations(latest.cryptoDonations, 2025)).toThrow(/basis/i);
    await click('Remove digital-asset gift 1');
    expect(latest.cryptoDonations).toEqual([]);
    expect(buildGuidedCryptoDonations(latest.cryptoDonations, 2025)).toEqual([]);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
