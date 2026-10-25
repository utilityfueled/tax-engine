// @vitest-environment jsdom
// Spec: alternative-charitable-net-operating-loss.yaml interactive-history.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { NetOperatingLossDetails } from '@/components/guided-interview/net-operating-loss-details';
import { buildGuidedNetOperatingLoss, type NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { actualGuidedNolSources } from '../../fixtures/guided-net-operating-loss';
import { completePersonalInfo } from '../../guided-interview/complete-facts';

it('collects independent charitable histories without defaulting either list', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: NetOperatingLossData | undefined = structuredClone(actualGuidedNolSources);
  function Harness() { const [data, setData] = useState(latest); return <NetOperatingLossDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(text: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === text); if (!button) throw new Error(`Missing ${text}`); await act(async () => button.click()); }
  async function change(text: string, value: string) {
    const control = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === text)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing ${text}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(control, value);
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await click('Add independent charitable carry histories');
    expect(latest?.alternativeTax?.charitableCarryoverHistory?.priorRegularCarryovers).toBeUndefined();
    expect(latest?.alternativeTax?.charitableCarryoverHistory?.priorAlternativeCarryovers).toBeUndefined();
    await click('Record no prior regular charitable carryovers');
    expect(latest?.alternativeTax?.charitableCarryoverHistory?.priorAlternativeCarryovers).toBeUndefined();
    await click('Record no prior AMT charitable carryovers');
    await change('Charitable histories source tax year', '2024'); await change('Charitable histories source reference', 'Actual separate filed histories');
    await change('All prior regular and AMT charitable carryovers included', 'true');
    await change('Charitable carry histories checked after the last edit', 'true');
    await change('AMT NOL sources checked after the last edit', 'true'); await change('Regular NOL sources checked after the last edit', 'true');
    const built = buildGuidedNetOperatingLoss(latest, 2025, 'single', completePersonalInfo);
    expect(built?.alternativeTax?.charitableCarryoverHistory?.priorRegularCarryovers).toEqual([]);
    expect(built?.alternativeTax?.charitableCarryoverHistory?.priorAlternativeCarryovers).toEqual([]);
    await click('Add prior AMT charitable carryover');
    await change('AMT charitable carry 1 amount', '9007199254740993');
    expect(latest?.alternativeTax?.charitableCarryoverHistory?.priorAlternativeCarryovers?.[0]?.amount).toBe('9007199254740993');
    expect(latest?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBeNull();
    expect(latest?.alternativeTax?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
    await click('Remove AMT charitable carry 1');
    await click('Remove independent charitable carry histories');
    expect(latest?.alternativeTax?.charitableCarryoverHistory).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
