// @vitest-environment jsdom
// Spec: spec/federal/marketplace-business-credit-method.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { HealthInsuranceSourceDetails } from '@/components/guided-interview/health-insurance-source-details';
import type { HealthInsuranceData } from '@/lib/guided-health-insurance-facts';
import { guidedCoverageFamilyHealthState } from '../../fixtures/guided-coverage-family-health';

it('collects the actual allocation choice without filling or retaining stale answers', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedCoverageFamilyHealthState(), original = state.sectionData.adjustments!.healthInsuranceFacts!;
  let latest = structuredClone(original);
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  function Harness() { const [data, setData] = useState(latest); return <HealthInsuranceSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  function control(label: string) {
    const element = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!element) throw new Error(`Missing ${label}`); return element;
  }
  async function set(label: string, value: string) { const field = control(label); await act(async () => { Object.getOwnPropertyDescriptor(field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); }); }
  try {
    await act(async () => root.render(<Harness />));
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === 'Add recorded Marketplace credit allocation method');
    expect(button).toBeDefined(); await act(async () => button!.click());
    expect(control('Credit allocation method').value).toBe(''); expect(control('Credit allocation source tax year').value).toBe('');
    expect(control('Credit allocation source reference').value).toBe(''); expect(control('Same method used for every calculation').value).toBe('');
    expect(latest.plans.map(plan => plan.payments)).toEqual(original.plans.map(plan => plan.payments));
    await set('Credit allocation source tax year','2025'); await set('Credit allocation source reference','Actual recorded method');
    await set('Credit allocation method','monthly_eligible_plan_enrollment'); await set('Same method used for every calculation','true');
    await set('Credit allocation choice checked after the last edit','true');
    expect((latest as HealthInsuranceData & { marketplaceCreditAllocation: { sourceFactsConfirmed: boolean | null } }).marketplaceCreditAllocation.sourceFactsConfirmed).toBe(true);
    await set('Plan 1 payment 1: Payment source label','Changed actual receipt');
    expect((latest as HealthInsuranceData & { marketplaceCreditAllocation: { sourceFactsConfirmed: boolean | null } }).marketplaceCreditAllocation.sourceFactsConfirmed).toBeNull();
    expect(latest.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
