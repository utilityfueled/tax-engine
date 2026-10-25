// @vitest-environment jsdom
// Spec: spec/federal/guided-mortgage-recoveries.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionDeductions } from '@/components/guided-interview/section-deductions';
import { emptyDeductionData, type DeductionData } from '@/lib/guided-interview-flow';

it('collects actual recovery sources under the standard deduction and preserves unknowns', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: DeductionData = { ...emptyDeductionData };
  function Harness() { const [value, setValue] = useState(latest); return <SectionDeductions taxYear={2025} filingStatus="single" data={value} onDataChange={next => { latest = next; setValue(next); }} />; }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { setter?.call(control, value); control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); expect(latest.mortgageWorksheet).toBeUndefined();
    await change('Did you receive a refund or recovery of mortgage interest deducted in an earlier year?', 'true');
    await click('Add earlier-year mortgage recovery');
    await change('Recovery record reference', 'actual-private-refund'); await change('Actual refund received', '9007199254740993.01');
    await change('Taxable recovery from the completed tax-benefit worksheet', '0');
    expect(latest.mortgageWorksheet?.recoveries?.[0]).toMatchObject({ sourceReference: 'actual-private-refund', refundReceived: '9007199254740993.01', taxableRecovery: '0' });
    expect(latest.mortgageWorksheet?.recoveries?.[0]?.alreadyIncludedInOtherIncome).toBeUndefined();
    await change('Completed tax-benefit worksheet has been checked after the last edit', 'true');
    await change('Have you confirmed the complete annual home-debt worksheet after the last change?', 'true');
    await change('Actual refund received', '');
    expect(latest.mortgageWorksheet?.recoveries?.[0]?.refundReceived).toBe('');
    expect(latest.mortgageWorksheet?.recoveries?.[0]?.taxBenefitWorksheetConfirmed).toBeNull();
    expect(latest.mortgageWorksheet?.sourceFactsConfirmed).toBeNull();
    await click('Add recovery-only Form 1099-MISC');
    await change('Original Form 1099-MISC Box 3 other income', '600.01');
    await change('Original MISC direct-sales checkbox', 'false');
    expect(latest.mortgageWorksheet?.recoveryMiscStatements?.[0]?.directSales).toBe(false);
    expect(latest.mortgageWorksheet?.recoveryMiscStatements?.[0]?.federalWithheld).toBeUndefined();
    await change('Original MISC direct-sales checkbox', '');
    expect(latest.mortgageWorksheet?.recoveryMiscStatements?.[0]?.directSales).toBeNull();
    await click('Add closed-loan Form 1098'); await change('Closed-loan original Box 4 refund', '600.01');
    expect(latest.mortgageWorksheet?.recoveryOnlyStatements?.[0]?.mortgageInterest).toBeUndefined();
    await change('Did you receive a refund or recovery of mortgage interest deducted in an earlier year?', 'false');
    expect(latest.mortgageWorksheet?.recoveries).toHaveLength(1);
    expect(latest.mortgageWorksheet?.recoveryMiscStatements?.[0]?.otherIncome).toBe('600.01');
    await change('Did you receive a refund or recovery of mortgage interest deducted in an earlier year?', 'true');
    await click('Remove recovery #1'); expect(latest.mortgageWorksheet?.recoveries).toEqual([]);
    expect(latest.mortgageWorksheet?.allRecoveriesIncluded).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
