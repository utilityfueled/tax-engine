// Spec: spec/federal/current-minimum-tax-credit-sources.yaml empty-original-nol-basis/current-original-loss-containment.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateNetOperatingLossReturn, type NolIncomeContext } from '@/engine/forms/net-operating-loss-return.js';
import { d } from '@/utils/decimal.js';
import { actualCurrentMtcInput } from '../fixtures/current-minimum-tax-credit.js';
import { actualNolInput } from '../fixtures/net-operating-loss.js';

it('requires complete empty originals without a false same-basis confirmation', () => {
  const original = actualCurrentMtcInput();
  expect(original.netOperatingLoss?.alternativeTax?.regularBasisAndLossLimitsSameAsAlternativeConfirmed).toBe(false);
  expect(calculateFederalTax(original).currentMinimumTaxCredit?.followingYearPool.toFixed()).toBe('41639');
  for (const change of [
    (input: typeof original) => Reflect.deleteProperty(input.netOperatingLoss!.alternativeTax!, 'vintages'),
    (input: typeof original) => { input.netOperatingLoss!.alternativeTax!.sourceFactsConfirmed = false; },
    (input: typeof original) => { input.netOperatingLoss!.sourceFactsConfirmed = false; },
  ]) {
    const input = structuredClone(original); change(input);
    expect(() => calculateFederalTax(input)).toThrow(/NOL.*source|NOL.*history|NOL.*complete|NOL.*confirmed/i);
  }
});

it('retains current-loss and nonempty-history limitations', () => {
  // Exercise the public orchestrator's separate actual/modified contexts, not a
  // netted common amount. Their values are independent original-derived inputs
  // to this API; no current-loss result is supplied.
  const income = (ebl = '0'): NolIncomeContext => ({
    agi: d('100000'), taxableIncome: d('84250'), iraDeduction: d('0'), socialSecurityBenefitsTaxable: d('0'),
    allowedPassiveLoss: d('0'), medicalDeduction: d('0'), charitableDeduction: d('0'), charitableCarryforward: d('0'),
    deductionUsed: 'standard', currentExcessBusinessLoss: d(ebl), seniorDeduction: d('0'),
    capitalLossModification: d('0'), section1202Modification: d('0'), lines: [],
  });
  for (const [actual, modified, ebl] of [['-1', '100000', '0'], ['100000', '-1', '0'], ['100000', '100000', '1']]) {
    expect(() => calculateNetOperatingLossReturn(actualCurrentMtcInput(), () => income(ebl), (_deduction, isModified) => ({
      amti: d(isModified ? modified : actual), qbiDeduction: d('0'), lines: [],
    }))).toThrow(/current.*loss|original.loss|current.*EBL/i);
  }
  const vintage = actualNolInput('100000').netOperatingLoss!.vintages![0]!;
  const exhausted = { ...vintage, openingCarryforward: '0',
    history: [{ taxYear: 2023, nolUsed: '100000', attributeReduction: '0', sourceReference: 'Actual full original use in2023' }] };
  const expired = { ...vintage, lossTaxYear: 2004, carrybackTreatment: 'waived' as const,
    carrybackSourceReference: 'Actual original carryback waiver', ordinaryHistoricalCarrybackConfirmed: true };
  for (const row of [vintage, exhausted, expired]) {
    const input = actualCurrentMtcInput();
    input.netOperatingLoss!.vintages = [structuredClone(row)];
    input.netOperatingLoss!.alternativeTax!.vintages = [structuredClone(row)];
    expect(() => calculateNetOperatingLossReturn(input, () => income(), () => ({ amti: d('100000'), qbiDeduction: d('0'), lines: [] })))
      .toThrow(/NOL.*basis|AMT.*basis|NOL.*complete.*AMT|NOL.*confirmed/i);
  }
});

it('rejects an omitted same-basis answer while preserving explicit false', () => {
  const input = actualCurrentMtcInput();
  expect(input.netOperatingLoss!.alternativeTax!.regularBasisAndLossLimitsSameAsAlternativeConfirmed).toBe(false);
  expect(calculateFederalTax(input).currentMinimumTaxCredit!.followingYearPool.toFixed()).toBe('41639');
  Reflect.deleteProperty(input.netOperatingLoss!.alternativeTax!, 'regularBasisAndLossLimitsSameAsAlternativeConfirmed');
  expect(() => calculateFederalTax(input)).toThrow(/NOL.*complete.*AMT|NOL.*confirm|basis/i);
});
