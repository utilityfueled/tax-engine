// @vitest-environment jsdom
// Spec: spec/federal/education-annual-loan-interest.yaml actual-panel.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { StudentLoanSourceDetails } from '@/components/guided-interview/student-loan-source-details';
import { EducationDistributionDetails } from '@/components/guided-interview/education-distribution-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedAnnualLoanInterest } from '../../fixtures/guided-annual-loan-interest';
import { requiredPeriodSource as required } from '../../fixtures/guided-room-board-periods';

it('edits the actual loan link while preserving the blank calculated field', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const initial = actualGuidedAnnualLoanInterest().state;
  let latest = initial;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  function Harness() {
    const [state, setState] = useState(initial);
    return <><StudentLoanSourceDetails data={state.sectionData.adjustments?.studentLoanFacts} filingStatus="single"
      educationDistributions={state.sectionData.credits?.educationDistributions} onChange={studentLoanFacts => {
        latest = updateSectionData(state, 'adjustments', { ...required(state.sectionData.adjustments), studentLoanFacts }); setState(latest);
      }} /><EducationDistributionDetails data={state.sectionData.credits?.educationDistributions} onChange={educationDistributions => {
        latest = updateSectionData(state, 'credits', { ...required(state.sectionData.credits), educationDistributions }); setState(latest);
      }} /></>;
  }
  const link = () => required([...container.querySelectorAll('label')].find(label => label.textContent === 'Loan 1: Link education loan-payment expense 1')?.querySelector<HTMLInputElement>('input'));
  const confirm = async (name = 'Student-loan sources checked after the last edit') => {
    const control = required([...container.querySelectorAll('label')].find(label => label.querySelector('.guided-field-label')?.textContent === name)?.querySelector<HTMLSelectElement>('select'));
    await act(async () => { control.value = 'true'; control.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  try {
    await act(async () => root.render(<Harness />));
    expect(container.textContent).toMatch(/calculated from the linked annual interest-only sources/i);
    await act(async () => link().click());
    expect(latest.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
    expect(latest.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    await confirm(); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await act(async () => link().click());
    await confirm('All education sources and allocations checked after the last edit');
    expect(latest.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
    await confirm();
    expect(calculateFederalTax(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(latest)))).agi.toFixed()).toBe('58000');
    expect(latest.sectionData.adjustments?.studentLoanFacts?.loans?.[0]?.qtpTaxFreeEarningsUsedForInterest).toBe('');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
