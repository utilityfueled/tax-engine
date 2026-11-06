// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-mixed-tuition.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EducationDistributionDetails } from '@/components/guided-interview/education-distribution-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedMixedTuition } from '../../fixtures/guided-mixed-tuition';

it('edits the mixed original source group through actual controls', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = actualGuidedMixedTuition(), container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); let latest = fixture.state;
  function Harness() {
    const [state, setState] = useState(fixture.state), input = buildTaxInputFromGuidedData(state);
    return <><EducationDistributionDetails data={state.sectionData.credits?.educationDistributions} onChange={next => {
      if (!state.sectionData.credits) throw new Error('Missing credits');
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
  try {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('output')?.textContent).toBe('51500');
    expect(fields('Actual 529 distribution form').map(field => field.value)).toEqual(['in_kind_prepaid_tuition', 'cash']);
    expect(fields('Actual benefit cost')).toHaveLength(1);
    await change('Net expense allocated to this distribution', '1500', 2);
    await change('Net expense allocated to this distribution', '3500', 1);
    expect(latest.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    await change('All education sources and allocations checked after the last edit', 'true');
    expect(container.querySelector('output')?.textContent).toBe('51350');
    await change('Actual prior-year account basis', '');
    await change('All education sources and allocations checked after the last edit', 'true');
    expect(container.querySelector('output')?.textContent).toBe('pending');
    expect(latest.sectionData.credits?.educationDistributions?.coverdellAccounts?.[0]?.priorYearBasis).toBe('');
    await change('Actual prior-year account basis', '0');
    await change('All education sources and allocations checked after the last edit', 'true');
    expect(container.querySelector('output')?.textContent).toBe('pending');
    expect(latest.sectionData.credits?.educationDistributions?.coverdellAccounts?.[0]?.priorYearBasis).toBe('0');
    await change('Actual prior-year account basis', '4800');
    await change('All education sources and allocations checked after the last edit', 'true');
    expect(container.querySelector('output')?.textContent).toBe('51350');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
