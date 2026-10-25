// @vitest-environment jsdom
// Spec: spec/federal/guided-current-capital-origin.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CurrentLossOriginDetails } from '@/components/guided-interview/current-loss-origin-details';
import type { CurrentLossOriginData } from '@/lib/guided-current-loss-origin';
import { completeBrokerageSource, completeTransactionSource, completeDividendSource } from '../../guided-interview/complete-facts';

it('collects original capital history without invented classifications', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  let latest: CurrentLossOriginData | undefined = {};
  const investments = { interestEntries: [], dividendEntries: [{ ...completeDividendSource, capitalGainDistributions: '500.10' }], brokerageEntries: [{ ...completeBrokerageSource, sourceId: 'Actual original statement', sourceTaxYear: '2025', transactions: [{ ...completeTransactionSource, proceeds: '100.49', costBasis: '100.50', specialGainCharacter: 'ordinary' as const }] }] };
  const original = structuredClone(investments);
  function Harness() { const [data, setData] = useState(latest); return <CurrentLossOriginDetails data={data} investments={investments} onChange={next => { latest = next; setData(next); }} />; }
  async function click(text: string) { const button = [...host.querySelectorAll('button')].find(node => node.textContent === text); if (!button) throw new Error(`Missing ${text}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const input = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await click('Add current capital source packet'); expect(latest?.capitalSources?.sourceTaxYear).toBeUndefined();
    await click('Copy original investment capital records');
    expect(latest?.capitalSources?.transactions?.[0]).toMatchObject({ sourceId: 'form1099B:0:transaction:0', statementSourceId: 'Actual original statement', sourceTaxYear: '2025', transaction: { proceeds: '100.49', costBasis: '100.50' } });
    expect(latest?.capitalSources?.transactions?.[0].nonbusinessInvestmentConfirmed).toBeUndefined();
    expect(latest?.capitalSources?.distributions?.[0].sourceTaxYear).toBeUndefined();
    expect(latest?.capitalSources?.distributions?.[0].totalCapitalGainDistributions).toBe('500.10');
    await change('Capital disposition 1 is a nonbusiness investment', 'true');
    await click('Add filed capital carry history');
    expect(latest?.capitalSources?.priorCapitalLosses?.shortTermCapitalLoss).toBeUndefined();
    await change('Filed prior short-term capital loss', '0'); await change('Filed prior long-term capital loss', '-4000');
    const signedCarry = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === 'Filed prior long-term capital loss')?.querySelector('input');
    expect(signedCarry?.getAttribute('aria-invalid')).toBeNull();
    await click('Add independent capital AMT comparison');
    await change('Capital regular and AMT basis and adjustments are the same', 'false');
    expect(latest?.capitalSources?.alternativeTax?.currentBasisAndAdjustmentsSameConfirmed).toBe(false);
    await change('Filed capital carry checked after the last edit', 'true');
    await change('Capital AMT comparison checked after the last edit', 'true');
    await change('Current capital sources checked after the last edit', 'true');
    expect(latest?.capitalSources?.priorCapitalLosses?.sourceFactsConfirmed).toBe(true);
    expect(latest?.capitalSources?.sourceFactsConfirmed).toBe(true);
    await change('Current capital packet reference', 'Changed actual source packet');
    expect(latest?.capitalSources?.sourceFactsConfirmed).toBeNull(); expect(latest?.capitalSources?.priorCapitalLosses?.sourceFactsConfirmed).toBeNull(); expect(latest?.capitalSources?.alternativeTax?.sourceFactsConfirmed).toBeNull();
    await change('Capital regular and AMT basis and adjustments are the same', '');
    expect(latest?.capitalSources?.alternativeTax?.currentBasisAndAdjustmentsSameConfirmed).toBeNull();
    expect(latest?.capitalSources?.priorCapitalLosses?.shortTermCapitalLoss).toBe('0'); expect(investments).toEqual(original);
    expect(latest?.capitalSources).not.toHaveProperty('netOperatingLoss');
    await click('Remove current capital source packet'); expect(latest?.capitalSources).toBeUndefined();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
