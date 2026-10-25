// Spec: spec/federal/foreign-tax-direct-credit.yaml.
import { describe, expect, it } from 'vitest';
import { ForeignTaxElectionSchema, ScheduleK1Schema, TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { resolveForeignTaxDirectSources } from '@/engine/forms/foreign-tax-direct-sources.js';
import { calculateForeignTaxDirectCredit } from '@/engine/forms/foreign-tax-direct-credit.js';
import { resolveForeignTaxElection } from '@/engine/forms/foreign-tax-election.js';
import { foreignTaxDirectCreditFixture } from '../../fixtures/foreign-tax-direct-credit.js';

type Fixture = ReturnType<typeof foreignTaxDirectCreditFixture>;
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing explicit synthetic source fixture');
  return value;
}
const annual = (input: Fixture) => required(input.foreignTaxElection);
const direct = (input: Fixture) => required(annual(input).creditWithoutForm1116);
const sources = (input: Fixture) => required(annual(input).sources);
const firstSource = (input: Fixture) => required(sources(input)[0]);
const saved = (input: Fixture) => required(input.priorYear);

describe('Actual elected credit without Form1116', () => {
  it('requires actual election eligibility and source facts without defaults', () => {
    const unknown = ForeignTaxElectionSchema.parse({ creditWithoutForm1116: {}, sources: [{ creditEligibility: {} }] });
    expect(unknown.creditWithoutForm1116?.electionConfirmed).toBeUndefined();
    expect(unknown.creditWithoutForm1116?.carryovers).toBeUndefined();
    expect(unknown.sources?.[0]?.creditEligibility?.holdingPeriodRequirementMetConfirmed).toBeUndefined();
    const base = foreignTaxDirectCreditFixture();
    const result = resolveForeignTaxElection(base);
    expect(result.sourceFactsVerified).toBe(true);
    expect(result.directCreditSources?.currentTaxExact.toFixed()).toBe('200.25');
    for (const key of ['electionConfirmed', 'allForeignGrossIncomePassiveConfirmed', 'allForeignIncomeOnQualifiedPayeeStatementsConfirmed',
      'noRequiredTaxReductionsConfirmed', 'sourceFactsConfirmed', 'carryoverHistoryConfirmed'] as const) {
      for (const value of [undefined, false]) {
        const input = structuredClone(base);
        direct(input)[key] = value;
        expect(() => resolveForeignTaxDirectSources(input)).toThrow(/actual|confirm|election|history/i);
      }
    }
  });
  it('rejects stale inconsistent and unsupported direct credit sources', () => {
    const changes = [
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { x.form1099Int[0].accountReference = 'Replacement account'; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { firstSource(x).owner = 'spouse'; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { firstSource(x).payerTin = '998887777'; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { firstSource(x).foreignCountry = 'France'; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { required(firstSource(x).payments)[0].date = '2025-02-29'; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { firstSource(x).taxDeductedElsewhere = '1'; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { firstSource(x).taxOnExcludedIncome = '1'; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { required(firstSource(x).creditEligibility).holdingPeriodRequirementMetConfirmed = false; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { annual(x).sources = []; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { sources(x).push(structuredClone(firstSource(x))); },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { direct(x).filingContext = 'amended_return'; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { direct(x).taxpayers = []; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { required(x.standardDeductionFacts).nonresidentAlien = true; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { annual(x).priorAccruedCreditElection = true; },
      (x: ReturnType<typeof foreignTaxDirectCreditFixture>) => { firstSource(x).reportedTaxAmount = '200.24'; },
    ];
    for (const change of changes) { const input = foreignTaxDirectCreditFixture(); change(input); expect(() => resolveForeignTaxDirectSources(input)).toThrow(); }
  });
  it('applies exact joint-only thresholds before combined reporting rounding', () => {
    for (const [status, tax, accepted] of [
      ['single', '300', true], ['single', '300.01', false], ['qualifying_surviving_spouse', '300.01', false],
      ['married_filing_jointly', '600', true], ['married_filing_jointly', '600.01', false],
    ] as const) {
      const input = foreignTaxDirectCreditFixture(); input.taxpayer.filingStatus = status;
      input.form1099Int[0].foreignTaxPaid = tax;
      firstSource(input).reportedTaxAmount = tax;
      required(firstSource(input).payments)[0].amountUsd = tax;
      if (status === 'married_filing_jointly') {
        required(direct(input).taxpayers).push({ owner: 'spouse', status: 'full_year_resident_alien', sourceReference: 'Actual synthetic spouse status' });
        direct(input).filingHistory = 'continuous_joint_same_spouse';
      }
      if (!accepted) expect(() => resolveForeignTaxDirectSources(input)).toThrow(/300|600|threshold/i);
      else expect(calculateForeignTaxDirectCredit(resolveForeignTaxDirectSources(input), d('1000')).creditAllowed.toFixed()).toBe(tax);
    }
    const input = foreignTaxDirectCreditFixture();
    input.form1099Int.push({ ...input.form1099Int[0], accountReference: 'Private account B', foreignTaxPaid: '99.25' });
    sources(input).push({ ...structuredClone(firstSource(input)), sourceId: 'form1099Int:1', accountReference: 'Private account B',
      reportedTaxAmount: '99.25', payments: [{ date: '2025-10-01', amountUsd: '99.25' }] });
    const result = calculateForeignTaxDirectCredit(resolveForeignTaxDirectSources(input), d('1000'));
    expect(result.currentTaxExact.toFixed()).toBe('299.5');
    expect(result.creditAllowed.toFixed()).toBe('300'); // Combine cents first; never round200.25 and99.25 separately.
  });
  it('uses actual regular tax without a foreign income ratio or current carry creation', () => {
    const input = foreignTaxDirectCreditFixture(); const before = JSON.stringify(input);
    const result = calculateForeignTaxDirectCredit(resolveForeignTaxDirectSources(input), d('73'));
    expect(result.creditAllowed.toFixed()).toBe('73');
    expect(result.currentTaxUncredited.toFixed()).toBe('127');
    expect(result.carryforward.toFixed()).toBe('0');
    expect(result.lines.find(line => line.line === 'current-carry-created')?.value.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
    const audits = JSON.stringify(result.lines);
    for (const privateValue of ['Private synthetic', '112233445', 'Synthetic investment bank']) expect(audits).not.toContain(privateValue);
    expect(() => calculateForeignTaxDirectCredit(resolveForeignTaxDirectSources(input), d('-1'))).toThrow(/regular tax/i);
  });
  it('preserves actual prior regular and AMT vintages without use and expires the tenth year', () => {
    const input = foreignTaxDirectCreditFixture();
    annual(input).noUnusedCreditCarryoversConfirmed = false;
    direct(input).carryovers = [
      { originTaxYear: 2015, category: 'passive', amount: '10.25', sourceReference: 'Actual last-year source' },
      { originTaxYear: 2024, category: 'passive', amount: '90.50', sourceReference: 'Actual recent source' },
      { originTaxYear: 2024, category: 'general', amount: '20.25', sourceReference: 'Actual general source' },
    ];
    direct(input).amtCarryovers = [
      { originTaxYear: 2015, category: 'general', amount: '3.25', sourceReference: 'Actual AMT source' },
      { originTaxYear: 2024, category: 'passive', amount: '6.50', sourceReference: 'Actual AMT source' },
    ];
    const result = calculateForeignTaxDirectCredit(resolveForeignTaxDirectSources(input), d('10000'));
    expect(result.creditAllowed.toFixed()).toBe('200');
    expect(result.expired.toFixed()).toBe('10.25'); expect(result.carryforward.toFixed()).toBe('110.75');
    expect(result.amtExpired.toFixed()).toBe('3.25'); expect(result.amtCarryforward.toFixed()).toBe('6.5');
    expect(result.details.every(row => row.used.isZero())).toBe(true);
    expect(result.amtDetails.every(row => row.used.isZero())).toBe(true);
    direct(input).adjustedThroughTaxYear = 2023;
    expect(() => resolveForeignTaxDirectSources(input)).toThrow(/history|prior year/i);
  });
  it('reconciles actual saved carryovers and rejects unresolved source histories', () => {
    const unsupported = foreignTaxDirectCreditFixture();
    unsupported.scheduleK1 = [ScheduleK1Schema.parse({ partnershipName: 'Actual synthetic partnership', partnershipEIN: '112233445',
      ordinaryIncome: '0', foreignSourceIncome: '-1' })];
    expect(() => resolveForeignTaxDirectSources(unsupported)).toThrow(/pass-through|foreign sources/i);
    const base = foreignTaxDirectCreditFixture();
    const input = TaxYearInputSchema.parse({ ...base, foreignTaxElection: { ...base.foreignTaxElection,
      noUnusedCreditCarryoversConfirmed: false, creditWithoutForm1116: { ...base.foreignTaxElection?.creditWithoutForm1116,
        carryovers: [{ originTaxYear: 2024, category: 'passive', amount: '20.25', sourceReference: 'Actual regular balance' }],
        amtCarryovers: [{ originTaxYear: 2024, category: 'passive', amount: '10.25', sourceReference: 'Actual AMT balance' }],
      } }, priorYear: { foreignTaxCreditCarryforward: '20.25', foreignTaxCreditCarryforwardByYear: [{ taxYear: 2024, amount: '20.25' }],
        foreignTaxCreditCarryforwardByCategory: { passive: [{ taxYear: 2024, amount: '20.25' }], general: [] },
        amtForeignTaxCreditCarryforwardByCategory: { passive: [{ taxYear: 2024, amount: '10.25' }], general: [] } } });
    expect(input.priorYear).toHaveProperty('amtForeignTaxCreditCarryforwardByCategory.passive.0.amount', '10.25');
    expect(() => resolveForeignTaxElection({ ...input, foreignTaxElection: undefined })).toThrow(/AMT.*carry|carry.*AMT/i);
    expect(calculateForeignTaxDirectCredit(resolveForeignTaxDirectSources(input), d('1000')).amtCarryforward.toFixed()).toBe('10.25');
    const invalid = [
      (x: typeof input) => { direct(x).amtCarryovers = undefined; },
      (x: typeof input) => { required(direct(x).amtCarryovers)[0].amount = '10.24'; },
      (x: typeof input) => { required(direct(x).carryovers).push(structuredClone(required(direct(x).carryovers)[0])); },
      (x: typeof input) => { required(direct(x).carryovers)[0].originTaxYear = 2014; },
      (x: typeof input) => { required(direct(x).carryovers)[0].originTaxYear = 2025; },
      (x: typeof input) => { direct(x).filingHistory = 'changed'; },
      (x: typeof input) => { saved(x).foreignTaxCreditCarryforward = '20.24'; },
      (x: typeof input) => { saved(x).foreignTaxCreditCarryforwardByYear[0].taxYear = 2023; },
      (x: typeof input) => { required(saved(x).foreignTaxCreditCarryforwardByCategory).passive = []; },
    ];
    for (const change of invalid) { const changed = structuredClone(input); change(changed); expect(() => resolveForeignTaxDirectSources(changed)).toThrow(/carryover|history|year|balance/i); }
  });
});
