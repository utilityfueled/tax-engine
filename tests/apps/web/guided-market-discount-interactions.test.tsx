// @vitest-environment jsdom
// Spec: spec/federal/guided-market-discount-sources.yaml.
import React, { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { DigitalAssetSourceCards } from '@/components/guided-interview/digital-asset-source-details';
import { SectionInvestmentIncome } from '@/components/guided-interview/section-investment-income';
import { emptyInterestEntry } from '@/lib/guided-interview-flow';
import { confirmMarketDiscount, marketDiscountConfirmationCurrent, marketDiscountAmountFields, marketDiscountBooleanFields } from '@/lib/guided-market-discount-sources';
import { buildDigitalAssetInputs, type DigitalAssetEntryData } from '@/lib/guided-digital-asset-facts';
import { guidedMarketDiscountOriginal } from '../../fixtures/guided-market-discount-sources';
import { completePersonalInfo } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

it('collects explicit debt facts and invalidates edited originals', async () => {
  const original = guidedMarketDiscountOriginal(), values = original.transactions![0].marketDiscountFacts!;
  delete original.transactions![0].marketDiscountFacts;
  let latest: DigitalAssetEntryData[] = [original];
  const context = { interestEntries:[], oidEntries:undefined, filingStatus:'single' as const, taxYear:2025, stateCode:null };
  function Harness() { const [entries,setEntries]=useState(latest);return <DigitalAssetSourceCards entries={entries} context={context} onChange={next=>{latest=next;setEntries(next);}} />; }
  const fetch = vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No original sources leave this panel'));
  const panel = await mountGuidedPanel(<Harness />);
  const sale = (label:string,value:string) => panel.change(`DA 1 sale 1 — ${label}`,value);
  const forms = () => buildDigitalAssetInputs(latest,'single',2025,completePersonalInfo,[],context);
  try {
    await panel.click('Add original market discount sources for DA 1 sale 1');
    expect(latest[0].transactions![0].marketDiscountFacts).toEqual({});
    expect(panel.control('DA 1 sale 1 — Current-inclusion market discount election applies').value).toBe('');
    await sale('Debt, election, history and interest originals checked after the last edit','true');
    expect(forms).toThrow();
    for (const [key,label] of [['sourceReference','Original debt and election record reference'],['originalDispositionReference','Original full sale record reference'],['issueDate','Original debt issue date'],['maturityDate','Original debt maturity date'],['interestReconciliationReference','Original INT/OID reconciliation reference']] as const) await sale(label,values[key]!);
    await sale('Actual issuer tax treatment','taxable_corporate'); await sale('Actual cause of ordinary income','market_discount_only');
    for (const [key,label] of marketDiscountAmountFields) await sale(label,values[key]!);
    for (const [key,label] of marketDiscountBooleanFields) await sale(label,String(values[key]));
    await sale('Debt, election, history and interest originals checked after the last edit','true');
    await sale('Basis records checked after the last edit','true');
    await panel.change('DA statement 1 — Sources checked after the last edit','true');
    expect(forms()[0].transactions[0]).toMatchObject({ ordinaryIncome:true, noncoveredSecurity:true, marketDiscountSource:{ sourceFactsConfirmed:true, interestReportingReconciliation:{originalForm1099Int:[],originalForm1099OID:[]} } });
    await sale('Prior partial principal payments','1');
    expect(panel.control('DA 1 sale 1 — Debt, election, history and interest originals checked after the last edit').value).toBe('');
    expect(forms).toThrow();
    expect(latest[0].transactions![0].ordinaryIncome).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  } finally { await panel.dispose(); fetch.mockRestore(); }
});

it('keeps displayed blank interest placeholders out of confirmed actual original collections', async () => {
  const entry = guidedMarketDiscountOriginal();
  const actualContext = { interestEntries:undefined, oidEntries:undefined, filingStatus:'single' as const, taxYear:2025, stateCode:null };
  entry.transactions![0].marketDiscountFacts = confirmMarketDiscount(entry,entry.transactions![0],actualContext,true);
  let latest = [entry];
  function Harness() { const [entries,setEntries]=useState(latest);return <SectionInvestmentIncome
    interestEntries={[emptyInterestEntry]} dividendEntries={[]} brokerageEntries={[]}
    onInterestEntriesChange={()=>{}} onDividendEntriesChange={()=>{}} onBrokerageEntriesChange={()=>{}}
    digitalAssetEntries={entries} onDigitalAssetEntriesChange={next=>{latest=next;setEntries(next);}}
    filingStatus="single" taxYear={2025} marketDiscountContext={actualContext} />; }
  const panel=await mountGuidedPanel(<Harness />);
  try {
    const label='DA 1 sale 1 — Debt, election, history and interest originals checked after the last edit';
    expect(panel.control(label).value).toBe('true');
    await panel.change(label,'true');
    expect(marketDiscountConfirmationCurrent(latest[0],latest[0].transactions![0],actualContext)).toBe(true);
    await panel.change('DA 1 sale 1 — Basis records checked after the last edit','true');
    await panel.change('DA statement 1 — Sources checked after the last edit','true');
    expect(buildDigitalAssetInputs(latest,'single',2025,completePersonalInfo,[],actualContext)[0].transactions[0].marketDiscountSource?.interestReportingReconciliation.originalForm1099Int).toEqual([]);
    expect(latest[0].transactions![0].marketDiscountFacts?.originalValues).not.toContain('New payer');
  } finally { await panel.dispose(); }
});
