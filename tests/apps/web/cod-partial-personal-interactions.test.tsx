// @vitest-environment jsdom
// Spec: spec/federal/cod-partial-personal-insolvency.yaml guide.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CodNolDetails } from '@/components/guided-interview/cod-nol-details';
import type { CodNolData } from '@/lib/guided-cod-nol';

it('collects actual personal debt records without inventing unknown answers', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: CodNolData = { debts: [{}] };
  function Harness() { const [data, setData] = useState(latest); return <CodNolDetails data={data} onChange={next => { latest = next ?? {}; setData(latest); }} />; }
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
    await act(async () => root.render(<Harness />));
    expect(latest.debts![0]!.personalDebt).toBeUndefined();
    await click('Add debt 1 personal borrowing records');
    expect(latest.debts![0]!.personalDebt!.actualDischargedAmount).toBeUndefined();
    expect(latest.debts![0]!.personalDebt!.interestTreatment).toBeUndefined();
    await change('Debt 1 use of borrowed funds', 'personal_living_expenses');
    await change('Debt 1 actual total discharged', '18,000.37');
    await change('Debt 1 actual interest discharged', '1,200.12');
    await change('Debt 1 interest treatment from original records', 'nondeductible_personal');
    await change('Debt 1 personal borrowing records checked after the last edit', 'true');
    await change('Debt 1 sources checked after the last edit', 'true');
    await change('Canceled-debt packet checked after the last edit', 'true');
    expect(latest.sourceFactsConfirmed).toBe(true);
    await change('Debt 1 personal use record reference', 'Changed original personal purchase record');
    expect(latest.sourceFactsConfirmed).toBeNull();
    expect(latest.debts![0]!.sourceFactsConfirmed).toBeNull();
    expect(latest.debts![0]!.personalDebt!.sourceFactsConfirmed).toBeNull();
    expect(latest.debts![0]!.personalDebt!.actualDischargedInterest).toBe('1,200.12');
    expect(latest.debts![0]!.personalDebt).not.toHaveProperty('excludedAmount');
    expect(element.querySelector('input[type="number"]')).toBeNull();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
