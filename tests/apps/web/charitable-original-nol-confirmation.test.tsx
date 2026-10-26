// @vitest-environment jsdom
// Spec: spec/federal/charitable-original-source-nol.yaml confirmation-only.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionAdjustments } from '@/components/guided-interview/section-adjustments';
import { updateSectionData, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { guidedOriginalCharitableNolState } from '../../fixtures/guided-charitable-original-source-nol';

it('confirms a source-only NOL section without changing the linked original K1 facts', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedOriginalCharitableNolState(), loss = state.sectionData.adjustments?.netOperatingLossSources;
  if (!loss?.alternativeTax?.charitableCarryoverHistory) throw new Error('Missing fictional source history');
  // Restore the actual shape of older/source-only saved sections.
  loss.sourceFactsConfirmed = null;
  state.sectionData.adjustments = JSON.parse(JSON.stringify({ netOperatingLossSources: loss }));
  let latest: GuidedFlowState = state;
  const originalCharity = structuredClone(state.sectionData.deductions?.k1CharitableSources);
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  function Harness() {
    const [current, setCurrent] = useState(state);
    return <SectionAdjustments data={current.sectionData.adjustments} hasSelfEmployment={false} hasStudentLoans={false} hasHsa={false}
      filingStatus="single" taxYear={2025} onDataChange={next => { latest = updateSectionData(current, 'adjustments', next); setCurrent(latest); }} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const select = [...element.querySelectorAll('label')].find(label => label.querySelector('.guided-field-label')?.textContent === 'Regular NOL sources checked after the last edit')?.querySelector('select');
    if (!select) throw new Error('Missing NOL confirmation');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'true'); select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(Object.keys(latest.sectionData.adjustments ?? {})).toEqual(['netOperatingLossSources']);
    expect(latest.sectionData.adjustments?.netOperatingLossSources?.sourceFactsConfirmed).toBe(true);
    expect(latest.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBe(true);
    expect(latest.sectionData.deductions?.k1CharitableSources).toEqual(originalCharity);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
