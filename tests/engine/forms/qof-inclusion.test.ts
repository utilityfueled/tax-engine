// Spec: spec/federal/qof-deferred-gain-inclusion.yaml.
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateQofInclusion, type QofInclusionInput } from '@/engine/forms/qof-inclusion.js';
import { qofInvestment, qofFacts } from '../../fixtures/qof-inclusion.js';

const run = (investment: ReturnType<typeof qofInvestment>, taxYear = 2026) => calculateQofInclusion({ taxpayer: { taxYear }, qofDispositionFacts: qofFacts(taxYear, [investment], investment.event === 'sale_or_exchange') } as QofInclusionInput);
const amount = (patch: Parameters<typeof qofInvestment>[0]) => run(qofInvestment(patch))!.rows[0]!;

describe('QOF deferred gain inclusion', () => {
  it('reproduces the published partnership inclusion', () => {
    const partner = (deferred: string) => amount({ interestType: 'partnership_or_s_corporation', originalDeferredGain: deferred, remainingDeferredGain: deferred,
      investmentDate: '2019-01-01', fairMarketValue: undefined, fullyTaxableDispositionGain: '100000' });
    expect(partner('200').basisIncrease.toFixed()).toBe('30');
    expect(partner('200').includedGain.toFixed()).toBe('170');
    expect(partner('600').basisIncrease.toFixed()).toBe('90');
    expect(partner('600').includedGain.toFixed()).toBe('510');
  });

  it('applies each basis increase on the exact holding boundary', () => {
    for (const [investmentDate, increase, included] of [['2022-01-01', '0', '100000'], ['2021-12-31', '10000', '90000'],
      ['2020-01-01', '10000', '90000'], ['2019-12-31', '15000', '85000']] as const) {
      const row = amount({ investmentDate, fairMarketValue: '120000' });
      expect(row.basisIncrease.toFixed()).toBe(increase);
      expect(row.includedGain.toFixed()).toBe(included);
    }
  });

  it('applies the lesser-of limits by interest type', () => {
    for (const [fairMarketValue, included] of [['40000', '30000'], ['10000', '0'], ['5000', '0']] as const) {
      expect(amount({ fairMarketValue }).includedGain.toFixed()).toBe(included);
    }
    for (const [fullyTaxableDispositionGain, included] of [['50000', '50000'], ['95000', '90000'], ['-1000', '0']] as const) {
      expect(amount({ interestType: 'partnership_or_s_corporation', fairMarketValue: undefined, fullyTaxableDispositionGain }).includedGain.toFixed()).toBe(included);
    }
    expect(amount({ originalDeferredGain: '100000.37', remainingDeferredGain: '100000.37', investmentDate: '2022-06-30', fairMarketValue: '120000' }).includedGain.toFixed()).toBe('100000.37');
  });

  it('reports a complete sale on one code Y row', () => {
    const investment = qofInvestment({ event: 'sale_or_exchange', eventDate: '2025-06-30', investmentDate: '2020-03-01', fairMarketValue: '130000', proceeds: '130000', basisBeforeInclusion: '0' });
    const result = run(investment, 2025)!, row = result.rows[0]!;
    expect(row.includedGain.toFixed()).toBe('90000');
    expect(row.basisIncrease.toFixed()).toBe('10000');
    expect(result.transactions).toEqual([expect.objectContaining({ dateSold: '2025-06-30', proceeds: '130000', costBasis: '100000', adjustments: '90000',
      holdingPeriod: 'long', qofInclusion: true, sourceDocumentType: 'not-reported', basisReportedToIRS: false })]);
    const transaction = result.transactions[0]!;
    expect(new Decimal(transaction.proceeds).minus(transaction.costBasis).plus(transaction.adjustments!).toFixed()).toBe('120000');
  });

  it('requires an actual year-end answer for 2026', () => {
    const input = (patch: object, rows: ReturnType<typeof qofInvestment>[] = []) => ({ taxpayer: { taxYear: 2026 }, qofDispositionFacts: { ...qofFacts(2026, rows, false), ...patch } }) as QofInclusionInput;
    expect(() => calculateQofInclusion(input({ deferredGainHeldAtYearEnd: undefined }))).toThrow(/year-end/);
    expect(() => calculateQofInclusion(input({ deferredGainHeldAtYearEnd: true }))).toThrow(/year-end/);
    expect(() => calculateQofInclusion(input({ deferredGainHeldAtYearEnd: false }, [qofInvestment({})]))).toThrow(/year-end/);
    expect(calculateQofInclusion(input({ deferredGainHeldAtYearEnd: false }))).toBeUndefined();
  });

  it('rejects missing facts and methods outside the bounded route', () => {
    for (const [patch, message] of [
      [{ remainingDeferredGain: '' }, /remaining deferred gain/], [{ originalDeferredGain: ' ' }, /original deferred gain/], [{ remainingDeferredGain: '-1' }, /remaining deferred gain/],
      [{ remainingDeferredGain: '100001' }, /cannot exceed/], [{ fairMarketValue: undefined }, /fair market value/], [{ fairMarketValue: '-1' }, /fair market value/],
      [{ sourceFactsConfirmed: false }, /confirmed original record/], [{ sourceReference: '' }, /confirmed original record/], [{ qofEin: '12345' }, /fund EIN/],
      [{ investmentDate: 'unknown' }, /actual investment and event dates/], [{ investmentDate: '2021-02-31' }, /actual investment and event dates/],
      [{ investmentDate: '2017-12-21' }, /predates/], [{ eventDate: '2026-12-30' }, /must use December 31/], [{ entireInvestment: false }, /partial dispositions/],
      [{ event: 'gift' }, /other inclusion events/], [{ gainCharacter: 'collectibles' }, /special gain attributes/], [{ interestType: undefined }, /interest type/],
      [{ noSpecialGainCode: undefined }, /special gain code/], [{ noSpecialGainCode: false }, /special gain code/],
    ] as const) expect(() => run(qofInvestment(patch)), JSON.stringify(patch)).toThrow(message);
    expect(() => run(qofInvestment({ interestType: 'partnership_or_s_corporation', fairMarketValue: undefined }))).toThrow(/fully taxable disposition/);
    expect(() => run(qofInvestment({}), 2025)).toThrow(/return year/);
    expect(() => run(qofInvestment({ eventDate: '2027-12-31' }), 2027)).toThrow(/unavailable for this return year/);
    const sale = { event: 'sale_or_exchange', eventDate: '2026-06-30', proceeds: '130000', basisBeforeInclusion: '0', fairMarketValue: '130000' };
    expect(() => run(qofInvestment({ ...sale, investmentDate: '2026-02-01' }))).toThrow(/sale term/);
    expect(() => run(qofInvestment({ ...sale, investmentDate: '2025-06-30' }))).toThrow(/sale term/);
    expect(run(qofInvestment({ ...sale, investmentDate: '2025-06-29' }))!.transactions[0]!.holdingPeriod).toBe('long');
    const partnership = { ...sale, interestType: 'partnership_or_s_corporation', fairMarketValue: undefined, fullyTaxableDispositionGain: '30000', investmentDate: '2021-06-30' };
    expect(() => run(qofInvestment(partnership))).toThrow(/look-through/);
    expect(run(qofInvestment({ ...partnership, saleGainAllCapitalConfirmed: true }))!.rows[0]!.includedGain.toFixed()).toBe('30000');
    const twice = qofInvestment({});
    expect(() => calculateQofInclusion({ taxpayer: { taxYear: 2026 }, qofDispositionFacts: qofFacts(2026, [twice, twice], false) } as QofInclusionInput)).toThrow(/distinct/);
    expect(amount({ fairMarketValue: '0' }).includedGain.toFixed()).toBe('0');
    const cents = amount({ originalDeferredGain: '100000.37', remainingDeferredGain: '100000.37' });
    expect([cents.basisIncrease.toFixed(), cents.includedGain.toFixed()]).toEqual(['10000.04', '90000.33']);
  });
});
