// @vitest-environment jsdom
// Spec: spec/federal/guided-k1-cash-distribution.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1CharitableSourceDetails } from '@/components/guided-interview/k1-charitable-source-details';
import { actualGuidedK1CashDistribution } from '../../fixtures/guided-k1-cash-distribution';
import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
it('collects and removes actual distribution facts without defaults or gain overrides', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: K1CharitableSourcesData | undefined = actualGuidedK1CashDistribution();
  if (latest.statements?.[0]) latest.statements[0].cashDistribution = undefined;
  const original = structuredClone(latest.statements?.[0].original);
  function Harness() { const [data, setData] = useState(latest); return <K1CharitableSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  const row = () => latest?.statements?.[0];
  async function click(label: string) { const button = [...element.querySelectorAll('button')].find(n => n.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(n => n.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await click('Add Charitable K-1 1 cash distribution attachment'); expect(row()?.cashDistribution).toEqual({});
    await change('Charitable K-1 1 distribution actual cash', '0.00');
    await change('Charitable K-1 1 distribution cash only', 'false');
    await change('Charitable K-1 1 distribution actual at-risk source reference', 'private-actual-risk-reference');
    expect(row()?.cashDistribution).toMatchObject({ cashAmount: '0.00', cashOnlyConfirmed: false, atRiskSourceReference: 'private-actual-risk-reference' });
    expect(row()?.cashDistribution?.sourceTaxYear).toBeUndefined(); expect(row()?.cashDistribution?.acquisitionDate).toBeUndefined();
    await change('Charitable K-1 1 distribution checked after the last edit', 'true');
    expect(row()?.cashDistribution?.sourceFactsConfirmed).toBe(true);
    await change('Charitable K-1 1 distribution acquisition date', '2023-01-01');
    expect(row()?.cashDistribution?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change('Charitable K-1 1 distribution cash only', ''); expect(row()?.cashDistribution?.cashOnlyConfirmed).toBeNull();
    expect(element.querySelector('input[type="number"]')).toBeNull();
    expect([...element.querySelectorAll('.guided-field-label')].map(n => n.textContent).filter(n => /^Charitable K-1 1 distribution/.test(n ?? ''))).not.toContain('Charitable K-1 1 distribution calculated gain');
    await click('Remove Charitable K-1 1 cash distribution attachment');
    expect(row()?.cashDistribution).toBeUndefined(); expect(row()?.original).toEqual(original); expect(row()?.basis?.priorBasisSuspensions).toEqual([]);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
