// @vitest-environment jsdom
// Spec: spec/federal/cod-empty-nol-foreign.yaml guided-amt-edit.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ForeignTaxElectionDetails } from '@/components/guided-interview/foreign-tax-election-details';
import type { ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import { guidedCodEmptyNolForeignState } from '../../fixtures/guided-cod-empty-nol-foreign';

it('collects independent AMT history without copying regular balances', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedCodEmptyNolForeignState();
  let latest = structuredClone(state.sectionData['other-taxes']!.foreignTaxElection!);
  latest.deductionYearCarryover!.amt = undefined;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  function Harness() { const [data, setData] = useState<ForeignTaxElectionData>(latest); return <ForeignTaxElectionDetails data={data}
    investment={state.sectionData['income-investments']} onChange={next => { if (!next) throw new Error('Missing annual sources'); latest = next; setData(next); }} />; }
  async function click(label: string) { const control = [...container.querySelectorAll('button')].find(node => node.textContent === label);
    if (!control) throw new Error(`Missing ${label}`); await act(async () => control.click()); }
  async function change(label: string, value: string) { const control = [...container.querySelectorAll('label')]
    .find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing ${label}`); const setter = Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(control, value); control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  try {
    await act(async () => root.render(<Harness />)); await click('Add independent AMT carry history');
    expect(latest.deductionYearCarryover!.amt).toEqual({});
    await change('AMT carry source tax year', '2025'); await change('AMT balances adjusted through year', '2024');
    await change('AMT carry history source reference', 'Actual independent AMT worksheet');
    await click('Confirm no prior AMT credit balance');
    expect(latest.deductionYearCarryover!.amt?.carryovers).toEqual([]);
    expect(latest.deductionYearCarryover!.carryovers?.[0]?.amount).toBe('1000');
    await change('Complete AMT carry history checked', 'true');
    await change('AMT carry sources checked after the last edit', 'true');
    await change('Carryover worksheet sources checked after the last edit', 'true');
    await change('Foreign-tax election sources checked after the last edit', 'true');
    await click('Add prior AMT credit balance');
    expect(latest.deductionYearCarryover!.amt?.carryovers?.[0]).toEqual({});
    expect(latest.deductionYearCarryover!.amt?.sourceFactsConfirmed).toBeUndefined();
    expect(latest.deductionYearCarryover!.sourceFactsConfirmed).toBeUndefined();
    expect(latest.sourceFactsConfirmed).toBeNull();
    await change('AMT balance 1 adjusted amount', '9007199254740993.03');
    expect(latest.deductionYearCarryover!.amt?.carryovers?.[0]?.amount).toBe('9007199254740993.03');
    await click('Remove independent AMT carry history'); expect(latest.deductionYearCarryover!.amt).toBeUndefined();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
