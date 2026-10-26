// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-annual-cash.yaml actual-panel.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EducationDistributionDetails } from '@/components/guided-interview/education-distribution-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedAnnualCashQtp } from '../../fixtures/guided-annual-cash-qtp';
it('edits actual annual cash statements through the education panel', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = actualGuidedAnnualCashQtp(), container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); let latest = fixture.state;
  function Harness() {
    const [state, setState] = useState(fixture.state), input = buildTaxInputFromGuidedData(state);
    return <><EducationDistributionDetails data={state.sectionData.credits?.educationDistributions} onChange={next => {
      if (!state.sectionData.credits) throw new Error('Missing actual credits');
      latest = updateSectionData(state, 'credits', { ...state.sectionData.credits, educationDistributions: next }); setState(latest);
    }} /><output>{input ? calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed() : 'pending'}</output></>;
  }
  function fields(label: string) {
    return [...container.querySelectorAll('label')].filter(row => row.querySelector('.guided-field-label')?.textContent === label)
      .map(row => row.querySelector<HTMLInputElement | HTMLSelectElement>('input,select')).filter((value): value is HTMLInputElement | HTMLSelectElement => value !== null);
  }
  async function change(label: string, value: string, index = 0) {
    const field = fields(label)[index]; if (!field) throw new Error(`Missing ${label} ${index}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing actual input setter');
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  async function confirm() {
    await change('Statement facts checked against the actual source', 'true', 1);
    await change('Actual academic-period records checked', 'true');
    await change('Receipt and period link checked', 'true', 0); await change('Receipt and period link checked', 'true', 1);
    await change('All education sources and allocations checked after the last edit', 'true');
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('output')?.textContent).toBe('53500');
    await change('Box 2 earnings (leave blank if not reported)', '2000', 1);
    expect(latest.sectionData.credits?.educationDistributions?.forms?.[1]?.fields.sourceFactsConfirmed).toBeNull();
    expect(latest.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    await confirm(); expect(container.querySelector('output')?.textContent).toBe('pending');
    await change('Box 3 basis (leave blank if not reported)', '8000', 1); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('54200');
    await change('Box 2 earnings (leave blank if not reported)', '', 1); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    await change('Box 2 earnings (leave blank if not reported)', '2000', 1); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('54200');
    expect(latest.sectionData.credits?.educationDistributions?.allocations?.map(row => row.amount)).toEqual(['5000', '5000']);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
