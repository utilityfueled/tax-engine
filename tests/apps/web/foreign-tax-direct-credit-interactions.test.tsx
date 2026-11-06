// @vitest-environment jsdom
// Spec: spec/federal/guided-foreign-tax-direct-credit.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ForeignTaxElectionDetails } from '@/components/guided-interview/foreign-tax-election-details';
import { buildGuidedForeignTaxElection, type ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import { completeInterestEntry } from '../../guided-interview/complete-facts';

it('collects the actual elected credit from an empty annual worksheet', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: ForeignTaxElectionData | undefined;
  const investment = { interestEntries: [{ ...completeInterestEntry, payer: 'Synthetic foreign bank', payerTin: '112233445', accountReference: 'Actual account A', foreignTaxPaid: '200.25', foreignCountry: 'Canada' }], dividendEntries: [], brokerageEntries: [] };
  function Harness() { const [data, setData] = useState<ForeignTaxElectionData>(); return <ForeignTaxElectionDetails data={data} investment={investment} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(row => row.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing field setter');
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click('Add annual foreign-tax election');
    await change('Foreign-tax election year', '2025'); await change('Annual foreign-tax choice', 'credit');
    await change('Annual election source reference', 'Actual annual source');
    await click('Add election without Form 1116');
    expect(latest?.creditWithoutForm1116?.electionConfirmed).toBeUndefined();
    expect(latest?.creditWithoutForm1116?.carryovers).toBeUndefined();
    await change('Foreign-tax accounting method', 'paid'); await change('An accrued-credit election was made in an earlier year', 'false');
    for (const label of ['All qualified foreign taxes for the year are included here', 'No unused foreign-tax credit carryovers enter this year', 'No foreign-tax redetermination affects these sources']) await change(label, 'true');
    await change('The taxpayer elects the credit without Form 1116', 'true'); await change('Return on which the election is made', 'original_return');
    await change('Direct-credit election source reference', 'Actual signed election and eligibility');
    for (const label of ['All foreign gross income is passive income', 'All foreign income and taxes are on qualified payee statements', 'No required foreign-credit reduction applies', 'Prior regular and AMT credit history is complete']) await change(label, 'true');
    await change('Prior credits adjusted through tax year', '2024'); await change('Prior credit filing history', 'continuous_individual');
    await click('Add taxpayer status'); expect(latest?.creditWithoutForm1116?.taxpayers?.[0]?.status).toBeUndefined();
    await change('Taxpayer status 1 owner', 'primary'); await change('Taxpayer status 1 actual status', 'us_citizen'); await change('Taxpayer status 1 source reference', 'Actual citizenship record');
    await click('Confirm no regular prior credits'); await click('Confirm no AMT prior credits');
    await click('Add foreign-tax statement'); await change('Foreign-tax statement 1', 'form1099Int:0');
    await change('Source 1 jurisdiction', 'foreign_country'); await change('Source 1 is a qualified foreign income tax', 'true');
    for (const label of ['tax on excluded income', 'tax deducted elsewhere', 'investment tax allocation']) await change(`Source 1 ${label}`, '0');
    for (const label of ['is passive income', 'is legally owed by this taxpayer', 'has no refund or subsidy entitlement', 'meets the actual holding-period requirement', 'has no related-payment obligation', 'has no disallowed-country or boycott reduction']) await change(`Source 1 ${label}`, 'true');
    await change('Source 1 tax record reference', 'Actual paid statement'); await click('Add payment for source 1');
    await change('Source 1 payment 1 date', '2025-09-15'); await change('Source 1 payment 1 USD amount', '200.25');
    await change('Direct-credit election facts checked after the last edit', 'true'); await change('Foreign-tax election sources checked after the last edit', 'true');
    const actual = buildGuidedForeignTaxElection(latest, investment, 2025, 'single');
    expect(actual?.creditWithoutForm1116).toMatchObject({ electionConfirmed: true, adjustedThroughTaxYear: 2024, carryovers: [], amtCarryovers: [] });
    expect(actual?.sources?.[0]?.reportedTaxAmount).toBe('200.25');
    await change('Source 1 payment 1 date', '2025-09-16');
    expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.creditWithoutForm1116?.sourceFactsConfirmed).toBeNull();
    await click('Add regular prior credit'); expect(latest?.creditWithoutForm1116?.carryovers?.[0]?.amount).toBeUndefined();
    await change('Regular prior credit 1 origin year', '2024'); await change('Regular prior credit 1 category', 'passive');
    await change('Regular prior credit 1 adjusted balance', '9007199254740993.03'); await change('Regular prior credit 1 source reference', 'Actual adjusted prior record');
    expect(latest?.creditWithoutForm1116?.carryovers?.[0]?.amount).toBe('9007199254740993.03');
    await change('Annual foreign-tax choice', 'deduction');
    expect(latest?.creditWithoutForm1116?.carryovers?.[0]?.amount).toBe('9007199254740993.03');
    await change('Foreign-tax election sources checked after the last edit', 'true');
    expect(() => buildGuidedForeignTaxElection(latest, investment, 2025, 'single')).toThrow();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
