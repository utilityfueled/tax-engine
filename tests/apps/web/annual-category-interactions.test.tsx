// @vitest-environment jsdom
// Spec: spec/federal/education-annual-category-limits.yaml actual-panel.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EducationDistributionDetails } from '@/components/guided-interview/education-distribution-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedAnnualCategory } from '../../fixtures/guided-annual-category-limits';
it('edits actual apprenticeship eligibility through the education panel', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = actualGuidedAnnualCategory(true), container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); let latest = fixture.state;
  function Harness() {
    const [state, setState] = useState(fixture.state), input = buildTaxInputFromGuidedData(state);
    return <><EducationDistributionDetails data={state.sectionData.credits?.educationDistributions} onChange={next => {
      if (!state.sectionData.credits) throw new Error('Missing actual credits');
      latest = updateSectionData(state, 'credits', { ...state.sectionData.credits, educationDistributions: next }); setState(latest);
    }} /><output>{input ? calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed() : 'pending'}</output></>;
  }
  async function change(label: string, value: string) {
    const row = [...container.querySelectorAll('label')].find(item => item.querySelector('.guided-field-label')?.textContent === label);
    const field = row?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing actual field ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing actual input setter');
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  const confirmation = 'All education sources and allocations checked after the last edit';
  const registration = 'Apprenticeship is registered and certified with the U.S. Department of Labor';
  try {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('output')?.textContent).toBe('57200');
    await change(registration, 'false');
    expect(latest.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    await change(confirmation, 'true'); expect(container.querySelector('output')?.textContent).toBe('59000');
    await change(registration, ''); await change(confirmation, 'true');
    expect(container.querySelector('output')?.textContent).toBe('pending');
    await change(registration, 'true'); await change(confirmation, 'true');
    expect(container.querySelector('output')?.textContent).toBe('57200');
    await change('These fees, books, supplies or equipment are required for participation', 'false'); await change(confirmation, 'true');
    expect(container.querySelector('output')?.textContent).toBe('59000');
    expect(latest.sectionData.credits?.educationDistributions?.forms?.map(row => row.fields.earnings)).toEqual(['3000', '6000']);
    expect(latest.sectionData.credits?.educationDistributions?.expenses?.[0]?.amount).toBe('6000');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
