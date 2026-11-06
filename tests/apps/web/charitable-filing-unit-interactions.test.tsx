// @vitest-environment jsdom
// Spec: spec/federal/charitable-filing-unit-history.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CharitableCarryoverDetails } from '@/components/guided-interview/charitable-carryover-details';
import type { CharitableCarryoverData } from '@/lib/guided-charitable-carryover';

it('edits actual charitable filing units without default identity or money', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: CharitableCarryoverData | undefined;
  function Harness() { const [data, setData] = useState(latest); return <CharitableCarryoverDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) {
    const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
    if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click());
  }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click('Add charitable carryover sources');
    await change('Charitable carryover return membership', 'changed_filing_unit');
    await click('Add original filing-unit timeline');
    expect(latest?.filingUnitHistory?.persons).toBeUndefined();
    await click('Add actual person'); expect(latest?.filingUnitHistory?.persons).toEqual([{}]);
    await change('Person 1 source ID', 'original-person');
    await change('Person 1 name on the original return', 'Fictional Individual');
    await change('Person 1 death status', 'deceased');
    expect(latest?.filingUnitHistory?.persons?.[0].deathYear).toBeUndefined();
    await change('Person 1 actual death year', '2024');
    await click('Add actual filed return'); expect(latest?.filingUnitHistory?.returns).toEqual([{}]);
    await change('Return 1 source ID', 'actual-return'); await change('Return 1 tax year', '2023');
    await change('Return 1 primary person', 'original-person');
    await click('Add original contribution history');
    await change('Contribution 1 original filed return', 'actual-return');
    await click('Add separate original computation for contribution 1');
    await change('Contribution 1 separate computation 1 original excess', '12000.01');
    await change('Contribution 1 separate computation 1 origin NOL reduction', '0');
    expect(latest?.vintages?.[0].filingUnitOrigin?.separateComputations?.[0].ordinaryPercentageMethodConfirmed).toBeUndefined();
    await click('Add intervening year for contribution 1');
    await click('Add filed use for contribution 1 history 1');
    await change('Contribution 1 history 1 filed use 1 amount treated as paid', '0');
    expect(latest?.vintages?.[0].history?.[0].filingUnitUses?.[0].nolReduction).toBeUndefined();
    await change('All original carryovers feeding these joint histories are included', 'false');
    expect(latest?.filingUnitHistory?.allRelevantCarryoversIncluded).toBe(false);
    await change('Filing-unit sources checked after the last edit', 'true');
    await change('Charitable carryover sources checked after the last edit', 'true');
    expect(latest?.filingUnitHistory?.sourceFactsConfirmed).toBe(true);
    await change('Person 1 actual death year', '2025');
    expect(latest?.filingUnitHistory?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change('Charitable carryover return membership', 'continuous_individual');
    expect(latest?.filingUnitHistory?.persons?.[0].deathYear).toBe('2025');
    await change('Charitable carryover return membership', 'changed_filing_unit');
    await click('Remove filed use 1 from contribution 1 history 1');
    expect(latest?.vintages?.[0].history?.[0].filingUnitUses).toEqual([]);
    await click('Remove actual person 1'); expect(latest?.filingUnitHistory?.persons).toEqual([]);
    expect(element.querySelector('input[type="number"]')).toBeNull(); expect(latest).not.toHaveProperty('deduction');
  } finally { await act(async () => root.unmount()); element.remove(); }
});
