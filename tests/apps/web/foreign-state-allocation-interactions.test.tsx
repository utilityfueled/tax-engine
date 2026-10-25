// @vitest-environment jsdom
// Spec: spec/federal/foreign-tax-state-allocation.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ForeignTaxElectionDetails } from '@/components/guided-interview/foreign-tax-election-details';
import { buildGuidedForeignTaxElection, type ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import { guidedCarryoverFixture } from '../../fixtures/guided-foreign-tax-carryover';

it('collects actual country source amounts and revokes confirmation', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  const fixture = guidedCarryoverFixture(); let latest: ForeignTaxElectionData | undefined = fixture.facts;
  function Harness() { const [data, setData] = useState(latest); return <ForeignTaxElectionDetails data={data} investment={fixture.investment} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) {
    const control = [...container.querySelectorAll('button')].find(node => node.textContent === label);
    if (!control) throw new Error(`Missing ${label}`); await act(async () => control.click());
  }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing setter');
    await act(async () => { setter.call(control, value); control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  const state = () => latest?.deductionYearCarryover?.itemizedAllocation?.stateIncomeTaxes?.[0];
  try {
    await act(async () => root.render(<Harness />)); await click('Add itemized deduction allocation');
    await change('Itemized allocation source reference', 'Actual allowed deductions');
    await change('Allowed income or sales taxes', '6000'); await change('Allowed personal-home real estate taxes', '0'); await change('Allowed personal property taxes', '0');
    await click('Add state income-tax allocation'); await change('State allocation 1 state code', 'NY');
    await change('State allocation 1 deductible tax', '6000'); await change('State allocation 1 actual taxable income', '90000');
    await change('State allocation 1 specifically exempts foreign income', 'false'); await change('State allocation 1 source reference', 'Actual state worksheet');
    await click('Add state allocation 1 country');
    expect(state()?.countryIncome?.[0]).toEqual({}); expect(state()?.countryIncomeConfirmed).toBeUndefined();
    await change('State allocation 1 country 1 name', 'Canada'); await change('State allocation 1 country 1 taxable income', '3500.25');
    await change('State allocation 1 country 1 source reference', 'Actual country worksheet');
    for (const label of ['State allocation 1 country sources checked after the last edit', 'Itemized allocation sources checked after the last edit', 'Carryover worksheet sources checked after the last edit', 'Foreign-tax election sources checked after the last edit']) await change(label, 'true');
    expect(buildGuidedForeignTaxElection(latest, fixture.investment, 2025, 'single')?.deductionYearCarryover?.itemizedAllocation?.stateIncomeTaxes?.[0].countryIncome?.[0].stateTaxableIncome).toBe('3500.25');
    await change('State allocation 1 country 1 taxable income', '3500.26');
    expect(state()?.countryIncome?.[0].stateTaxableIncome).toBe('3500.26'); expect(state()?.countryIncomeConfirmed).toBeUndefined();
    expect(latest?.deductionYearCarryover?.itemizedAllocation?.sourceFactsConfirmed).toBeUndefined();
    expect(latest?.deductionYearCarryover?.sourceFactsConfirmed).toBeUndefined(); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change('State allocation 1 country sources checked after the last edit', 'true');
    await change('State allocation 1 actual taxable income', '90000.01'); expect(state()?.countryIncomeConfirmed).toBeUndefined();
    await change('State allocation 1 country sources checked after the last edit', 'true');
    await change('Income 1 actual foreign ordinary amount', '4999'); expect(state()?.countryIncomeConfirmed).toBeUndefined();
    await click('Remove state allocation 1 country 1'); expect(state()?.countryIncome).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
