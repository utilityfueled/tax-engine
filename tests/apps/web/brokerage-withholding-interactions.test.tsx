// @vitest-environment jsdom
// Spec: spec/federal/form-1099-b-withholding.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { BrokerageWithholdingDetails } from '@/components/guided-interview/brokerage-withholding-details';
import { buildBrokerageInputs } from '@/lib/guided-interview-bridge';
import type { BrokerageEntryData } from '@/lib/guided-interview-flow';
import { completeBrokerageSource } from '../../guided-interview/complete-facts';

it('collects exact withholding and actual open-short-sale sources', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: BrokerageEntryData = { ...completeBrokerageSource, federalWithheld: '', transactions: [] };
  function Harness() { const [data, setData] = useState(latest); return <BrokerageWithholdingDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) { const input = [...element.querySelectorAll('label')].find(node => node.textContent?.includes(label))?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!input) throw new Error(`Missing ${label}`); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  async function click(text: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === text); if (!button) throw new Error(`Missing ${text}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />));
    await change('Original brokerage statement ID', 'actual-box4-source'); await change('Original brokerage tax year', '2025');
    await change('Box 4 broker federal income tax withheld', '9007199254740993.03');
    expect(buildBrokerageInputs([latest])[0]).toMatchObject({ sourceId: 'actual-box4-source', taxYear: 2025, federalWithheld: '9007199254740993.03' });
    await change('Box 4 broker federal income tax withheld', ''); expect(buildBrokerageInputs([latest])[0]?.federalWithheld).toBeUndefined();
    await change('Box 4 broker federal income tax withheld', '0'); expect(buildBrokerageInputs([latest])[0]?.federalWithheld).toBe('0');
    await click('Add withholding-only open short sale');
    expect(latest.withholdingOnlyOpenShortSale?.stillOpenAtYearEndConfirmed).toBeNull();
    await change('Original open short-sale description', 'Actual unclosed short sale'); await change('Actual short-sale opening date', '2025-03-04');
    await change('Short sale remained open at year end', 'true'); await change('Other numbered boxes are blank on the original statement', 'true');
    expect(buildBrokerageInputs([latest])[0]?.withholdingOnlyOpenShortSale).toMatchObject({ description: 'Actual unclosed short sale', openedDate: '2025-03-04', stillOpenAtYearEndConfirmed: true, otherNumberedBoxesBlankConfirmed: true });
    expect(latest.transactions).toEqual([]);
    await click('Remove open short-sale record'); expect(latest.withholdingOnlyOpenShortSale).toBeUndefined(); expect(latest.sourceId).toBe('actual-box4-source');
  } finally { await act(async () => root.unmount()); element.remove(); }
});
