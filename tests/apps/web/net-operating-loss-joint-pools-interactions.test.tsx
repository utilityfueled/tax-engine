// @vitest-environment jsdom
// Spec: net-operating-loss-joint-pools.yaml source-panel
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { NetOperatingLossDetails } from '@/components/guided-interview/net-operating-loss-details';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { guidedJointNolFixture } from '../../fixtures/guided-net-operating-loss-joint-pools';

it('edits actual marital years and original owners without a calculated allowance field', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: NetOperatingLossData = guidedJointNolFixture().sectionData.adjustments!.netOperatingLossSources!;
  function Harness() { const [data, setData] = useState(latest); return <NetOperatingLossDetails data={data} onChange={next => { if (!next) throw new Error('Unexpected removal'); latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  async function click(text: string) {
    const button = [...element.querySelectorAll('button')].find(item => item.textContent === text);
    if (!button) throw new Error(`Missing ${text}`); await act(async () => button.click());
  }
  try {
    await act(async () => root.render(<Harness />));
    await change('Regular loss 1 original carry owner', 'alex'); expect(latest.vintages![0]!.filingUnitOrigin!.ownerPersonId).toBe('alex');
    expect(latest.sameCoupleJointHistory!.sourceFactsConfirmed).toBeNull(); expect(latest.alternativeTax!.sameCoupleJointHistory!.sourceFactsConfirmed).toBeNull();
    await change('Regular NOL marital year 1 married to each other', 'false'); expect(latest.sameCoupleJointHistory!.years![0]!.marriedToEachOther).toBe(false);
    await change('Regular NOL marital year 1 married to each other', ''); expect(latest.sameCoupleJointHistory!.years![0]!.marriedToEachOther).toBeNull();
    await click('Add marital year for Regular NOL'); expect(latest.sameCoupleJointHistory!.years).toHaveLength(6);
    await change('Regular NOL marital year 6 tax year', '2020'); expect(latest.sameCoupleJointHistory!.years![5]!.taxYear).toBe('2020');
    await click('Remove Regular NOL marital year 6'); expect(latest.sameCoupleJointHistory!.years).toHaveLength(5);
    await click('Mark marital years unknown for Regular NOL'); expect(latest.sameCoupleJointHistory!.years).toBeUndefined();
    expect(latest.vintages![0]!.history![0]!.nolUsed).toBe('10000'); expect(latest.alternativeTax!.sameCoupleJointHistory!.years).toHaveLength(5);
    expect(element.textContent).not.toContain('Current owner deduction');
  } finally { await act(async () => root.unmount()); element.remove(); }
});
