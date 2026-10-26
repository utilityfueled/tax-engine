// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-room-board-prior-use.yaml actual-panel.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EducationDistributionDetails } from '@/components/guided-interview/education-distribution-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedRoomBoardPriorUse } from '../../fixtures/guided-room-board-prior-use';
it('edits actual cross-year history through the education panel', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = actualGuidedRoomBoardPriorUse(), container = document.createElement('div'); document.body.appendChild(container);
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
    await change('Complete prior use of this academic-period allowance checked', 'true');
    await change('Actual academic-period records checked', 'true');
    await change('Receipt and period link checked', 'true', 0); await change('Receipt and period link checked', 'true', 1);
    await change('Actual prior worksheet checked', 'true'); await change('Actual prior receipt checked', 'true');
    await change('All education sources and allocations checked after the last edit', 'true');
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(fields('Prior worksheet academic period').map(f => f.value)).toEqual(['fall']);
    expect(fields('Prior receipt worksheet').map(f => f.value)).toEqual(['prior-worksheet']);
    expect(container.querySelector('output')?.textContent).toBe('51800');
    await change('Prior receipt original amount', '4000');
    expect(latest.sectionData.credits?.educationDistributions?.roomBoardPriorUses?.[0]?.sourceFactsConfirmed).toBeNull();
    await confirm(); expect(container.querySelector('output')?.textContent).toBe('pending');
    await change('Prior worksheet qualified cost before assistance', '4000'); await change('Prior worksheet adjusted qualified expenses', '3000');
    await confirm(); expect(container.querySelector('output')?.textContent).toBe('51600');
    await change('Prior receipt actual refund (0 if none)', ''); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    await change('Prior receipt actual refund (0 if none)', '0'); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('51600');
    await change('Prior worksheet unchanged after filing', 'false'); await confirm();
    expect(container.querySelector('output')?.textContent).toBe('pending');
    expect(latest.sectionData.credits?.educationDistributions?.roomBoardPriorUses?.[0]?.noPostFilingChangesConfirmed).toBe(false);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
