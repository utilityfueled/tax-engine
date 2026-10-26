// @vitest-environment jsdom
// Spec: spec/federal/form-172-charitable-origin.yaml source-only-confirmation.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionAdjustments } from '@/components/guided-interview/section-adjustments';
import { updateSectionData, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { guidedCurrentCharitableOriginState } from '../../fixtures/guided-form-172-charitable-origin';

it('confirms current origin sources without replacing independent charity history', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedCurrentCharitableOriginState(), adjustment = state.sectionData.adjustments;
  if (!adjustment?.currentLossOrigin || !adjustment.netOperatingLossSources) throw new Error('Missing fictional current and prior sources');
  adjustment.currentLossOrigin.sourceFactsConfirmed = null;
  state.sectionData.adjustments = JSON.parse(JSON.stringify({ netOperatingLossSources: adjustment.netOperatingLossSources,
    currentLossOrigin: adjustment.currentLossOrigin }));
  let latest: GuidedFlowState = state;
  const originalHistory = structuredClone(adjustment.netOperatingLossSources), originalReceipts = structuredClone(state.sectionData.deductions);
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  function Harness() {
    const [current, setCurrent] = useState(state);
    return <SectionAdjustments data={current.sectionData.adjustments} hasSelfEmployment hasStudentLoans={false} hasHsa={false}
      filingStatus="single" taxYear={2025} onDataChange={next => { latest = updateSectionData(current, 'adjustments', next); setCurrent(latest); }} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const select = [...element.querySelectorAll('label')].find(label => label.querySelector('.guided-field-label')?.textContent === 'Current loss sources checked after the last edit')?.querySelector('select');
    if (!select) throw new Error('Missing current source confirmation');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'true'); select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(Object.keys(latest.sectionData.adjustments ?? {})).toEqual(['netOperatingLossSources', 'currentLossOrigin']);
    expect(latest.sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBe(true);
    expect(latest.sectionData.adjustments?.netOperatingLossSources).toEqual(originalHistory);
    expect(latest.sectionData.deductions).toEqual(originalReceipts);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
