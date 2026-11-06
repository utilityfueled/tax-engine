// @vitest-environment jsdom
// Spec: form-172-charitable-carried-composition.yaml source-confirmation.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionAdjustments } from '@/components/guided-interview/section-adjustments';
import { updateSectionData, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { guidedCarriedCurrentCharitableHistories } from '../../fixtures/guided-form-172-charitable-carried-composition';

it('confirms current origin while preserving both original old loss histories', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedCarriedCurrentCharitableHistories(), adjustment = state.sectionData.adjustments;
  if (!adjustment?.currentLossOrigin || !adjustment.netOperatingLossSources) throw new Error('Missing fictional actual sources');
  adjustment.currentLossOrigin.sourceFactsConfirmed = null;
  state.sectionData.adjustments = JSON.parse(JSON.stringify({ netOperatingLossSources: adjustment.netOperatingLossSources,
    currentLossOrigin: adjustment.currentLossOrigin }));
  let latest: GuidedFlowState = state;
  const history = structuredClone(adjustment.netOperatingLossSources), receipts = structuredClone(state.sectionData.deductions);
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  function Harness() {
    const [current, setCurrent] = useState(state);
    return <SectionAdjustments data={current.sectionData.adjustments} hasSelfEmployment hasStudentLoans={false} hasHsa={false}
      filingStatus="single" taxYear={2025} onDataChange={next => { latest = updateSectionData(current, 'adjustments', next); setCurrent(latest); }} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(element.textContent).toContain('Old loss use and charitable carry are calculated before adding any new current loss');
    expect(element.textContent).toContain('Complete current receipts and prior histories can use the supported category and NOL comparisons');
    expect(validateSection(latest, 'adjustments').status).toBe('partial');
    const select = [...element.querySelectorAll('label')].find(label => label.querySelector('.guided-field-label')?.textContent === 'Current loss sources checked after the last edit')?.querySelector('select');
    if (!select) throw new Error('Missing current source confirmation');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'true'); select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(validateSection(latest, 'adjustments').status).toBe('complete');
    expect(Object.keys(latest.sectionData.adjustments ?? {})).toEqual(['netOperatingLossSources', 'currentLossOrigin']);
    expect(latest.sectionData.adjustments?.netOperatingLossSources).toEqual(history);
    expect(latest.sectionData.deductions).toEqual(receipts);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
