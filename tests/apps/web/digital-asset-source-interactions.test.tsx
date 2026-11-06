// @vitest-environment jsdom
// Spec: spec/federal/guided-digital-asset-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DigitalAssetSourceCards } from '@/components/guided-interview/digital-asset-source-details';
import type { DigitalAssetEntryData } from '@/lib/guided-digital-asset-facts';
import { SectionInvestmentIncome } from '@/components/guided-interview/section-investment-income';
import type { ScheduleDSourceData } from '@/lib/guided-schedule-d-sources';
import { actualGuidedDigitalAsset } from '../../fixtures/guided-digital-asset-sources';

it('collects original DA blanks and preserves unknown source answers', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network expected'));
  let latest: DigitalAssetEntryData[] = [];
  function Harness() { const [entries, setEntries] = useState<DigitalAssetEntryData[]>([]); return <DigitalAssetSourceCards entries={entries} stateCode="PA" onChange={value => { latest = value; setEntries(value); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(row => row.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing field setter');
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click('Add actual 1099-DA statement');
    expect(latest).toEqual([{}]); await click('Add individual disposition to DA statement 1');
    expect(latest[0].transactions).toEqual([{}]);
    await change('DA 1 sale 1 — Original Box 1g is blank', 'true');
    await change('DA 1 sale 1 — Completed taxpayer cost basis', '90.24');
    await change('DA 1 sale 1 — Box 9 noncovered security', 'false');
    await change('DA 1 sale 1 — Actual Pennsylvania adjusted basis', '80.24');
    await change('DA 1 sale 1 — Pennsylvania basis reference', 'Private Pennsylvania purchase ledger');
    await change('DA 1 sale 1 — Transaction was entered into for profit', 'true');
    await change('DA 1 sale 1 — Basis records checked after the last edit', 'true');
    await change('DA 1 sale 1 — Pennsylvania basis checked after the last edit', 'true');
    await change('DA statement 1 — Sources checked after the last edit', 'true');
    expect(latest[0]).toMatchObject({ sourceFactsConfirmed: true, transactions: [{ reportedCostBasisBlank: true, costBasis: '90.24', noncoveredSecurity: false, basisFactsConfirmed: true, paCostBasis: '80.24', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true }] });
    await change('DA 1 sale 1 — Box 9 noncovered security', '');
    expect(latest[0]).toMatchObject({ sourceFactsConfirmed: null, transactions: [{ noncoveredSecurity: null, costBasis: '90.24', reportedCostBasisBlank: true, basisFactsConfirmed: null, paCostBasis: '80.24', paBasisFactsConfirmed: null }] });
    await change('DA 1 sale 1 — Original Box 1g is blank', 'false');
    expect(latest[0].transactions?.[0].costBasis).toBe('90.24');
    expect(latest[0].transactions?.[0].reportedCostBasis).toBeUndefined();
    expect(network).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); network.mockRestore(); }
});

it('copies original digital records through the investment section', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  const source = actualGuidedDigitalAsset(), row = source.transactions?.[0];
  if (!row) throw new Error('Missing explicit synthetic original row'); row.holdingPeriod = 'long'; row.dateAcquired = '2020-01-15';
  const original = JSON.stringify(source); let latest: ScheduleDSourceData | undefined;
  function Harness() {
    const [data, setData] = useState<ScheduleDSourceData>();
    return <SectionInvestmentIncome interestEntries={[]} dividendEntries={[]} brokerageEntries={[]} digitalAssetEntries={[source]}
      onInterestEntriesChange={() => {}} onDividendEntriesChange={() => {}} onBrokerageEntriesChange={() => {}}
      scheduleDSources={data} onScheduleDSourcesChange={next => { latest = next; setData(next); }} />;
  }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click('Add capital source worksheet'); await click('Copy current investment records for review');
    expect(latest?.longTermAssets).toEqual([expect.objectContaining({ sourceId: 'form1099DA:0:transaction:0', sourceReference: JSON.stringify([source.sourceId, row.sourceId]), proceeds: '100.49', costBasis: '90.24', character: 'ordinary' })]);
    expect(JSON.stringify(source)).toBe(original);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
