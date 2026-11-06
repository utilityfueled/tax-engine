// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-room-board-periods.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EducationDistributionDetails } from '@/components/guided-interview/education-distribution-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedRoomBoardPeriod } from '../../fixtures/guided-room-board-periods';

it('edits actual institutional periods through the education source panel', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = actualGuidedRoomBoardPeriod(), container = document.createElement('div'); document.body.appendChild(container);
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
  try {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('output')?.textContent).toBe('50800');
    expect(fields('Institution name').map(field => field.value)).toEqual(['Fictional Example College']);
    expect(fields('Receipt academic period').map(field => field.value)).toEqual(['fall', 'fall']);
    await change('Actual period room-and-board allowance', '7000');
    expect(latest.sectionData.credits?.educationDistributions?.roomBoardPeriods?.[0]?.sourceFactsConfirmed).toBeNull();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    async function confirm() {
      await change('Actual academic-period records checked', 'true');
      await change('Receipt and period link checked', 'true', 0);
      await change('Receipt and period link checked', 'true', 1);
      await change('All education sources and allocations checked after the last edit', 'true');
    }
    await confirm(); expect(container.querySelector('output')?.textContent).toBe('50600');
    await change('Actual period room-and-board allowance', ''); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    await change('Actual period room-and-board allowance', '0'); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('52000');
    await change('Actual period room-and-board allowance', '6000');
    await change('Student enrolled at least half time for this period', 'false'); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('52000');
    expect(latest.sectionData.credits?.educationDistributions?.roomBoardPeriods?.[0]?.halfTimeStudent).toBe(false);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
