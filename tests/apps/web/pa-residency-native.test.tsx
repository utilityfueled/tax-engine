// @vitest-environment jsdom
// Spec: spec/state/pa-residency-native.yaml
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { PAResidencyDetails } from '@/components/guided-interview/pa-residency-details';
import { buildGuidedPAResidencySources } from '@/lib/guided-pa-residency-facts';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import type { TaxYearInput } from '@/models/inputs';
import { PAResidencySourcesSchema, type PAResidencySources } from '@/models/pa-residency';
import { paOrdinaryInvestmentFixture } from '../../fixtures/pa-ordinary-investment-sources';
import { mountGuidedPanel } from './guided-panel-dom';

type Panel = Awaited<ReturnType<typeof mountGuidedPanel>>;
const confirm = 'Confirm all actual PA source records after the last edit';

async function mount(input: TaxYearInput, initial?: PAResidencySources) {
  let saved = initial;
  const changes: (PAResidencySources | undefined)[] = [];
  function Harness() {
    const [sources, setSources] = useState(initial);
    return <PAResidencyDetails originalInput={input} data={sources} onChange={next => {
      changes.push(next);
      saved = next;
      setSources(next);
    }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  return {
    panel,
    changes,
    draft() {
      if (!saved) throw new Error('Expected a retained PA residency draft');
      return saved;
    },
    canonical: () => buildGuidedPAResidencySources(input, saved),
  };
}

async function enter(panel: Panel, fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) await panel.change(label, value);
}

async function enterResidence(panel: Panel, records: PAResidencySources) {
  const r = records.residency;
  await enter(panel, {
    'PA source tax year': '2025',
    'PA original source reference': records.sourceReference,
    'Actual owner of this PA return': 'primary',
    'Residency status supported by actual records': r.status,
    'Domicile, permanent-home and presence source reference': r.sourceReference,
  });
  for (const [index, period] of r.domicilePeriods.entries()) {
    const label = 'Domicile ' + (index + 1);
    await panel.click('Add actual domicile period');
    await enter(panel, {
      [label + ' first date']: period.from,
      [label + ' last date']: period.through,
      [label + ' actual state code']: period.state,
      [label + ' actual PA presence days']: String(period.daysInPA),
    });
  }
  for (const [label, periods] of [
    ['PA permanent home', r.paPermanentAbodePeriods],
    ['Outside-PA permanent home', r.outsidePAPermanentAbodePeriods],
  ] as const) {
    for (const [index, period] of periods.entries()) {
      await panel.click('Add ' + label);
      await panel.change(label + ' ' + (index + 1) + ' first date', period.from);
      await panel.change(label + ' ' + (index + 1) + ' last date', period.through);
    }
  }
  await enter(panel, {
    'All actual domicile, permanent-home and presence periods are included': 'true',
    'An actual move abandoned the old domicile and established the new domicile with physical presence':
      String(r.moveAbandonmentNewDomicileAndPresenceConfirmed),
    'Actual December 31 principal-residence state': r.dec31PrincipalResidenceState,
    'December 31 school district code (99999 only for actual outside-PA residence)': r.schoolDistrictCode,
    'Actual school district name or non-PA residence': r.schoolDistrictName,
  });
}

async function enterPayroll(panel: Panel, payroll: PAResidencySources['wages'][number]) {
  await panel.click('Add actual W-2 source');
  await enter(panel, {
    'Payroll 1 entered W-2 original': '0',
    'Payroll 1 original tax year': '2025',
    'Payroll 1 original reference': payroll.sourceReference,
    'Payroll 1: Current-year ordinary cash services only': 'true',
    'Payroll 1: Actual source establishes no PA/federal compensation differences': 'true',
    'Payroll 1: Actual final original is uncorrected, nonvoid and not a duplicate': 'true',
    'Payroll 1: Every original box has been checked, including actual zero or blank boxes': 'true',
    'Payroll 1: Original facts checked': 'true',
  });
  for (const [index, segment] of payroll.payroll.entries()) {
    const label = 'Payroll 1 segment ' + (index + 1);
    await panel.click('Add actual payroll segment 1');
    await enter(panel, {
      [label + ' actual record reference']: segment.sourceReference,
      [label + ' actual paid date']: segment.paidOn,
      [label + ' service first date']: segment.serviceFrom,
      [label + ' service last date']: segment.serviceThrough,
      [label + ' actual gross']: segment.grossCompensation,
      [label + ' actual PA services gross']: segment.paServicesCompensation,
      [label + ' actual outside-PA services gross']: segment.outsidePAServicesCompensation,
    });
  }
}

async function enterBank(panel: Panel, bank: PAResidencySources['interest'][number]) {
  await panel.click('Add actual bank-interest source');
  await enter(panel, {
    'Bank 1 entered original': '0',
    'Bank 1 original tax year': '2025',
    'Bank 1 original reference': bank.sourceReference,
    'Bank 1: Actual ordinary personal bank interest, not business-source interest': 'true',
    'Bank 1: Actual final original is uncorrected, nonvoid and not a duplicate': 'true',
    'Bank 1: Every original box has been checked, including actual zero or blank boxes': 'true',
    'Bank 1: Original facts checked': 'true',
  });
  for (const [index, credit] of bank.credits.entries()) {
    const label = 'Bank 1 credit ' + (index + 1);
    await panel.click('Add actual bank credit 1');
    await enter(panel, {
      [label + ' record reference']: credit.sourceReference,
      [label + ' actual date']: credit.creditedOn,
      [label + ' actual amount']: credit.amount,
    });
  }
}

async function enterFund(panel: Panel, fund: NonNullable<PAResidencySources['dividends']>[number]) {
  await panel.click('Add actual dividend source');
  await enter(panel, {
    'Dividend 1 entered 1099-DIV original': '0',
    'Dividend 1 original tax year': '2025',
    'Dividend 1 original reference': fund.sourceReference,
    'Dividend 1: Ordinary personal investment dividends only': 'true',
    'Dividend 1: Capital gain distributions are from a regulated investment company': 'true',
    'Dividend 1: No other PA dividend adjustments in these actual records': 'true',
    'Dividend 1: Actual final original is uncorrected, nonvoid and not a duplicate': 'true',
    'Dividend 1: Every original box has been checked, including actual zero or blank boxes': 'true',
  });
  for (const [index, credit] of fund.credits.entries()) {
    const label = 'Dividend 1 credit ' + (index + 1);
    await panel.click('Add actual dividend credit 1');
    await enter(panel, {
      [label + ' record reference']: credit.sourceReference,
      [label + ' actual date']: credit.creditedOn,
      [label + ' actual ordinary dividends']: credit.ordinaryDividends,
      [label + ' actual capital gain distributions']: credit.capitalGainDistributions,
    });
  }
  await panel.change('Dividend 1: Original facts checked', 'true');
}

it('Native part-year entry allocates payroll and dated investments on the PA return', async () => {
  const { input, residency, facts, sources } = paOrdinaryInvestmentFixture('part_year');
  const original = PAResidencySourcesSchema.parse(residency);
  const h = await mount(input);
  try {
    await h.panel.click('Add Pennsylvania residency sources');
    expect(h.draft().owner.originalTaxpayer).toBeUndefined();
    expect(h.draft().sourceTaxYear).toBeNull();
    await enterResidence(h.panel, original);
    await enterPayroll(h.panel, original.wages[0]);
    await enterBank(h.panel, original.interest[0]);
    const fund = original.dividends?.[0];
    if (!fund) throw new Error('The part-year original must include the actual fund statement');
    await enterFund(h.panel, fund);
    await h.panel.change('Actual records establish no other PA income classes in this ordinary source packet', 'true');
    await h.panel.change('Actual records establish no other PA taxable-income adjustments in this source packet', 'true');
    expect(h.canonical).toThrow(/confirm/i);
    await h.panel.click(confirm);
    const canonical = h.canonical();
    expect(canonical.wages[0].original).toEqual(input.w2s[0]);
    expect(canonical.interest[0].original).toEqual(input.form1099Int[0]);
    expect(canonical.dividends?.[0].original).toEqual(input.form1099Div[0]);
    const income = calculatePAResidencySources(input, canonical);
    expect(income.schoolDistrictCode).toBe('02745');
    expect(input.taxpayer.address.state).toBe('NY');
    expect(income.compensation.toFixed()).toBe('26000');
    expect(income.interest.toFixed()).toBe('40');
    expect(income.dividends.toFixed()).toBe('1300');
    expect(income.excludedNonPACompensation.toFixed()).toBe('24000');
    expect(income.excludedNonPAInterest.toFixed()).toBe('80');
    expect(income.excludedNonPADividends.toFixed()).toBe('1200');
    const result = calculatePAOrdinaryReturn({ ...input, paResidencySources: canonical }, facts, sources);
    expect(result.pa40.totalPATaxableIncome.toFixed()).toBe('27340');
    expect(result.pa40.taxLiability.toFixed()).toBe('839');
    expect(result.pa40.taxDue.toFixed()).toBe('40');
    expect(result.readiness.filingEligible).toBe(false);
  } finally { await h.panel.dispose(); }
});

it('Native dated credit edits change residency allocation without changing the annual original', async () => {
  const { input, residency } = paOrdinaryInvestmentFixture('part_year');
  const h = await mount(input, PAResidencySourcesSchema.parse(residency));
  let stored: PAResidencySources;
  try {
    await h.panel.change('Bank 1 credit 2 actual date', '2025-06-30');
    await h.panel.change('Dividend 1 credit 1 actual date', '2025-07-01');
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    expect(h.draft().dividends?.[0].sourceFactsConfirmed).toBeNull();
    expect(h.draft().dividends?.[0].original).toEqual(input.form1099Div[0]);
    await h.panel.click(confirm);
    expect(h.canonical).toThrow(/confirm/i);
    await h.panel.change('Dividend 1: Original facts checked', 'true');
    await h.panel.click(confirm);
    const result = calculatePAResidencySources(input, h.canonical());
    expect(result.interest.toFixed()).toBe('0');
    expect(result.excludedNonPAInterest.toFixed()).toBe('120');
    expect(result.dividends.toFixed()).toBe('2500');
    expect(result.excludedNonPADividends.toFixed()).toBe('0');
    expect(result.totalOrdinaryPATaxableIncome.toFixed()).toBe('28500');
    expect(result.taxBeforeCredits.toFixed()).toBe('875');
    stored = JSON.parse(JSON.stringify(h.draft()));
  } finally { await h.panel.dispose(); }
  const reopened = await mount(input, stored);
  try {
    expect(reopened.changes).toHaveLength(0);
    expect(reopened.canonical()).toEqual(stored);
    expect(reopened.panel.control('Bank 1 credit 2 actual date').value).toBe('2025-06-30');
    expect(reopened.panel.control('Dividend 1 credit 1 actual date').value).toBe('2025-07-01');
  } finally { await reopened.panel.dispose(); }
});

it('Native missing records and explicit zero have different residency consequences', async () => {
  const { input, residency } = paOrdinaryInvestmentFixture('part_year');
  const h = await mount(input, PAResidencySourcesSchema.parse(residency));
  try {
    await h.panel.change('Domicile 1 actual PA presence days', '');
    expect(h.draft().residency.domicilePeriods[0].daysInPA).toBeNull();
    await h.panel.click(confirm);
    expect(h.canonical).toThrow(/confirm/i);
    await h.panel.change('Domicile 1 actual PA presence days', '20');
    await h.panel.change('Payroll 1 segment 2 actual PA services gross', '');
    await h.panel.click(confirm);
    expect(h.draft().wages[0].payroll[1].paServicesCompensation).toBe('');
    expect(h.canonical).toThrow(/confirm/i);
    await h.panel.change('Payroll 1 segment 2 actual PA services gross', '0');
    await h.panel.click(confirm);
    expect(calculatePAResidencySources(input, h.canonical()).compensation.toFixed()).toBe('26000');

    await h.panel.click('Add actual bank-interest source');
    await h.panel.change('Bank 2 entered original', '0');
    await h.panel.click(confirm);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    await h.panel.click('Remove bank source 2');
    await h.panel.click(confirm);
    expect(h.canonical().interest).toHaveLength(1);

    await h.panel.click('Remove Payroll 1 segment 1');
    await h.panel.click(confirm);
    expect(h.canonical).toThrow(/confirm/i);
    await h.panel.click('Remove payroll source 1');
    expect(h.draft().interest[0].credits).toEqual(residency.interest[0].credits);
    await h.panel.click('Remove domicile period 1');
    await h.panel.click('Remove Outside-PA permanent home 1');
    await h.panel.click(confirm);
    expect(h.canonical).toThrow(/confirm/i);
    expect(h.draft().residency.domicilePeriods.map(p => p.state)).toEqual(['PA']);
  } finally { await h.panel.dispose(); }
});

it('Native residency reopening retains snapshots without exposing private identifiers', async () => {
  const { input, residency } = paOrdinaryInvestmentFixture('part_year');
  const saved = PAResidencySourcesSchema.parse(JSON.parse(JSON.stringify(residency)));
  const changed = structuredClone(input);
  changed.form1099Int[0].payerTin = '98-7654301';
  const h = await mount(changed, saved);
  try {
    const before = JSON.stringify(saved);
    expect(h.canonical).toThrow(/original|snapshot|stale/i);
    expect(h.changes).toHaveLength(0);
    expect(JSON.stringify(h.draft())).toBe(before);

    const publicAudit = JSON.stringify(calculatePAResidencySources(input, saved).lines);
    const markup = h.panel.container.innerHTML;
    for (const privateValue of [input.taxpayer.primary.ssn, input.w2s[0].employer.ein,
      input.form1099Int[0].payerTin, changed.form1099Int[0].payerTin, input.form1099Div[0].payerTin]) {
      expect(markup).not.toContain(privateValue);
      expect(publicAudit).not.toContain(privateValue);
    }
    expect(h.panel.container.querySelector('textarea, input[type="hidden"]')).toBeNull();
    await h.panel.click('Remove bank 1 credit 1');
    await h.panel.click(confirm);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    expect(h.draft().interest[0].original).toEqual(input.form1099Int[0]);
    await h.panel.click('Remove dividend 1 credit 1');
    expect(h.draft().dividends?.[0].sourceFactsConfirmed).toBeNull();
    await h.panel.click('Remove dividend source 1');
    expect(h.draft().dividends).toEqual([]);
    await h.panel.click(confirm);
    expect(h.canonical).toThrow(/confirm/i);
  } finally { await h.panel.dispose(); }
});
