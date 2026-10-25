// @vitest-environment jsdom
// Spec: spec/federal/guided-vehicle-refinancing.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { Schedule1ASourceDetails } from '@/components/guided-interview/schedule-1-a-source-details';
import type { Schedule1AData } from '@/lib/guided-schedule-1-a-facts';
import { guidedVehicleRefinancingFixture } from '../../fixtures/guided-vehicle-refinancing';

it('collects actual refinancing records and clears confirmation on edits', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  const fixture = guidedVehicleRefinancingFixture().data; const loan = fixture.vehicleLoans[0]; if (!loan) throw new Error('Missing source'); loan.refinancingSources = undefined;
  let latest: Schedule1AData | undefined = fixture;
  function Harness() { const [data, setData] = useState(latest); return <Schedule1ASourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  const prefix = 'Vehicle loan 1 refinancing';
  try {
    await act(async () => root.render(<Harness />));
    await click(`${prefix}: Add original and refinancing records`);
    expect(latest?.vehicleLoans[0]?.refinancingSources).toEqual({});
    await click(`${prefix}: Add original purchase loan`);
    expect(latest?.vehicleLoans[0]?.refinancingSources?.originalLoan).toEqual({});
    await change(`${prefix} original: Down payment`, '0');
    await change(`${prefix} original: First lien`, 'false');
    await change(`${prefix} original: Current-year interest paid`, '9007199254740993.01');
    await click(`${prefix}: Add refinancing loan`);
    expect(latest?.vehicleLoans[0]?.refinancingSources?.refinancings?.[0]).toEqual({});
    await change(`${prefix} refinance 1: Previous loan source ID`, 'purchase');
    await change(`${prefix} refinance 1: Previous outstanding principal`, '20000.10');
    await change(`${prefix}: Sources checked after the last edit`, 'true');
    await change('Additional deductions: Sources checked after the last edit', 'true');
    expect(latest?.vehicleLoans[0]?.refinancingSources?.sourceFactsConfirmed).toBe(true);
    expect(latest?.sourceFactsConfirmed).toBe(true);
    await change(`${prefix} original: Down payment`, '0.01');
    expect(latest?.vehicleLoans[0]?.refinancingSources?.sourceFactsConfirmed).toBeNull();
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.vehicleLoans[0]?.refinancingSources?.originalLoan).toMatchObject({ firstLien: false, interestPaid: '9007199254740993.01' });
    await change(`${prefix} original: First lien`, ''); await change(`${prefix} original: Down payment`, '');
    expect(latest?.vehicleLoans[0]?.refinancingSources?.originalLoan).toMatchObject({ firstLien: null, downPayment: '' });
    await change('Vehicle loan 1: Refinanced loan', 'false');
    expect(latest?.vehicleLoans[0]?.refinancingSources?.refinancings?.[0]?.previousOutstandingPrincipal).toBe('20000.10');
    await click(`${prefix}: Remove refinancing loan 1`); expect(latest?.vehicleLoans[0]?.refinancingSources?.refinancings).toEqual([]);
    await click(`${prefix}: Remove original and refinancing records`); expect(latest?.vehicleLoans[0]?.refinancingSources).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
