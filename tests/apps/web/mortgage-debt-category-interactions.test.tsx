// @vitest-environment jsdom
// Spec: spec/federal/guided-mortgage-debt-categories.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DeductionSourceDetails } from '@/components/guided-interview/deduction-source-details';
import { emptyDeductionData, type DeductionData } from '@/lib/guided-interview-flow';
import { completeMortgageSource, completeMortgageWorksheet } from '../../guided-interview/complete-facts';

it('preserves completed mortgage category sources and revokes edited confirmations', async () => {
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
    await change('Actual loan type', 'refinance'); await change('Balance method for the home-debt worksheet', 'category_worksheet');
    expect(latest.mortgageEntries?.[0]?.balanceCategories).toBeUndefined();
    await change('Completed debt-category worksheet tax year', '2025');
    await change('Completed debt-category worksheet reference', 'Private original debt records');
    await change('Average grandfathered debt from the completed worksheet', '0');
    await change('Average acquisition debt incurred before December 16, 2017', '9007199254740993.01');
    await change('Original balances, use and refinancing term limits have been checked', 'false');
    expect(latest.mortgageEntries?.[0]?.balanceCategories).toMatchObject({ sourceTaxYear: '2025', grandfatheredDebt: '0', acquisitionDebtBefore2017: '9007199254740993.01', refinancingHistoryConfirmed: false });
    expect(latest.mortgageEntries?.[0]?.balanceCategories?.acquisitionDebtAfter2017).toBeUndefined();
    await change('Original balances, use and refinancing term limits have been checked', '');
    expect(latest.mortgageEntries?.[0]?.balanceCategories?.refinancingHistoryConfirmed).toBeNull();
    await change('Have you confirmed the complete annual home-debt worksheet after the last change?', 'true');
    await change('Have you checked all mortgage source and qualification facts after the last edit?', 'true');
    await change('Average grandfathered debt from the completed worksheet', '');
    expect(latest.mortgageEntries?.[0]?.balanceCategories?.grandfatheredDebt).toBe('');
    expect(latest.mortgageEntries?.[0]?.sourceFactsConfirmed).toBeNull(); expect(latest.mortgageWorksheet?.sourceFactsConfirmed).toBeNull();
    await change('Balance method for the home-debt worksheet', 'highest_balance');
    await change('Balance method for the home-debt worksheet', 'category_worksheet');
    expect(latest.mortgageEntries?.[0]?.balanceCategories?.acquisitionDebtBefore2017).toBe('9007199254740993.01');
    expect(latest.mortgageEntries?.[0]?.outstandingPrincipal).toBe('250000');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
