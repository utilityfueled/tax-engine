import { describe, expect, it } from 'vitest';
import { calculateK1PriorAtRiskSources } from '@/engine/forms/k1-prior-charitable-at-risk.js';
import { calculateK1CharitableAtRisk } from '@/engine/forms/k1-charitable-at-risk.js';
import { d } from '@/utils/decimal.js';
import { k1CharitablePropertyRiskFixture, requireRiskSource } from '../../fixtures/k1-charitable-at-risk.js';

function originalHistory() {
  const input = k1CharitablePropertyRiskFixture();
  const k1 = input.scheduleK1[0];
  const receipt = input.k1CharitableSources?.statements?.[0]?.receipts?.[0];
  if (!k1 || !receipt) throw new Error('Actual property fixture is missing');
  const gift = { ...receipt, basisSourceId: 'old-stock', contributionDate: '2024-06-01', acquisitionDate: '2020-01-01' };
  return {
    taxpayer: input.taxpayer, k1,
    history: {
      sourceTaxYear: 2024, sourceReference: 'Original2024 Form6198 ledger', sourceFactsConfirmed: true,
      vintages: [{ taxYear: 2022, amount: '20000' }, { taxYear: 2024, amount: '77' }],
      characterSources: {
        sourceTaxYear: 2024, sourceReference: 'Original character attachment', sourceFactsConfirmed: true,
        sameOwnerAndActivityConfirmed: true,
        recipientName: `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`,
        recipientTaxpayerIdLast4: input.taxpayer.primary.ssn.replaceAll('-', '').slice(-4),
        entityName: k1.partnershipName, entityEIN: k1.partnershipEIN,
        records: [
          { sourceId: 'old-ordinary', taxYear: 2022, character: 'ordinary' as const,
            sourceReference: 'Original2022 ordinary deduction', basisLimitationAlreadyAppliedConfirmed: true,
            originalPostBasisDeduction: '60000', originalDisallowedAmount: '40000',
            useHistory: [{ taxYear: 2023, amountAllowed: '10000' }, { taxYear: 2024, amountAllowed: '10000' }] },
          { sourceId: 'old-gift-risk', taxYear: 2024, character: 'charitable' as const,
            sourceReference: 'Original2024 gift deduction', basisLimitationAlreadyAppliedConfirmed: true,
            originalPostBasisDeduction: '154', originalDisallowedAmount: '77', useHistory: [],
            gift: { basisSourceId: 'old-stock', basisOriginTaxYear: 2024, category: 'capital_gain_30' as const,
              contributionShare: '190', adjustedBasisShare: '100', receipt: gift } },
        ],
      },
    },
  };
}

describe('actual prior charitable at-risk sources', () => {
  it('retains actual historical character and annual use without reapplying basis', () => {
    // Spec: K1 Prior Charitable At Risk, actual-history.
    const source = originalHistory(), before = JSON.stringify(source);
    const result = calculateK1PriorAtRiskSources(source);
    expect(result.ordinary.toString()).toBe('20000');
    expect(result.charitable[0]?.remaining.toString()).toBe('77');
    expect(result.records.map(row => [row.sourceId, row.taxYear, row.remaining.toString()])).toEqual([
      ['old-ordinary', 2022, '20000'], ['old-gift-risk', 2024, '77'],
    ]);
    expect(result.records[1]?.originalPostBasisDeduction.toString()).toBe('154');
    source.history.characterSources.records.reverse(); source.history.vintages.reverse();
    expect(calculateK1PriorAtRiskSources(source).total.toString()).toBe('20077');
    source.history.characterSources.records.reverse(); source.history.vintages.reverse();
    expect(JSON.stringify(source)).toBe(before);
  });

  it('rejects incomplete contradictory and duplicated historical deductions', () => {
    // Spec: K1 Prior Charitable At Risk, source-completeness.
    const actual = originalHistory();
    expect(() => calculateK1PriorAtRiskSources({ ...actual, history: undefined })).toThrow(/history/i);
    expect(() => calculateK1PriorAtRiskSources({ ...actual, history: { ...actual.history, characterSources: undefined } })).toThrow(/character/i);
    for (const mutate of [
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.records[0].useHistory.pop(); },
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.records[0].useHistory[1].taxYear = 2023; },
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.records[0].useHistory[1].amountAllowed = '40000'; },
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.records[1].sourceId = 'old-ordinary'; },
      (s: ReturnType<typeof originalHistory>) => { s.history.vintages[0].amount = '19999.99'; },
    ]) {
      const source = originalHistory(); mutate(source);
      expect(() => calculateK1PriorAtRiskSources(source)).toThrow(/history|original|duplicate|reconcile/i);
    }
    expect(calculateK1PriorAtRiskSources({ ...actual, history: { ...actual.history, vintages: [], characterSources: undefined } }).total.toString()).toBe('0');
  });

  it('binds historical source identity to the original owner and activity', () => {
    // Spec: K1 Prior Charitable At Risk, original-owner.
    for (const mutate of [
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.sourceFactsConfirmed = false; },
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.sameOwnerAndActivityConfirmed = false; },
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.recipientTaxpayerIdLast4 = '9999'; },
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.entityEIN = '11-1111111'; },
      (s: ReturnType<typeof originalHistory>) => { s.history.characterSources.records[0].sourceReference = ''; },
    ]) {
      const source = originalHistory(); mutate(source);
      expect(() => calculateK1PriorAtRiskSources(source)).toThrow(/owner|activity|source|reference|confirmed/i);
    }
  });

  it('reconciles the same original gift across separate basis and at-risk histories', () => {
    // Spec: K1 Prior Charitable At Risk, basis-separation.
    const source = originalHistory();
    const basisSources = { priorBasisSuspensions: [{ sourceId: 'old-stock', originTaxYear: 2024,
      category: 'capital_gain_30' as const, contributionShare: '190', adjustedBasisShare: '100',
      appreciationPreviouslyTakenIntoAccount: '90', sourceReference: 'Original basis history',
      basisUseHistory: [{ taxYear: 2024, basisAllowed: '64' }] }] };
    expect(calculateK1PriorAtRiskSources({ ...source, basisSources }).charitable[0]?.remaining.toString()).toBe('77');
    const first = source.history.characterSources.records[1];
    first.originalPostBasisDeduction = '155';
    expect(() => calculateK1PriorAtRiskSources({ ...source, basisSources })).toThrow(/basis|original/i);
    first.originalPostBasisDeduction = '154';
    basisSources.priorBasisSuspensions[0].adjustedBasisShare = '99';
    expect(() => calculateK1PriorAtRiskSources({ ...source, basisSources })).toThrow(/basis|original/i);
  });

  it('preserves exact historical values and the explicit prior-gift year boundary', () => {
    // Spec: K1 Prior Charitable At Risk, exact-and-year.
    const source = originalHistory();
    source.history.characterSources.records = [source.history.characterSources.records[0]];
    const row = source.history.characterSources.records[0];
    row.originalPostBasisDeduction = '1.01'; row.originalDisallowedAmount = '0.505';
    row.useHistory = [{ taxYear: 2023, amountAllowed: '0' }, { taxYear: 2024, amountAllowed: '0.105' }];
    source.history.vintages = [{ taxYear: 2022, amount: '0.4' }];
    expect(calculateK1PriorAtRiskSources(source).ordinary.toString()).toBe('0.4');
    const next = originalHistory(); next.taxpayer.taxYear = 2026; next.k1.taxYear = 2026;
    next.history.sourceTaxYear = 2025; next.history.characterSources.sourceTaxYear = 2025;
    for (const item of next.history.characterSources.records) item.useHistory.push({ taxYear: 2025, amountAllowed: '0' });
    expect(() => calculateK1PriorAtRiskSources(next)).toThrow(/2026.*prior.*gift|prior.*gift.*2026/i);
  });

  it('conserves one original gift across risk origins and equivalent decimal source formats', () => {
    // Spec: K1 Prior Charitable At Risk, same-gift-conservation.
    const duplicate = originalHistory();
    duplicate.history.characterSources.records.push({ ...duplicate.history.characterSources.records[1], sourceId: 'second-risk-copy' });
    duplicate.history.vintages[1].amount = '154';
    expect(() => calculateK1PriorAtRiskSources(duplicate)).toThrow(/original gift|duplicate/i);
    const source = originalHistory(), receipt = { ...requireRiskSource(source.history.characterSources.records[1].gift).receipt, fairMarketValueShare: '190.00' };
    expect(calculateK1PriorAtRiskSources({ ...source, receipts: [receipt] }).total.toString()).toBe('20077');
    const cash = originalHistory(), gift = requireRiskSource(cash.history.characterSources.records[1].gift);
    gift.category = 'cash_60' as typeof gift.category;
    gift.contributionShare = '154'; gift.adjustedBasisShare = '154';
    Object.assign(gift.receipt, { originalCode: 'A', propertyType: undefined, acquisitionDate: undefined, fairMarketValueShare: undefined });
    const basisSources = { priorBasisSuspensions: [{ sourceId: 'old-stock', originTaxYear: 2024,
      category: 'cash_60' as const, contributionShare: '154', appreciationPreviouslyTakenIntoAccount: '0',
      sourceReference: 'Actual old cash basis history', basisUseHistory: [{ taxYear: 2024, basisAllowed: '154' }] }] };
    expect(calculateK1PriorAtRiskSources({ ...cash, basisSources }).charitable[0]?.remaining.toString()).toBe('77');
  });

  it('allocates current and prior deductions without netting retained income into the denominator', () => {
    // Spec: K1 Prior Charitable At Risk, current-allocation.
    const source = originalHistory(), row = source.history.characterSources.records[1], gift = requireRiskSource(row.gift);
    row.originalPostBasisDeduction = '10000'; row.originalDisallowedAmount = '10000';
    gift.category = 'cash_60' as typeof gift.category; gift.contributionShare = '10000'; gift.adjustedBasisShare = '10000';
    Object.assign(gift.receipt, { originalCode: 'A', propertyType: undefined, acquisitionDate: undefined, fairMarketValueShare: undefined });
    source.history.vintages[1].amount = '10000';
    const prior = calculateK1PriorAtRiskSources(source);
    const form = { activityName: source.k1.partnershipName, ordinaryIncome: '-60000', gainLossFromDispositions: '20000',
      otherIncomeGains: '0', otherDeductionsLosses: '20000', adjustedBasisAtEffectiveDate: '0',
      priorYearAmountAtRisk: '20000', currentYearIncreases: '0', currentYearDecreases: '0' };
    const result = calculateK1CharitableAtRisk({ form, ordinaryAmount: d('-40000'), shortTermAmount: d('0'), longTermAmount: d('20000'),
      distributionGain: d('0'), charitable: [{ sourceId: 'current-cash', basisOriginTaxYear: 2025, contributionDate: '2025-06-01',
        category: 'cash_60', amountAfterBasis: d('10000') }], prior });
    expect(result.totalDeductions.toString()).toBe('80000'); expect(result.totalIncome.toString()).toBe('20000');
    expect(result.ordinaryAmount.toString()).toBe('-30000'); expect(result.longTermAmount.toString()).toBe('20000');
    expect(result.charitable[0]?.allowed.toString()).toBe('5000');
    expect(result.prior.map(item => [item.sourceId, item.taxYear, item.allowed.toString(), item.suspended.toString()])).toEqual([
      ['old-ordinary', 2022, '10000', '10000'], ['old-gift-risk', 2024, '5000', '5000'],
    ]);
    expect(result.ordinaryDeductionAllowed.toString()).toBe('30000');
  });
});
