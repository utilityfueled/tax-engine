// @vitest-environment jsdom
// Spec: net-operating-loss-filing-unit-history.yaml source-guide
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { NetOperatingLossDetails } from '@/components/guided-interview/net-operating-loss-details';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { guidedChangedNolFixture } from '../../fixtures/guided-net-operating-loss-filing-unit';

it('edits actual owner worksheets and preserves separate unknown and zero facts', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: NetOperatingLossData = guidedChangedNolFixture().sectionData.adjustments!.netOperatingLossSources!;
  function Harness() { const [data, setData] = useState(latest); return <NetOperatingLossDetails data={data} onChange={next => { if (!next) throw new Error('Unexpected removal'); latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await change('Regular loss 1 original joint or separate return NOL', '100001');
    expect(latest.vintages![0]!.filingUnitOrigin!.originalReturnLoss).toBe('100001');
    expect(latest.filingUnitHistory!.sourceFactsConfirmed).toBeNull();
    expect(latest.alternativeTax!.filingUnitHistory!.sourceFactsConfirmed).toBeNull();
    await change('Regular loss 1 history 1 filed use 1 owner 1 modified absorption', '0');
    expect(latest.vintages![0]!.history![0]!.filingUnitUses![0]!.owners![0]!.modifiedAbsorption).toBe('0');
    await change('Regular loss 1 history 1 filed use 1 owner 1 modified absorption', '');
    expect(latest.vintages![0]!.history![0]!.filingUnitUses![0]!.owners![0]!.modifiedAbsorption).toBe('');
    expect(latest.alternativeTax!.vintages![0]!.originalLoss).toBe('20000');
    await change('Regular loss 1 history 1 filed use 1 all original owners included', 'false');
    expect(latest.vintages![0]!.history![0]!.filingUnitUses![0]!.allOriginOwnersIncluded).toBe(false);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
