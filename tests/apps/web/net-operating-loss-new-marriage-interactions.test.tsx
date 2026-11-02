// @vitest-environment jsdom
// Spec: net-operating-loss-new-marriage.yaml source-guide.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { NetOperatingLossDetails } from '@/components/guided-interview/net-operating-loss-details';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { guidedNewMarriageNolFixture } from '../../fixtures/guided-net-operating-loss-new-marriage';
it('edits actual owner expenses and marital facts without an allowance input', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: NetOperatingLossData = guidedNewMarriageNolFixture().sectionData.adjustments!.netOperatingLossSources!;
  function Harness() { const [data, setData] = useState(latest); return <NetOperatingLossDetails data={data} onChange={next => { if (!next) throw new Error('Unexpected removal'); latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  async function click(text: string) { const button = [...element.querySelectorAll('button')].find(item => item.textContent === text); if (!button) throw new Error(`Missing ${text}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />));
    await change('Regular NOL new-marriage marital year 1 married to each other', ''); expect(latest.newMarriageHistory?.years?.[0]?.marriedToEachOther).toBeNull();
    await change('Regular NOL new-marriage marital year 1 married to each other', 'false'); expect(latest.newMarriageHistory?.years?.[0]?.marriedToEachOther).toBe(false);
    await click('Add actual owner expense split');
    await change('Current owner expense 1 source group', 'scheduleA'); await change('Current owner expense 1 actual source amount', 'medicalExpenses');
    await change('Current owner expense 1 primary raw amount', '100.25'); await change('Current owner expense 1 spouse raw amount', '0');
    await change('Current owner expense 1 source reference', 'Actual medical receipt');
    expect(latest.currentOwnerSources?.expenseAllocations?.[0]).toMatchObject({ kind: 'scheduleA', field: 'medicalExpenses', primaryAmount: '100.25', spouseAmount: '0', sourceReference: 'Actual medical receipt' });
    expect(latest.currentOwnerSources?.sourceFactsConfirmed).toBeNull(); expect(latest.alternativeTax?.newMarriageHistory?.sourceFactsConfirmed).toBeNull();
    await click('Remove Current owner expense 1'); expect(latest.currentOwnerSources?.expenseAllocations).toEqual([]);
    await change('Community property applies to these current sources', 'false'); expect(latest.currentOwnerSources?.communityPropertyApplies).toBe(false);
    const labels = [...element.querySelectorAll('.guided-field-label')].map(node => node.textContent ?? '');
    expect(labels.some(label => /current.*(allowance|taxable income|closing carry)/i.test(label))).toBe(false);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
