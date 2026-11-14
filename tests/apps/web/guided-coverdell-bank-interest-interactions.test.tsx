// @vitest-environment jsdom
// Spec: spec/federal/guided-coverdell-bank-interest.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EducationDistributionDetails } from '@/components/guided-interview/education-distribution-details';
import { buildEducationDistributionInputs, type EducationDistributionData } from '@/lib/guided-education-distributions';
import { guidedCoverdellBankInterest } from '../../fixtures/guided-coverdell-bank-interest.js';

it('collects actual bank conversion originals and requires review after visible edits', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = guidedCoverdellBankInterest();
  const initial = structuredClone(fixture.data); if (!initial.forms?.[0]) throw Error('Missing original');
  delete initial.forms[0].bankInterestConversion;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: EducationDistributionData | undefined;
  function Harness() { const [data, setData] = useState(initial); return <EducationDistributionDetails data={data} taxYear={2025} filingStatus="single" originalContext={fixture.context} onChange={next => { latest = next; if (next) setData(next); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(item => item.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw Error(`Missing actual control ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw Error('Missing native setter');
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    const add = [...container.querySelectorAll('button')].find(button => button.textContent === 'Add actual January 1 bank conversion'); if (!add) throw Error('Missing new source route');
    await act(async () => add.click());
    expect(latest?.forms?.[0]?.bankInterestConversion).toEqual({});
    await change('Bank conversion and original INT sources checked after the last edit', 'true');
    expect(() => buildEducationDistributionInputs(latest, 2025, 'single', undefined, fixture.context)).toThrow();
    await change('Full-year bank and custody source reference', 'Fictional complete January1 conversion and full-year bank ledger');
    await change('Actual custodian conversion date', '2025-01-01');
    await change('Actual custodian conversion record reference', 'Fictional actual January1 taxable deposit conversion');
    for (const label of ['All activity after January 1 is included in these original records', 'The account held only cash on January 1', 'You are the designated beneficiary and own the converted bank deposit', 'No trust retained ownership after the actual conversion', 'Actual records establish an ordinary domestic bank deposit']) await change(label, 'true');
    for (const [label, value] of [['Actual opening cash after conversion', '1000'], ['Actual full-year closing bank cash', '1100'], ['Actual full-year taxable bank interest', '100'], ['Other actual income', '0'], ['Actual realized gains', '0'], ['Actual realized losses', '0'], ['Actual later contributions', '0'], ['Actual later withdrawals', '0'], ['Actual later transfers', '0'], ['Actual later fees', '0']]) await change(label, value);
    await change('Actual original bank 1099-INT already entered', '0');
    expect(latest?.forms?.[0]?.bankInterestConversion?.sourceFactsConfirmed).toBeNull();
    await change('Bank conversion and original INT sources checked after the last edit', 'true');
    await change('All education sources and allocations checked after the last edit', 'true');
    expect(buildEducationDistributionInputs(latest, 2025, 'single', undefined, fixture.context).form1099Q?.[0]?.postDisqualificationInterestSources?.taxableBankInterest).toBe('100');
    await change('Actual full-year closing bank cash', '1101');
    expect(latest?.forms?.[0]?.bankInterestConversion?.sourceFactsConfirmed).toBeNull();
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(() => buildEducationDistributionInputs(latest, 2025, 'single', undefined, fixture.context)).toThrow(/review/i);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it('renders incomplete unrelated originals without admitting their unknown source facts', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  for (const incomplete of [
    { payer: 'Fictional unrelated partial bond', interestIncome: '0', federalWithheld: '0', privateActivityBondInterest: '10' },
    { payer: 'Fictional unrelated unfinished entry', interestIncome: '100..', federalWithheld: '0' },
  ]) {
    const fixture = guidedCoverdellBankInterest(); fixture.context.interestEntries?.push(incomplete);
    expect(() => renderToStaticMarkup(<EducationDistributionDetails data={fixture.data} originalContext={fixture.context} taxYear={2025} filingStatus="single" onChange={() => undefined} />)).not.toThrow();
    expect(() => buildEducationDistributionInputs(fixture.data, 2025, 'single', undefined, fixture.context)).toThrow();
  }
});
