// @vitest-environment jsdom
// Spec: spec/federal/education-ordinary-expense-composition.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EducationDistributionDetails } from '@/components/guided-interview/education-distribution-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedOrdinaryEducationExpenses } from '../../fixtures/guided-ordinary-education-expenses';

it('collects actual refund and credit facts through the education source panel', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = actualGuidedOrdinaryEducationExpenses();
  fixture.data.expenseRefunds = undefined;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); let latest = fixture.state;
  function Harness() {
    const [state, setState] = useState(fixture.state), input = buildTaxInputFromGuidedData(state);
    return <><EducationDistributionDetails data={state.sectionData.credits?.educationDistributions} onChange={next => {
      if (!state.sectionData.credits) throw new Error('Missing actual credit section');
      latest = updateSectionData(state, 'credits', { ...state.sectionData.credits, educationDistributions: next }); setState(latest);
    }} /><output>{input ? calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed() : 'pending'}</output></>;
  }
  function field(label: string, index = 0) {
    const element = [...container.querySelectorAll('label')].filter(row => row.querySelector('.guided-field-label')?.textContent === label)[index]
      ?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!element) throw new Error(`Missing actual field ${label} ${index}`);
    return element;
  }
  async function change(label: string, value: string, index = 0) {
    const element = field(label, index), setter = Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing actual input setter');
    await act(async () => { setter.call(element, value); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  async function button(label: string) {
    const element = [...container.querySelectorAll('button')].find(row => row.textContent === label);
    if (!element) throw new Error(`Missing actual button ${label}`);
    await act(async () => element.click());
  }
  async function confirm() {
    await change('Refund records checked after the last edit', 'true');
    await change('All education sources and allocations checked after the last edit', 'true');
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('output')?.textContent).toBe('pending');
    await button('Add expense refund');
    expect(field('Actual refund received').value).toBe(''); expect(field('Actual refund disposition').value).toBe('');
    expect(field('The designated beneficiary received this refund').value).toBe('');
    await change('Original expense refunded', 'tuition'); await change('Actual refund received', '500');
    await change('Actual refund received date', '2025-09-15');
    await change('The designated beneficiary received this refund', 'true'); await change('Actual refund disposition', 'cash_retained');
    await change('Refund source record reference', 'fictional original refund'); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('50300');
    expect(latest.sectionData.credits?.educationDistributions?.inKindBenefits).toHaveLength(1);
    await change('Actual refund received', ''); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    expect(latest.sectionData.credits?.educationDistributions?.expenseRefunds?.[0]?.amount).toBe('');
    await change('Actual refund received', '500'); await change('The designated beneficiary received this refund', 'false'); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    expect(latest.sectionData.credits?.educationDistributions?.expenseRefunds?.[0]?.receivedByBeneficiary).toBe(false);
    await change('The designated beneficiary received this refund', 'true'); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('50300');
    await change('Expense allocated to AOTC or lifetime learning credit', '100');
    expect(field('Actual non-tuition credit expense treatment').value).toBe('');
    await change('Actual non-tuition credit expense treatment', 'aotc_required_course_materials');
    await change('Course or institution credit source reference', 'fictional required course material');
    await change('Actual credit expense requirements checked, excluding personal or medical costs', 'false');
    expect(latest.sectionData.credits?.educationDistributions?.expenses?.[0]?.creditExpenseQualificationConfirmed).toBe(false);
    expect(container.querySelector('output')?.textContent).toBe('pending');
    await change('Expense category', 'postsecondary_computer');
    expect(latest.sectionData.credits?.educationDistributions?.expenses?.[0]?.creditExpenseSourceReference).toBe('fictional required course material');
    expect(latest.sectionData.credits?.educationDistributions?.expenseRefunds?.[0]?.sourceFactsConfirmed).toBeNull();
    await button('Remove expense refund 1'); expect(latest.sectionData.credits?.educationDistributions?.expenseRefunds).toEqual([]);
    expect(container.querySelector('output')?.textContent).toBe('pending');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
