// @vitest-environment jsdom
// Spec: spec/federal/guided-net-operating-loss.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { NetOperatingLossDetails } from '@/components/guided-interview/net-operating-loss-details';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
it('collects independent carry histories without guessed balances or confirmations', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: NetOperatingLossData | undefined;
  function Harness() { const [data, setData] = useState(latest); return <NetOperatingLossDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) { const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!input) throw new Error(`Missing ${label}`); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  try {
    await act(async () => root.render(<Harness />)); await click('Add actual NOL carry sources'); expect(latest).toEqual({});
    await click('Add regular loss vintage'); expect(latest?.vintages).toEqual([{}]); expect(latest?.alternativeTax).toBeUndefined();
    await change('Regular loss 1 original filed loss', '9007199254740993'); await change('Regular loss 1 opening carryforward', '0');
    await change('Regular loss 1 originating Section 1411 loss', '0'); await click('Add Regular loss 1 prior-use record');
    expect(latest?.vintages?.[0]?.history).toEqual([{}]); await change('Regular loss 1 history 1 NOL used', '0');
    expect(latest?.vintages?.[0]?.history?.[0]?.attributeReduction).toBeUndefined();
    await change('Regular loss 1 history 1 attribute reduction', '0'); await change('Regular loss 1 history 1 tax year', '2024');
    await change('Regular loss 1 history 1 source reference', 'Actual prior filed worksheet');
    await click('Add independent AMT carry sources'); expect(latest?.alternativeTax?.vintages).toBeUndefined();
    await click('Record no amt loss vintages'); expect(latest?.alternativeTax?.vintages).toEqual([]);
    await change('AMT NOL sources checked after the last edit', 'true'); await change('Regular NOL sources checked after the last edit', 'true');
    expect(latest?.sourceFactsConfirmed).toBe(true); expect(latest?.alternativeTax?.sourceFactsConfirmed).toBe(true);
    await change('Regular loss 1 originating character', 'excess_business_loss');
    expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.alternativeTax?.sourceFactsConfirmed).toBeNull();
    expect(latest?.vintages?.[0]?.originalLoss).toBe('9007199254740993');
    await change('Regular loss 1 opening carryforward', ''); expect(latest?.vintages?.[0]?.openingCarryforward).toBe('');
    await click('Remove Regular loss 1 history 1'); expect(latest?.vintages?.[0]?.history).toEqual([]);
    await click('Add amt loss vintage'); expect(latest?.alternativeTax?.vintages).toEqual([{}]);
    await change('AMT loss 1 original filed loss', '42'); await click('Remove AMT loss 1'); expect(latest?.alternativeTax?.vintages).toEqual([]);
    await click('Remove AMT carry sources'); expect(latest?.alternativeTax).toBeUndefined();
    await click('Remove Regular loss 1'); expect(latest?.vintages).toEqual([]);
    await click('Remove NOL carry source packet'); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
