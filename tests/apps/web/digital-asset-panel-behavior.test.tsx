// @vitest-environment jsdom
// Spec: spec/federal/guided-panel-behavior.yaml, digital-original-disposition.
import React, { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { DigitalAssetSourceCards } from '@/components/guided-interview/digital-asset-source-details';
import { buildDigitalAssetInputs, digitalAssetFactErrors, type DigitalAssetEntryData } from '@/lib/guided-digital-asset-facts';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { completePersonalInfo } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

it('enters original digital statement facts and reconciles changed signed dispositions', async () => {
  let latest: DigitalAssetEntryData[] = [];
  function Harness() {
    const [entries, setEntries] = useState(latest);
    return <DigitalAssetSourceCards entries={entries} onChange={next => { latest = next; setEntries(next); }} />;
  }
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Source panels must stay local'));
  const panel = await mountGuidedPanel(<Harness />);
  const statement = (label: string, value: string) => panel.change(`DA statement 1 — ${label}`, value);
  const sale = (label: string, value: string) => panel.change(`DA 1 sale 1 — ${label}`, value);
  const forms = () => buildDigitalAssetInputs(latest, 'single', 2025, completePersonalInfo);
  const result = () => calculateForm1099DASources({ taxpayer: { taxYear: 2025, filingStatus: 'single' }, form1099B: [], form1099DA: forms() });
  const confirm = async () => {
    await sale('Basis records checked after the last edit', 'true');
    await statement('Sources checked after the last edit', 'true');
  };
  try {
    await panel.expand('Original digital assets (1099-DA)');
    await panel.click('Add actual 1099-DA statement');
    expect(latest).toEqual([{}]);
    await statement('Original statement ID', 'Synthetic DA account A');
    await statement('Original source reference', 'Synthetic original recipient statement');
    await statement('Actual source tax year', '2025');
    await statement('Broker name', 'Synthetic Digital Broker');
    await statement('Broker taxpayer ID, if shown', '12-3456789');
    await statement('Account reference, if shown', 'Synthetic account 1');
    await statement('Actual taxpayer owner', 'primary');
    await statement('Box 4 federal withholding', '0.10');
    await statement('Actual state reporting', 'single');
    await statement('Original state code', 'MI');
    await statement('Original state withholding', '0.20');
    await panel.click('Add individual disposition to DA statement 1');
    expect(latest[0]?.transactions).toEqual([{}]);
    expect(Object.keys(digitalAssetFactErrors(latest, 'single', 2025, completePersonalInfo)).length).toBeGreaterThan(0);
    for (const [label, value] of [
      ['Original disposition ID', 'Synthetic disposition A'], ['Box 1a digital asset code', 'BTC'],
      ['Box 1b digital asset name', 'Bitcoin'], ['Ticker, if shown', 'BTC'], ['Box 1c units', '0.0010'],
      ['Box 1e sale date', '2025-06-01'], ['Original Box 1d is blank', 'true'], ['Original Box 1g is blank', 'true'],
      ['Box 1f proceeds', '100.49'], ['Completed taxpayer cost basis', '90.24'],
      ['Box 1h accrued market discount', '0'], ['Box 1i wash-sale loss disallowed', '0'],
      ['Selling expenses not included in reported basis or proceeds', '0'], ['Other capital adjustments', '0'],
      ['Signed statement gain or loss, if shown', '10.25'], ['Completed acquisition date', '2025-01-15'],
      ['Actual basis record', 'taxpayer_records'], ['Basis record reference', 'Synthetic acquisition ledger'],
      ['Actual holding period', 'short'], ['Actual disposition type', 'sale'], ['Box 3a proceeds type', 'gross'],
      ['Actual original acquisition', 'purchase'], ['Original optional aggregate reporting', 'none'],
    ]) await sale(label, value);
    await panel.expand('DA 1 sale 1 — source classifications');
    for (const [label, value] of [
      ['Box 2 basis reported to the IRS', 'false'], ['Box 3b qualified opportunity fund proceeds', 'false'],
      ['Box 5 loss not allowed', 'false'], ['Box 6 ordinary income', 'false'], ['Box 7 only cash proceeds', 'true'],
      ['Box 8 customer acquisition information', 'true'], ['Box 9 noncovered security', 'true'],
      ['Wash-sale treatment applies to this actual disposition', 'false'], ['Actual asset was held as capital property', 'true'],
      ['Actual asset is an NFT or collectible', 'false'],
    ]) await sale(label, value);
    await statement('Every original disposition is included', 'true');
    await confirm();
    expect(forms()[0]).toMatchObject({ federalWithheld: '0.10', stateWithheld: '0.20', transactions: [{
      quantity: '0.0010', reportedDateAcquired: null, reportedCostBasis: null, costBasis: '90.24', gainOrLoss: '10.25',
    }] });
    expect(result().federalWithheld.toFixed()).toBe('0.1');
    expect(result().lines.find(line => line.line === 'capital:0:0')?.value.toFixed()).toBe('10.25');
    expect(result().capitalForms[0]?.transactions).toHaveLength(1);
    expect(result().capitalForms[0]?.transactions[0]).toMatchObject({ proceeds: '100.49', costBasis: '90.24', sourceDocumentType: '1099-da' });

    // A correction of the actual acquisition ledger is independent of a blank broker box.
    await sale('Completed taxpayer cost basis', '110.24');
    await sale('Signed statement gain or loss, if shown', '-9.75');
    expect(latest[0]?.sourceFactsConfirmed).toBeNull();
    expect(latest[0]?.transactions?.[0]?.basisFactsConfirmed).toBeNull();
    expect(() => forms()).toThrow();
    await confirm();
    expect(forms()[0]?.transactions[0]).toMatchObject({ reportedCostBasis: null, costBasis: '110.24', gainOrLoss: '-9.75' });
    expect(result().federalWithheld.toFixed()).toBe('0.1');
    expect(result().lines.find(line => line.line === 'capital:0:0')?.value.toFixed()).toBe('-9.75');

    await sale('Original Box 1g is blank', 'false');
    await confirm();
    expect(() => forms()).toThrow();
    await sale('Original Box 1g reported basis', '0');
    await sale('Original Box 1d is blank', 'false');
    await sale('Original Box 1d acquisition date', '2025-01-15');
    await confirm();
    expect(latest[0]?.transactions?.[0]).toMatchObject({ reportedCostBasis: '0', reportedDateAcquired: '2025-01-15', costBasis: '110.24' });
    expect(() => forms()).toThrow(/basis correction/i);
    await sale('Completed taxpayer cost basis', '0');
    await sale('Signed statement gain or loss, if shown', '100.49');
    await confirm();
    expect(forms()[0]?.transactions[0]).toMatchObject({ reportedCostBasis: '0', costBasis: '0', gainOrLoss: '100.49' });

    await sale('Actual original acquisition', 'staking');
    await confirm();
    expect(panel.container.textContent).toContain('separate acquisition, special-tax or aggregate reporting method');
    expect(latest[0]?.transactions?.[0]?.assetOrigin).toBe('staking');
    expect(() => forms()).toThrow();
    await sale('Actual original acquisition', 'purchase');
    await confirm();
    await panel.click('Add individual disposition to DA statement 1');
    expect(latest[0]?.transactions?.[1]).toEqual({});
    await statement('Sources checked after the last edit', 'true');
    expect(() => forms()).toThrow();
    await panel.click('Remove DA 1 sale 2');
    await confirm();
    expect(result().capitalForms[0]?.transactions).toHaveLength(1);
    await panel.click('Add actual 1099-DA statement');
    expect(latest[1]).toEqual({});
    await panel.click('Remove DA statement 2');
    expect(forms()).toHaveLength(1);
    await panel.click('Remove DA statement 1');
    expect(latest).toEqual([]);
    expect(forms()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  } finally { await panel.dispose(); fetch.mockRestore(); }
});
