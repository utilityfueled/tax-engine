// Spec: spec/federal/k1-cash-distribution-gain.yaml
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { k1CashDistributionFixture, cashDistributionSource } from '../../fixtures/k1-cash-distribution.js';
import { charitableStatement, k1CharitableReturnFixture } from '../../fixtures/k1-charitable-return.js';
function result(input: ReturnType<typeof k1CashDistributionFixture>) {
  const result = calculateK1CharitableReturnSources(input)?.statements[0];
  if (!result) throw Error('Missing source result');
  return result;
}
it('derives partnership excess from actual cash and original basis without recycling gain', () => {
  const input = k1CashDistributionFixture(), original = JSON.stringify(input), r = result(input);
  expect(r.distributionGain?.gain.toFixed()).toBe('1');
  expect(r.distributionGain?.basisBeforeDistribution.toFixed()).toBe('30');
  expect(r.basis.endingBasis.toFixed()).toBe('0');
  expect(r.basis.charitableSources?.availableAfterBasis.capital_gain_30.toFixed()).toBe('100');
  expect(r.basis.charitableSources?.basisSuspended.toFixed()).toBe('50');
  expect(JSON.stringify(input)).toBe(original);
  input.scheduleK1[0].interestIncome = '10'; input.scheduleK1[0].form6198!.otherIncomeGains = '10';
  input.scheduleK1[0].distributions = '41'; cashDistributionSource(input).cashAmount = '41';
  input.scheduleK1[0].form6198!.currentYearDecreases = '41'; charitableStatement(input).atRisk!.currentYearDecreases = '41';
  const increased = result(input);
  expect(increased.distributionGain?.basisBeforeDistribution.toFixed()).toBe('40');
  expect(increased.distributionGain?.gain.toFixed()).toBe('1');
  expect(increased.basis.totalIncomeItems.toFixed()).toBe('10');
  // Published cash-only arithmetic in Reg1.731-1(a)(1)(i); the remaining
  // fictional charity/identity records only satisfy the source contract.
  const published = k1CashDistributionFixture(), k = published.scheduleK1[0];
  k.beginningBasis = '10000'; k.distributions = '11000'; cashDistributionSource(published).cashAmount = '11000';
  k.form6198!.gainLossFromDispositions = '1000'; k.form6198!.currentYearDecreases = '11000';
  charitableStatement(published).atRisk!.currentYearDecreases = '11000';
  expect(result(published).distributionGain?.gain.toFixed()).toBe('1000');
});
it('uses annual stock income and excludes debt from S corporation distributions', () => {
  const input = k1CashDistributionFixture(2025, true), r = result(input);
  expect(r.distributionGain?.gain.toFixed()).toBe('1');
  expect(r.basis.endingBasis.toFixed()).toBe('0');
  expect(r.basis.debtBasis?.endingDebtBasis.toFixed()).toBe('50');
  expect(r.basis.charitableSources?.availableAfterBasis.capital_gain_30.toFixed()).toBe('150');
  input.scheduleK1[0].interestIncome = '10'; input.scheduleK1[0].form6198!.otherIncomeGains = '10';
  cashDistributionSource(input).distributionDate = '2025-03-01';
  input.scheduleK1[0].form6198!.gainLossFromDispositions = '0';
  expect(result(input).distributionGain?.gain.toFixed()).toBe('0');
  expect(result(input).distributionGain?.basisBeforeDistribution.toFixed()).toBe('40');
});
it('uses actual acquisition anniversaries and preserves unknown holding sources', () => {
  const input = k1CashDistributionFixture(), source = cashDistributionSource(input);
  source.acquisitionDate = '2024-12-31';
  expect(result(input).distributionGain?.holdingPeriod).toBe('short');
  source.acquisitionDate = '2024-12-30';
  expect(result(input).distributionGain?.holdingPeriod).toBe('long');
  const s = k1CashDistributionFixture(2025, true), ss = cashDistributionSource(s);
  ss.acquisitionDate = '2024-02-29'; ss.distributionDate = '2025-02-28';
  expect(result(s).distributionGain?.holdingPeriod).toBe('short');
  ss.distributionDate = '2025-03-01'; expect(result(s).distributionGain?.holdingPeriod).toBe('long');
  delete ss.acquisitionDate; expect(() => result(s)).toThrow(/acquisition date/);
});
it('requires original single-activity evidence for the owner gain', () => {
  const original = k1CashDistributionFixture();
  for (const change of [
    (x: typeof original) => { delete cashDistributionSource(x).sameSingleAtRiskActivityConfirmed; },
    (x: typeof original) => { cashDistributionSource(x).sameSingleAtRiskActivityConfirmed = false; },
    (x: typeof original) => { cashDistributionSource(x).atRiskSourceReference = 'A different activity source'; },
    (x: typeof original) => { delete cashDistributionSource(x).atRiskGainItemSourceReference; },
    (x: typeof original) => { x.scheduleK1[0].form6198!.gainLossFromDispositions = '0'; },
  ]) { const input = structuredClone(original); change(input); expect(() => result(input)).toThrow(/activity|at-risk|gain item/); }
});
it('rejects missing conflicting and unsupported original distribution facts', () => {
  const original = k1CashDistributionFixture();
  const changes: Array<(input: typeof original) => void> = [
    x => { delete charitableStatement(x).cashDistribution; },
    x => { cashDistributionSource(x).cashAmount = '31.01'; },
    x => { cashDistributionSource(x).sourceTaxYear = 2024; },
    x => { cashDistributionSource(x).originalBox = '16'; },
    x => { cashDistributionSource(x).distributionDate = '2025-12-30'; },
    x => { cashDistributionSource(x).acquisitionDate = '2025-01-01'; },
    x => { cashDistributionSource(x).acquisitionMethod = 'other'; },
    x => { cashDistributionSource(x).singleUnchangedBlockConfirmed = false; },
    x => { cashDistributionSource(x).noHotAssetExchangeConfirmed = false; },
    x => { cashDistributionSource(x).noMarketableSecuritiesOrLiabilityMoneyConfirmed = false; },
    x => { cashDistributionSource(x).noOtherReportingConfirmed = false; },
    x => { cashDistributionSource(x).nonliquidatingConfirmed = false; },
    x => { cashDistributionSource(x).activityCharacter = 'single_passive_business'; },
    x => { x.scheduleK1[0].isPassiveActivity = true; },
    x => { x.scheduleK1[0].ordinaryIncome = '1'; x.scheduleK1[0].form6198!.ordinaryIncome = '1'; },
    x => { charitableStatement(x).basis!.recipientTaxpayerIdLast4 = '0000'; },
  ];
  for (const change of changes) { const input = structuredClone(original); change(input); expect(() => result(input)).toThrow(/distribution|identity|holding|portfolio/i); }
  const s = k1CashDistributionFixture(2025, true); delete cashDistributionSource(s).noAccumulatedEarningsAndProfitsConfirmed;
  expect(() => result(s)).toThrow(/earnings|distribution/i);
  const fabricated = structuredClone(original);
  Object.assign(cashDistributionSource(fabricated), { gain: '0' });
  expect(TaxYearInputSchema.safeParse(fabricated).success).toBe(false);
  expect(result(k1CharitableReturnFixture()).distributionGain).toBeUndefined();
});
