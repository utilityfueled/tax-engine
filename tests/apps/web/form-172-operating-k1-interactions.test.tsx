// @vitest-environment jsdom
// Spec: form-172-operating-k1.yaml guided-operating-confirmation.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionAdjustments } from '@/components/guided-interview/section-adjustments';
import { updateSectionData, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { guidedOperatingK1OriginState } from '../../fixtures/guided-form-172-operating-k1';

it('confirms an actual K1 origin link through source-only adjustment controls', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedOperatingK1OriginState(), adjustment = state.sectionData.adjustments;
  if (!adjustment?.currentLossOrigin || !adjustment.k1LossSources) throw new Error('Missing fictional original sources');
  adjustment.currentLossOrigin.sourceFactsConfirmed = null;
  state.sectionData.adjustments = JSON.parse(JSON.stringify({ netOperatingLossSources: adjustment.netOperatingLossSources,
    currentLossOrigin: adjustment.currentLossOrigin, k1LossSources: adjustment.k1LossSources }));
  let latest: GuidedFlowState = state;
  const original = structuredClone(adjustment.k1LossSources), history = structuredClone(adjustment.netOperatingLossSources);
  const entity = original.activities?.[0]?.entityName;
  if (!entity) throw new Error('Missing fictional original entity');
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  function Harness() {
    const [current, setCurrent] = useState(state);
    return <SectionAdjustments data={current.sectionData.adjustments} hasSelfEmployment={false} hasStudentLoans={false} hasHsa={false}
      filingStatus="single" taxYear={2025} onDataChange={next => { latest = updateSectionData(current, 'adjustments', next); setCurrent(latest); }} />;
  }
  const field = (label: string) => [...element.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector('select');
  try {
    await act(async () => root.render(<Harness />));
    const source = field('Current business 1 source');
    expect([...source?.querySelectorAll('option') ?? []].some(option => option.value === 'scheduleK1:0' && option.textContent?.includes(entity))).toBe(true);
    expect(source?.value).toBe('scheduleK1:0'); expect(validateSection(latest, 'adjustments').status).toBe('partial');
    const confirm = field('Current loss sources checked after the last edit'); if (!confirm) throw new Error('Missing source confirmation');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(confirm, 'true'); confirm.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(validateSection(latest, 'adjustments').status).toBe('complete');
    expect(Object.keys(latest.sectionData.adjustments ?? {})).toEqual(['netOperatingLossSources', 'currentLossOrigin', 'k1LossSources']);
    expect(latest.sectionData.adjustments?.k1LossSources).toEqual(original); expect(latest.sectionData.adjustments?.netOperatingLossSources).toEqual(history);
    const select = field('Current business 1 source'); if (!select) throw new Error('Missing actual source choice');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, ''); select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(latest.sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBeNull();
    expect(latest.sectionData.adjustments?.currentLossOrigin?.businessSources?.[0]?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(latest, 'adjustments').status).toBe('partial');
    expect(latest.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBeNull();
    const stripConfirmation = (value: unknown): unknown => Array.isArray(value) ? value.map(stripConfirmation)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'sourceFactsConfirmed').map(([key, item]) => [key, stripConfirmation(item)])) : value;
    expect(stripConfirmation(latest.sectionData.adjustments?.k1LossSources)).toEqual(stripConfirmation(original));
  } finally { await act(async () => root.unmount()); element.remove(); }
});
