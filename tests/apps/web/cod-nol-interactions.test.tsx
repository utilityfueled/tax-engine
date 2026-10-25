// @vitest-environment jsdom
// Spec: spec/federal/guided-cod-nol.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CodNolDetails } from '@/components/guided-interview/cod-nol-details';
import type { CodNolData } from '@/lib/guided-cod-nol';

it('collects original cancellation and insolvency records without invented amounts', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: CodNolData | undefined;
  function Harness() { const [data, setData] = useState(latest); return <CodNolDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
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
    await act(async () => root.render(<Harness />)); await click('Add canceled-debt sources'); expect(latest).toEqual({});
    await click('Add original debt statement'); expect(latest?.debts?.[0]?.amountDischarged).toBeUndefined();
    expect(latest?.debts?.[0]?.accountHolder).toBeUndefined();
    await change('Debt 1 original statement ID', 'Actual statement-A'); await change('Debt 1 Box 2 canceled debt', '1000.49');
    await change('Debt 1 Box 3 interest included', '0'); await change('Debt 1 Box 5 personally liable', 'false');
    expect(latest?.debts?.[0]?.interestIncluded).toBe('0'); expect(latest?.debts?.[0]?.personallyLiable).toBe(false);
    await click('Add insolvency worksheet'); expect(latest?.insolvency?.assets).toBeUndefined();
    await click('Record no assets'); expect(latest?.insolvency?.assets).toEqual([]);
    await click('Add liability'); expect(latest?.insolvency?.liabilities?.[0]?.amount).toBeUndefined();
    await change('Liability 1 canceled statement', 'Actual statement-A');
    expect(latest?.insolvency?.liabilities?.[0]?.dischargedDebtStatementId).toBe('Actual statement-A');
    await change('Debt 1 sources checked after the last edit', 'true');
    await change('Insolvency worksheet checked after the last edit', 'true'); await change('Canceled-debt packet checked after the last edit', 'true');
    expect(latest?.sourceFactsConfirmed).toBe(true); expect(latest?.debts?.[0]?.sourceFactsConfirmed).toBe(true);
    await change('Debt 1 Box 2 canceled debt', '1000.50'); expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.insolvency?.sourceFactsConfirmed).toBeNull(); expect(latest?.debts?.[0]?.sourceFactsConfirmed).toBeNull();
    await change('Debt 1 Box 3 interest included', ''); expect(latest?.debts?.[0]?.interestIncluded).toBe('');
    expect(element.querySelector('input[type="number"]')).toBeNull(); expect(latest).not.toHaveProperty('carryforward');
    await click('Remove original debt statement 1'); expect(latest?.debts).toEqual([]);
    expect(latest?.insolvency?.liabilities?.[0]?.dischargedDebtStatementId).toBe('Actual statement-A');
    await click('Remove canceled-debt sources'); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
