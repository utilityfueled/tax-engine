// @vitest-environment jsdom
// Spec: spec/federal/guided-mortgage-points-history.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DeductionSourceDetails } from '@/components/guided-interview/deduction-source-details';
import { emptyDeductionData, type DeductionData } from '@/lib/guided-interview-flow';
import { completeMortgageSource, completeMortgageWorksheet } from '../../guided-interview/complete-facts';

it('preserves actual mortgage points history and invalidates changed confirmations', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: DeductionData = { ...emptyDeductionData, method: 'itemized', mortgageEntries: [{ ...completeMortgageSource }], mortgageWorksheet: { ...completeMortgageWorksheet } };
  function Harness() { const [value, setValue] = useState(latest); return <DeductionSourceDetails data={value} onChange={next => { latest = next; setValue(next); }} />; }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error(`Missing setter for ${label}`);
    await act(async () => { setter.call(control, value); control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await change('Actual points deduction method', 'ratable');
    expect(latest.mortgageEntries?.[0]?.pointsHistory).toBeUndefined();
    await change('Points worksheet tax year', '2025'); await change('Original eligible points excluding service fees', '9007199254740993.01');
    await change('Points deducted before this tax year', '0');
    await change('Actual comparable-loan terms are established', 'false');
    expect(latest.mortgageEntries?.[0]?.pointsHistory).toMatchObject({ sourceTaxYear: '2025', originalPoints: '9007199254740993.01', priorPointsDeducted: '0', comparableLoanTerms: false });
    expect(latest.mortgageEntries?.[0]?.pointsHistory?.unamortizedPointsAtStartOfYear).toBeUndefined();
    await change('Actual comparable-loan terms are established', '');
    expect(latest.mortgageEntries?.[0]?.pointsHistory?.comparableLoanTerms).toBeNull();
    await change('Have you confirmed the complete annual home-debt worksheet after the last change?', 'true');
    await change('Have you checked all mortgage source and qualification facts after the last edit?', 'true');
    await change('Original loan, current statement, payment share and past points deductions reconcile', 'true');
    await change('Original eligible points excluding service fees', '');
    expect(latest.mortgageEntries?.[0]?.pointsHistory?.originalPoints).toBe('');
    expect(latest.mortgageEntries?.[0]?.pointsHistory?.historyConfirmed).toBeNull();
    expect(latest.mortgageEntries?.[0]?.sourceFactsConfirmed).toBeNull(); expect(latest.mortgageWorksheet?.sourceFactsConfirmed).toBeNull();
    await change('Actual points deduction method', 'completed_amortization'); await change('Actual completed points method', 'early_termination');
    await change('Was the old mortgage refinanced with the same lender?', 'false');
    await change('Actual points deduction method', 'ratable'); await change('Actual points deduction method', 'completed_amortization');
    expect(latest.mortgageEntries?.[0]?.pointsHistory?.sameLenderRefinance).toBe(false);
    expect(latest.mortgageEntries?.[0]?.pointsPaid).toBe('0');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
