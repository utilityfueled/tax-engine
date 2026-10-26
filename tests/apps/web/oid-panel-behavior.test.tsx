// @vitest-environment jsdom
// Spec: spec/federal/guided-panel-behavior.yaml, oid-premium-history and oid-tips-history.
import React, { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { OidSourceCards } from '@/components/guided-interview/oid-source-details';
import { buildOidInputs, oidFactErrors, type OidEntryData } from '@/lib/guided-oid-facts';
import { calculateForm1099OID } from '@/engine/forms/form-1099-oid.js';
import { actualOid } from '../../fixtures/guided-oid';
import { mountGuidedPanel } from './guided-panel-dom';

it('reconciles actual premium periods recipient adjustments and state rows through the panel', async () => {
  let latest: OidEntryData[] = [];
  function Harness() {
    const [entries, setEntries] = useState(latest);
    return <OidSourceCards entries={entries} onChange={next => { latest = next; setEntries(next); }} />;
  }
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Source panels must stay local'));
  const panel = await mountGuidedPanel(<Harness />);
  const forms = () => buildOidInputs(latest, 'single', 2025);
  const result = () => calculateForm1099OID(forms(), 2025);
  const confirm = async () => {
    await panel.change('Are recipient amounts reconciled for holding period, basis and ownership?', 'true');
    await panel.change('Have you reviewed all actual OID source facts?', 'true');
  };
  try {
    await panel.expand('Original issue discount (1099-OID)');
    await panel.click('Add 1099-OID');
    expect(latest).toEqual([{}]);
    for (const [label, value] of [
      ['OID payer', 'Synthetic premium bond broker'], ['OID payer taxpayer ID', '12-3456789'],
      ['Unique source reference for this obligation', 'Synthetic premium obligation A'], ['Actual OID source tax year', '2025'],
      ['OID income owner', 'primary'], ['Actual OID source form revision', '2024-01'],
      ['Box 7 instrument description or CUSIP', 'Synthetic taxable premium bond'], ['Actual obligation type', 'taxable'],
      ['Is this an inflation-indexed obligation?', 'false'], ['Box 1 original issue discount', '0'],
      ['Box 2 other periodic interest', '170'], ['Box 3 early withdrawal penalty', '0'], ['Box 4 federal tax withheld', '0.10'],
      ['Box 5 market discount', '0'], ['Box 6 acquisition premium', '0'], ['Box 8 Treasury original issue discount', '0'],
      ['Box 9 investment expenses', '0'], ['Box 10 bond premium', '170'], ['Box 11 tax-exempt original issue discount', '0'],
      ['Is reported OID already net of acquisition premium?', 'false'], ['Is reported interest already net of bond premium?', 'false'],
      ['Was a current-inclusion market discount election made?', 'false'], ['Was the taxable bond premium amortization election made?', 'true'],
      ['Does the recipient worksheet confirm the supported bond premium rules apply?', 'true'],
      ['Does a recipient adjustment worksheet apply?', 'false'], ['Does a bond premium accrual-period worksheet apply?', 'true'],
      ['Prior interest inclusions', '20'], ['Prior premium deductions', '5'], ['Prior premium carryforward', '10'],
      ['Was this obligation disposed of during the year?', 'false'], ['Actual number of state rows', 'multiple'],
    ]) await panel.change(label, value);
    expect(latest[0]?.stateWithholding).toEqual([
      { state: '', statePayerId: '', stateWithheld: '' }, { state: '', statePayerId: '', stateWithheld: '' },
    ]);
    await panel.click('Add accrual period');
    expect(latest[0]?.bondPremiumWorksheet?.periods).toEqual([{ endDate: '', qualifiedStatedInterest: '', amortization: '' }]);
    for (const [label, value] of [
      ['Accrual period 1 — end date', '2025-06-30'], ['Accrual period 1 — stated interest', '100'], ['Accrual period 1 — premium amortization', '150'],
    ]) await panel.change(label, value);
    await panel.click('Add accrual period');
    for (const [label, value] of [
      ['Accrual period 2 — end date', '2025-12-31'], ['Accrual period 2 — stated interest', '70'], ['Accrual period 2 — premium amortization', '20'],
      ['State row 1 — state', 'MI'], ['State row 1 — payer ID', 'Synthetic-MI-ID'], ['State row 1 — withholding', '0.10'],
      ['State row 2 — state', 'OH'], ['State row 2 — payer ID', 'Synthetic-OH-ID'], ['State row 2 — withholding', '0.20'],
    ]) await panel.change(label, value);
    await confirm();
    expect(oidFactErrors(latest, 'single', 2025)).toEqual({});
    // Actual 170 interest, 170 premium and 10 opening carry: 15 currently deductible,
    // 5 taxable interest, no closing carry under the existing accrual-period method.
    expect(result().taxableInterest.toFixed()).toBe('5');
    expect(result().bondPremiumDeduction.toFixed()).toBe('15');
    expect(result().bondPremiumCarryforward.toFixed()).toBe('0');
    expect(result().stateWithheld.toFixed()).toBe('0.3');
    expect(result().federalWithheld.toFixed()).toBe('0.1');

    await panel.change('Does a recipient adjustment worksheet apply?', 'true');
    expect(latest[0]?.sourceFactsConfirmed).toBeNull();
    expect(latest[0]?.recipientAmountsConfirmed).toBeNull();
    await confirm();
    expect(() => forms()).toThrow();
    for (const [label, value] of [
      ['Recipient worksheet reference', 'Synthetic corrected recipient OID worksheet'], ['Recipient adjustment: oid', '0.25'],
      ['Recipient adjustment: periodic interest', '0'], ['Recipient adjustment: acquisition premium', '0'],
      ['Recipient adjustment: bond premium', '0'], ['Recipient adjustment: market discount', '0'],
    ]) await panel.change(label, value);
    await confirm();
    expect(result().taxableInterest.toFixed()).toBe('5.25');
    await panel.change('Does a recipient adjustment worksheet apply?', 'false');
    await confirm();
    expect(() => forms()).toThrow();
    expect(latest[0]?.recipientAdjustments?.oid).toBe('0.25');
    await panel.click('Clear recipient worksheet');
    await confirm();
    expect(result().taxableInterest.toFixed()).toBe('5');

    await panel.change('Actual number of state rows', 'single');
    expect(latest[0]?.stateWithholding).toHaveLength(2);
    await confirm();
    expect(() => forms()).toThrow();
    await panel.click('Remove state row 2');
    await confirm();
    expect(result().stateWithheld.toFixed()).toBe('0.1');
    await panel.change('State row 1 — withholding', '');
    await confirm();
    expect(() => forms()).toThrow();
    await panel.change('State row 1 — withholding', '0');
    await confirm();
    expect(result().stateWithheld.toFixed()).toBe('0');

    await panel.click('Remove accrual period 2');
    await confirm();
    expect(() => forms()).toThrow();
    expect(latest[0]?.bondPremiumWorksheet?.priorCarryforward).toBe('10');
    await panel.click('Clear premium worksheet');
    await confirm();
    expect(() => forms()).toThrow();
    expect(latest[0]?.usesBondPremiumWorksheet).toBe(true);
    await panel.click('Remove 1099-OID #1');
    expect(latest).toEqual([]);
    expect(forms()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  } finally { await panel.dispose(); fetch.mockRestore(); }
});

it('preserves signed TIPS history and requires reconciliation before changing obligation type', async () => {
  let latest: OidEntryData[] = [structuredClone(actualOid)];
  function Harness() {
    const [entries, setEntries] = useState(latest);
    return <OidSourceCards entries={entries} onChange={next => { latest = next; setEntries(next); }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  const forms = () => buildOidInputs(latest, 'single', 2025);
  const result = () => calculateForm1099OID(forms(), 2025);
  const confirm = async () => {
    await panel.change('Are recipient amounts reconciled for holding period, basis and ownership?', 'true');
    await panel.change('Have you reviewed all actual OID source facts?', 'true');
  };
  try {
    await panel.expand('Original issue discount (1099-OID)');
    for (const [label, value] of [
      ['Actual obligation type', 'treasury'], ['Is this an inflation-indexed obligation?', 'true'],
      ['Box 1 original issue discount', '0'], ['Box 2 other periodic interest', '100'], ['Box 8 Treasury original issue discount', '-38.90'],
    ]) await panel.change(label, value);
    expect(latest[0]?.treasuryOID).toBe('-38.90');
    await confirm();
    expect(() => forms()).toThrow();
    for (const [label, value] of [
      ['Is all interest for this instrument reported in this OID record?', 'true'], ['Prior TIPS interest inclusions', '0'],
      ['Prior TIPS ordinary losses', '0'], ['Prior TIPS deflation carryforward', '0'],
    ]) await panel.change(label, value);
    await confirm();
    expect(forms()[0]?.treasuryOID).toBe('-38.90');
    expect(result().taxableInterest.toFixed()).toBe('61.1');
    expect(result().treasuryInterest.toFixed()).toBe('61.1');
    expect(result().deflationOrdinaryLoss.toFixed()).toBe('0');
    expect(latest[0]?.tipsDeflationFacts?.priorInterestInclusions).toBe('0');

    await panel.click('Clear TIPS history');
    expect(latest[0]?.tipsDeflationFacts).toBeUndefined();
    await confirm();
    expect(() => forms()).toThrow();
    for (const [label, value] of [
      ['Is all interest for this instrument reported in this OID record?', 'false'], ['Prior TIPS interest inclusions', '0'],
      ['Prior TIPS ordinary losses', '0'], ['Prior TIPS deflation carryforward', '0'],
    ]) await panel.change(label, value);
    await confirm();
    expect(() => forms()).toThrow();
    expect(latest[0]?.tipsDeflationFacts?.allInstrumentInterestReportedHere).toBe(false);

    // A corrected municipal source must reconcile, rather than silently discard,
    // the previously saved Treasury amounts and TIPS worksheet.
    await panel.change('Actual obligation type', 'tax_exempt');
    await panel.change('Is this an inflation-indexed obligation?', 'false');
    await panel.change('Is this a specified private-activity bond for AMT?', 'true');
    await panel.change('Box 2 other periodic interest', '0');
    await panel.change('Box 8 Treasury original issue discount', '0');
    await panel.change('Box 11 tax-exempt original issue discount', '300.33');
    await confirm();
    expect(() => forms()).toThrow();
    await panel.click('Clear TIPS history');
    await confirm();
    expect(result().taxableInterest.toFixed()).toBe('0');
    expect(result().taxExemptInterest.toFixed()).toBe('300.33');
    expect(result().privateActivityBondInterest.toFixed()).toBe('300.33');
    await panel.change('Is this a specified private-activity bond for AMT?', '');
    await confirm();
    expect(() => forms()).toThrow();
    await panel.change('Is this a specified private-activity bond for AMT?', 'false');
    await confirm();
    expect(result().privateActivityBondInterest.toFixed()).toBe('0');
    expect(result().taxExemptInterest.toFixed()).toBe('300.33');
  } finally { await panel.dispose(); }
});
