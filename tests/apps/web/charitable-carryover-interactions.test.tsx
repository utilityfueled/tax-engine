// @vitest-environment jsdom
// Spec: spec/federal/guided-charitable-carryover.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CharitableCarryoverDetails } from '@/components/guided-interview/charitable-carryover-details';
import type { CharitableCarryoverData } from '@/lib/guided-charitable-carryover';

it('collects original charitable history without default years or balances', async () => {
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
    await act(async () => root.render(<Harness />)); await click('Add charitable carryover sources'); expect(latest).toEqual({});
    await click('Add original contribution history'); expect(latest?.vintages).toEqual([{}]);
    await change('Contribution 1 original source ID', 'Actual private origin-A');
    await change('Contribution 1 original excess', '1000.10'); await change('Contribution 1 origin NOL reduction', '0');
    await change('Contribution 1 ordinary percentage method confirmed', 'false');
    expect(latest?.vintages?.[0].originNolReduction).toBe('0'); expect(latest?.vintages?.[0].ordinaryPercentageMethodConfirmed).toBe(false);
    await change('Contribution 1 original percentage category', 'conservation_50');
    expect(latest?.vintages?.[0].category).toBe('conservation_50');
    await click('Add intervening year for contribution 1'); expect(latest?.vintages?.[0].history).toEqual([{}]);
    await change('Contribution 1 history 1 tax year', '2024'); await change('Contribution 1 history 1 treated as paid', '0');
    expect(latest?.vintages?.[0].history?.[0].nolReduction).toBeUndefined();
    await change('Charitable carryover sources checked after the last edit', 'true'); expect(latest?.sourceFactsConfirmed).toBe(true);
    await change('Contribution 1 history 1 treated as paid', '0.01'); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change('Contribution 1 ordinary percentage method confirmed', ''); expect(latest?.vintages?.[0].ordinaryPercentageMethodConfirmed).toBeNull();
    await click('Record no intervening years for contribution 1'); expect(latest?.vintages?.[0].history).toEqual([]);
    await click('Record no prior charitable carryovers'); expect(latest?.vintages).toEqual([]);
    expect(element.querySelector('input[type="number"]')).toBeNull(); expect(latest).not.toHaveProperty('deduction');
    await click('Remove charitable carryover sources'); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
