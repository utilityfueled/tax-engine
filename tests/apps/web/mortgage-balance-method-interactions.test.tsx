// @vitest-environment jsdom
// Spec: spec/federal/guided-mortgage-balance-methods.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DeductionSourceDetails } from '@/components/guided-interview/deduction-source-details';
import { emptyDeductionData, type DeductionData } from '@/lib/guided-interview-flow';
import { completeMortgageSource, completeMortgageWorksheet } from '../../guided-interview/complete-facts';

it('retains actual balance-method records and invalidates source changes', async () => {
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
  async function click(label: string) { const target = [...container.querySelectorAll('button,label')].find(node => node.textContent === label); if (!target) throw new Error(`Missing ${label}`); await act(async () => (target as HTMLElement).click()); }
  try {
    await act(async () => root.render(<Harness />));
    await change('Balance method for the home-debt worksheet', 'first_last');
    expect(latest.mortgageEntries?.[0]?.balanceFirstLast).toBeUndefined();
    await change('First day the loan was secured by the qualified home: balance', '9007199254740993.01');
    await change('Last day the loan was secured by the qualified home: balance', '0');
    await change('No additional borrowing during the year, apart from the original mortgage', 'false');
    expect(latest.mortgageEntries?.[0]?.balanceFirstLast).toMatchObject({ firstBalance: '9007199254740993.01', lastBalance: '0', noAdditionalBorrowing: false });
    await change('No additional borrowing during the year, apart from the original mortgage', '');
    expect(latest.mortgageEntries?.[0]?.balanceFirstLast?.noAdditionalBorrowing).toBeNull();
    await change('Balance method for the home-debt worksheet', 'monthly');
    expect(latest.mortgageEntries?.[0]?.balanceMonthly).toBeUndefined();
    await click('Qualified-home month: January'); await click('Add monthly balance');
    expect(latest.mortgageEntries?.[0]?.balanceMonthly).toMatchObject({ qualifiedHomeMonths: ['1'], balances: [{}] });
    await change('Monthly balance 1 source month', '1'); await change('Monthly balance 1 amount', '0');
    await change('All qualified-home months and lender balance records are included', 'true');
    await change('Have you confirmed the complete annual home-debt worksheet after the last change?', 'true');
    await change('Have you checked all mortgage source and qualification facts after the last edit?', 'true');
    expect(latest.mortgageWorksheet?.sourceFactsConfirmed).toBe(true);
    await change('Monthly balance 1 amount', '');
    expect(latest.mortgageWorksheet?.sourceFactsConfirmed).toBeNull(); expect(latest.mortgageEntries?.[0]?.sourceFactsConfirmed).toBeNull();
    await change('Balance method for the home-debt worksheet', 'interest_rate');
    expect(latest.mortgageEntries?.[0]?.balanceInterestRate).toBeUndefined();
    await change('Actual lowest annual interest rate as a decimal', '0.090000000000001');
    await change('Current-year interest previously paid by this return', '0');
    expect(latest.mortgageEntries?.[0]?.balanceInterestRate).toMatchObject({ lowestAnnualRate: '0.090000000000001', currentYearInterestPaidInPriorYears: '0' });
    expect(latest.mortgageEntries?.[0]?.balanceInterestRate?.interestRefundedToOthers).toBeUndefined();
    await change('Balance method for the home-debt worksheet', 'first_last');
    expect(latest.mortgageEntries?.[0]?.balanceFirstLast?.firstBalance).toBe('9007199254740993.01');
    expect(latest.mortgageEntries?.[0]?.balanceMonthly?.balances?.[0]?.amount).toBe('');
    expect(latest.mortgageEntries?.[0]?.outstandingPrincipal).toBe('250000');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
