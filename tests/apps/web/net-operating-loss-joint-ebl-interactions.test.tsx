// @vitest-environment jsdom
// Spec: net-operating-loss-joint-ebl.yaml source-panel
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1LossSourceDetails } from '@/components/guided-interview/k1-loss-source-details';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedJointEblNolFixture } from '../../fixtures/guided-net-operating-loss-joint-ebl';

it('keeps original ownership and qualified history bound through actual controls', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedJointEblNolFixture(), before = structuredClone(state), element = document.createElement('div');
  document.body.appendChild(element); const root = createRoot(element);
  let latest: K1LossSourcesData | undefined = state.sectionData.adjustments!.k1LossSources;
  function Harness() {
    const [data, setData] = useState(latest);
    return <K1LossSourceDetails data={data} nol={state.sectionData.adjustments!.netOperatingLossSources}
      onChange={next => { latest = next; setData(next); }} />;
  }
  const preview = () => buildTaxInputFromGuidedData({ ...state,
    sectionData: { ...state.sectionData, adjustments: { ...state.sectionData.adjustments!, k1LossSources: latest } } });
  async function change(label: string, value: string) {
    const field = [...element.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)
      ?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  }
  async function confirm() {
    for (const label of [...element.querySelectorAll('.guided-field-label')].map(row => row.textContent ?? '').filter(label => label.endsWith('checked after the last edit'))) {
      await change(label, 'true');
    }
  }
  try {
    await act(async () => root.render(<Harness />)); expect(preview()).not.toBeNull();
    await change('EBL history 1 owner', 'spouse');
    await change('EBL history 1 recipient name', `${state.sectionData['personal-info']!.spouse!.firstName} ${state.sectionData['personal-info']!.spouse!.lastName}`);
    await change('EBL history 1 recipient taxpayer ID last four', state.sectionData['personal-info']!.spouse!.ssn.replaceAll('-', '').slice(-4));
    expect(latest!.sourceFactsConfirmed).toBeNull(); await confirm(); expect(preview()).toBeNull();
    await change('EBL history 1 owner', 'primary');
    await change('EBL history 1 recipient name', before.sectionData.adjustments!.k1LossSources!.excessBusinessLossHistories![0]!.recipientName!);
    await change('EBL history 1 recipient taxpayer ID last four', before.sectionData.adjustments!.k1LossSources!.excessBusinessLossHistories![0]!.recipientTaxpayerIdLast4!);
    await confirm(); expect(preview()).not.toBeNull();
    await change('EBL history 1 filed opening qualified carry', ''); await confirm(); expect(preview()).toBeNull();
    expect(latest!.excessBusinessLossHistories![0]!.qualifiedOpeningCarryforward).toBe('');
    await change('EBL history 1 filed opening qualified carry', '25000'); await confirm(); expect(preview()).not.toBeNull();
    // Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-controls
    await change('Prior ordinary QBI filed ordinary loss carry', '');
    expect(latest!.priorQbiCarry!.sourceFactsConfirmed).toBeNull(); await confirm(); expect(preview()).toBeNull();
    await change('Prior ordinary QBI filed ordinary loss carry', '0'); await confirm();
    expect(calculateFederalTax(TaxYearInputSchema.parse(preview())).carryforwards.qbiLossCarryforward.toFixed()).toBe('25000');
    await change('Prior ordinary QBI filed ordinary loss carry', '7000');
    expect(latest!.priorQbiCarry!.sourceFactsConfirmed).toBeNull(); expect(preview()).toBeNull(); await confirm();
    expect(calculateFederalTax(TaxYearInputSchema.parse(preview())).carryforwards.qbiLossCarryforward.toFixed()).toBe('32000');
    expect(latest!.excessBusinessLossHistories![0]!.originalNol).toEqual(before.sectionData.adjustments!.k1LossSources!.excessBusinessLossHistories![0]!.originalNol);
    expect(state).toEqual(before); expect(element.textContent).not.toContain('Current owner deduction');
  } finally { await act(async () => root.unmount()); element.remove(); }
});
