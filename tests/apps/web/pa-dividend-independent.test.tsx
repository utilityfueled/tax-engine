// @vitest-environment jsdom
// Spec: spec/state/pa-dividend-independent.yaml. Independent source/lifecycle controls.
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { PAResidencyDetails } from '@/components/guided-interview/pa-residency-details';
import { emptyGuidedPADividendSource, emptyGuidedPADividendCredit, updateGuidedPADividendSource, GuidedPADividendSourceSchema } from '@/lib/guided-pa-dividend-sources';
import { confirmGuidedPAResidencySources, buildGuidedPAResidencySources } from '@/lib/guided-pa-residency-facts';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import type { PAResidencySources } from '@/models/pa-residency';
import type { TaxYearInput } from '@/models/inputs';
import { paOrdinaryInvestmentFixture } from '../../fixtures/pa-ordinary-investment-sources';
import { mountGuidedPanel } from './guided-panel-dom';

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Independent actual fixture requires source');
  return value;
}
function fractional(status: 'resident' | 'part_year' | 'nonresident') {
  const f = paOrdinaryInvestmentFixture(status);
  const original = required(f.input.form1099Div[0]), row = required(f.residency.dividends[0]);
  // New explicit fictional statements: June30 1.01+0.50, July1 1.00+0.51.
  original.ordinaryDividends = '2.01'; original.totalCapitalGainDistributions = '1.01';
  row.credits = [
    { sourceReference: 'Independent actual June30 distribution', creditedOn: '2025-06-30', ordinaryDividends: '1.01', capitalGainDistributions: '0.50' },
    { sourceReference: 'Independent actual July1 distribution', creditedOn: '2025-07-01', ordinaryDividends: '1.00', capitalGainDistributions: '0.51' },
  ];
  const confirmed = confirmGuidedPAResidencySources(f.input, f.residency);
  return { f, confirmed };
}

it('independent dividend drafts stay strict fresh and unknown', () => {
  const a = emptyGuidedPADividendSource(), b = emptyGuidedPADividendSource();
  expect(a.sourceTaxYear).toBeNull(); expect(a.originalIndex).toBeNull(); expect(a.original).toBeUndefined();
  expect(a.ordinaryPersonalDividendIncomeConfirmed).toBeNull();
  a.credits.push(emptyGuidedPADividendCredit()); expect(b.credits).toEqual([]);
  expect(a.credits[0]).toEqual({ sourceReference: '', creditedOn: '', ordinaryDividends: '', capitalGainDistributions: '' });
  expect(() => GuidedPADividendSourceSchema.parse({ ...b, sourceTaxYear: '2025' })).toThrow();
  expect(() => GuidedPADividendSourceSchema.parse({ ...b, taxableDividendOverride: '0' })).toThrow();
});
it('independent mixed fact and confirmation patch cannot bind or retain confirmation', () => {
  const row = required(paOrdinaryInvestmentFixture().residency.dividends[0]), before = structuredClone(row);
  const next = updateGuidedPADividendSource(row, { sourceReference: 'Independent edited actual reference', sourceFactsConfirmed: true });
  expect(next.sourceFactsConfirmed).toBeNull(); expect(next.original).toEqual(before.original); expect(row).toEqual(before);
  const answer = updateGuidedPADividendSource(next, { sourceFactsConfirmed: true });
  expect(answer.sourceFactsConfirmed).toBe(true); expect(answer.original).toEqual(before.original);
});
it('independent exact raw currency strings survive draft edits and JSON without arithmetic', () => {
  const row = required(paOrdinaryInvestmentFixture().residency.dividends[0]), before = structuredClone(row);
  const amount = '123456789012345678901234567890.0100000000000000000001';
  const next = updateGuidedPADividendSource(row, { credits: [{ ...required(row.credits[0]), ordinaryDividends: amount, capitalGainDistributions: '0' }] });
  expect(JSON.parse(JSON.stringify(next)).credits[0]).toMatchObject({ ordinaryDividends: amount, capitalGainDistributions: '0' });
  expect(next.sourceFactsConfirmed).toBeNull(); expect(row).toEqual(before);
});
it.each([['resident', '3.02', '0'], ['part_year', '1.51', '1.51'], ['nonresident', '0', '3.02']] as const)(
  'independent actual June30 and July1 receipts preserve raw cents in %s', (status, taxable, excluded) => {
    const { f, confirmed } = fractional(status), before = structuredClone(confirmed), originals = structuredClone(f.input);
    const r = calculatePAResidencySources(f.input, buildGuidedPAResidencySources(f.input, confirmed));
    expect(r.dividends.toFixed()).toBe(taxable); expect(r.excludedNonPADividends.toFixed()).toBe(excluded);
    expect(confirmed).toEqual(before); expect(f.input).toEqual(originals);
  },
);
it.each(['payer', 'owner', 'year', 'duplicate index', 'unreconciled credits'] as const)(
  'independent retained current original rejects %s without read refresh', kind => {
    const { f, confirmed } = fractional('part_year');
    if (kind === 'payer') required(f.input.form1099Div[0]).payer = 'Independent equal-dollar changed payer';
    if (kind === 'owner') required(f.input.form1099Div[0]).accountHolder = 'spouse';
    if (kind === 'year') required(f.input.form1099Div[0]).taxYear = 2024;
    if (kind === 'duplicate index') {
      f.input.form1099Div.push({ ...required(f.input.form1099Div[0]), payer: 'Independent second original', accountReference: 'Independent second original account' });
      required(confirmed.dividends).push(structuredClone(required(required(confirmed.dividends)[0])));
    }
    if (kind === 'unreconciled credits') required(required(required(confirmed.dividends)[0]).credits[0]).ordinaryDividends = '1.02';
    const before = structuredClone(confirmed), inputBefore = structuredClone(f.input);
    expect(() => buildGuidedPAResidencySources(f.input, confirmed)).toThrow(/original|source|reconcile|dividend/i);
    expect(confirmed).toEqual(before); expect(f.input).toEqual(inputBefore);
  },
);

async function panel(empty = false) {
  const f = paOrdinaryInvestmentFixture('part_year'); let latest: PAResidencySources = structuredClone(f.residency);
  if (empty) latest = { ...latest, sourceFactsConfirmed: null, dividends: [] };
  let originalInput: TaxYearInput | null = f.input;
  function Harness() {
    const [data, setData] = useState(latest);
    return <PAResidencyDetails originalInput={originalInput} data={data} onChange={next => { latest = required(next); setData(latest); }} />;
  }
  const dom = await mountGuidedPanel(<Harness />);
  return { f, dom, data: () => latest, original: (input: TaxYearInput | null) => { originalInput = input; }, rerender: () => dom.render(<Harness />) };
}
const confirm = 'Confirm all actual PA source records after the last edit';
it('independent original selection never fills unknown facts or exposes private IDs', async () => {
  const p = await panel(true);
  try {
    await p.dom.click('Add actual dividend source'); await p.dom.change('Dividend 1 entered 1099-DIV original', '0');
    const row = required(required(p.data().dividends)[0]);
    expect(row.originalIndex).toBe(0); expect(row.sourceTaxYear).toBeNull(); expect(row.original).toBeUndefined();
    expect(row.sourceReference).toBe(''); expect(row.credits).toEqual([]); expect(row.sourceFactsConfirmed).toBeNull();
    const selector = p.dom.control('Dividend 1 entered 1099-DIV original');
    expect(selector.textContent).toContain('Fictional ordinary regulated investment fund');
    for (const secret of [p.f.input.taxpayer.primary.ssn, required(p.f.input.form1099Div[0]).payerTin, required(p.f.input.form1099Div[0]).accountReference]) {
      if (secret) expect(selector.textContent).not.toContain(secret);
    }
    p.original(null); await p.rerender(); const before = structuredClone(p.data());
    await p.dom.click(confirm); expect(p.data()).toEqual(before);
    expect(p.dom.container.querySelector('[role="status"]')?.textContent).toMatch(/complete actual original/i);
  } finally { await p.dom.dispose(); }
});
it.each([
  ['Dividend 1 original reference', 'Independent new source reference'],
  ['Dividend 1 original tax year', '2024'],
  ['Dividend 1 entered 1099-DIV original', ''],
  ['Dividend 1 credit 1 record reference', 'Independent changed record'],
  ['Dividend 1 credit 1 actual date', '2025-04-01'],
  ['Dividend 1 credit 1 actual ordinary dividends', '1000.01'],
  ['Dividend 1 credit 1 actual capital gain distributions', '200.01'],
  ['Dividend 1: Ordinary personal investment dividends only', 'false'],
] as const)('independent native edit revokes both confirmations for %s', async (label, value) => {
  const p = await panel();
  try {
    const before = structuredClone(p.data()); await p.dom.change(label, value);
    const row = required(required(p.data().dividends)[0]);
    expect(row.sourceFactsConfirmed).toBeNull(); expect(p.data().sourceFactsConfirmed).toBeNull();
    expect(row.original).toEqual(required(required(before.dividends)[0]).original);
    expect(p.data().wages).toEqual(before.wages); expect(p.data().interest).toEqual(before.interest);
    expect(() => buildGuidedPAResidencySources(p.f.input, p.data())).toThrow();
  } finally { await p.dom.dispose(); }
});
it('independent row answer cannot refresh changed originals before explicit packet confirmation', async () => {
  const p = await panel();
  try {
    const retained = structuredClone(required(required(p.data().dividends)[0]).original);
    required(p.f.input.form1099Div[0]).payer = 'Independent explicitly reconfirmed equal-dollar payer';
    await p.rerender(); await p.dom.change('Dividend 1: Original facts checked', 'true');
    expect(required(required(p.data().dividends)[0]).original).toEqual(retained);
    expect(() => buildGuidedPAResidencySources(p.f.input, p.data())).toThrow();
    await p.dom.click(confirm); expect(p.data().sourceFactsConfirmed).toBe(true);
    expect(required(required(p.data().dividends)[0]).original).toEqual(required(p.f.input.form1099Div[0]));
    expect(() => buildGuidedPAResidencySources(p.f.input, p.data())).not.toThrow();
  } finally { await p.dom.dispose(); }
});
it('independent knownzero credit survives reopening while every other unknown remains unknown', async () => {
  const p = await panel(true);
  try {
    await p.dom.click('Add actual dividend source'); await p.dom.click('Add actual dividend credit 1');
    await p.dom.change('Dividend 1 credit 1 actual ordinary dividends', '0');
    const saved = JSON.parse(JSON.stringify(p.data())) as PAResidencySources;
    await p.dom.render(<PAResidencyDetails originalInput={p.f.input} data={saved} onChange={() => { throw new Error('Read-only reopening must not write'); }} />);
    expect(p.dom.control('Dividend 1 credit 1 actual ordinary dividends').value).toBe('0');
    expect(p.dom.control('Dividend 1 credit 1 actual capital gain distributions').value).toBe('');
    expect(p.dom.control('Dividend 1 credit 1 actual date').value).toBe('');
    expect(p.dom.control('Dividend 1 original tax year').value).toBe('');
    expect(required(required(saved.dividends)[0]).original).toBeUndefined();
    expect(saved.sourceFactsConfirmed).toBeNull();
  } finally { await p.dom.dispose(); }
});
