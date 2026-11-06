// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1LossSourceDetails } from '@/components/guided-interview/k1-loss-source-details';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { guidedOrdinaryPriorQbiFixture } from '../../fixtures/guided-prior-qbi-ordinary';

// Spec: qbi-prior-carry-sources.yaml source-panel
it('collects the direct prior return and retains source invalidation', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedOrdinaryPriorQbiFixture(), initial = state.sectionData.adjustments!.k1LossSources!;
  const initialRecord = structuredClone(initial.priorQbiCarry!); delete initial.priorQbiCarry;
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  let latest: K1LossSourcesData | undefined = initial;
  function Harness() {
    const [data, setData] = useState(latest);
    return <K1LossSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />;
  }
  const input = () => buildTaxInputFromGuidedData({ ...state, sectionData: { ...state.sectionData,
    adjustments: { ...state.sectionData.adjustments!, k1LossSources: latest } } });
  async function click(text: string) {
    const control = [...host.querySelectorAll('button')].find(row => row.textContent === text);
    if (!control) throw new Error(`Missing actual source control ${text}`);
    await act(async () => control.click());
  }
  async function change(label: string, value: string) {
    const control = [...host.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)
      ?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing actual source field ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(control, value);
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  }
  async function confirm() {
    for (const label of [...host.querySelectorAll('.guided-field-label')].map(row => row.textContent ?? '').filter(text => text.endsWith('checked after the last edit'))) {
      await change(label, 'true');
    }
  }
  await act(async () => root.render(<Harness />));
  try {
    expect(input()).toBeNull();
    await click('Add prior ordinary QBI carry record');
    await click('Use a prior return without NOL history');
    expect(latest!.priorQbiCarry!.lossCarryforward).toBeUndefined();
    for (const [label, value] of [
      ['source year', '2024'], ['source reference', initialRecord.sourceReference!],
      ['original preceding-year return', initialRecord.returnSourceId!], ['actual record', 'form_8995_line_16'],
      ['prior return primary name', initialRecord.primaryName!], ['prior primary taxpayer ID last four', initialRecord.primaryTaxpayerIdLast4!],
      ['prior return spouse name', initialRecord.spouseName!], ['prior spouse taxpayer ID last four', initialRecord.spouseTaxpayerIdLast4!],
      ['filed ordinary loss carry', '7000'],
    ]) await change(`Prior ordinary QBI ${label}`, value);
    await change('Prior ordinary QBI actual prior filing status', 'married_filing_jointly');
    await change('Prior ordinary QBI same taxpayers on the prior and current returns', 'true');
    await confirm(); expect(input()!.priorYear!.qbiLossCarryforward).toBe('7000');
    expect(input()!.netOperatingLoss).toBeUndefined(); expect(input()!.priorYear!.activeQbiLossCarryforward).toBeUndefined();
    await change('Prior ordinary QBI filed ordinary loss carry', '');
    expect(latest!.priorQbiCarry!.sourceFactsConfirmed).toBeNull(); expect(input()).toBeNull();
    await change('Prior ordinary QBI filed ordinary loss carry', '0'); await confirm();
    expect(input()!.priorYear!.qbiLossCarryforward).toBe('0');
    await change('Prior ordinary QBI actual prior filing status', 'single'); await confirm(); expect(input()).toBeNull();
    await change('Prior ordinary QBI actual prior filing status', 'married_filing_jointly');
    await change('Prior ordinary QBI same taxpayers on the prior and current returns', 'false'); await confirm(); expect(input()).toBeNull();
    await change('Prior ordinary QBI same taxpayers on the prior and current returns', 'true'); await confirm(); expect(input()).not.toBeNull();
    await click('Remove prior ordinary QBI carry record'); expect(input()).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
