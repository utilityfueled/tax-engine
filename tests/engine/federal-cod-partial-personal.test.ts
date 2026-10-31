// Spec: spec/federal/cod-partial-personal-insolvency.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateCodNolReduction } from '@/engine/forms/cod-nol-reductions.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualPartialPersonalCodInput, partialPersonalBasisInput, partialPersonalLegacyNolInput, partialPersonalLargeNolInput } from '../fixtures/cod-partial-personal.js';
import { partialPersonalLegacyNolZeroPoolInput, partialPersonalLargeNolZeroPoolInput } from '../fixtures/cod-zero-minimum-tax-credit-bound.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

it('uses the published personal partial-insolvency amounts from complete originals', () => {
  const input = actualPartialPersonalCodInput({ debt: '5000', interest: '0', liabilities: '10000', assets: '7000' });
  const original = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('2000');
  expect(result.codNolReduction!.sourceExcludedAmount.toFixed()).toBe('3000');
  expect(result.codNolReduction!.reportedExcludedAmount.toFixed()).toBe('3000');
  expect(result.codAttributeReduction!.regular.property.immediatelyAfterLiabilities.toFixed()).toBe('5000');
  expect(JSON.stringify(input)).toBe(original);
});

it('preserves the legacy taxable amount and AGI difference without admitting its incomplete original', () => {
  const legacy = { ...simpleW2Fixture, form1099C: [{ creditor: 'Creditor', amountDischarged: '25000', personallyLiable: true }],
    codExclusion: { insolvency: { totalLiabilities: '200000', totalAssets: '185000' } } };
  expect(() => calculateFederalTax(legacy)).toThrow(/COD.*actual.*attribute|COD.*complete.*source/i);
  const complete = actualPartialPersonalCodInput({ debt: '25000', interest: '0', liabilities: '200000', assets: '185000', creditor: 'Creditor' });
  const partiallyExcluded = calculateFederalTax(complete);
  const fullyTaxable = calculateFederalTax({ ...legacy, codExclusion: undefined });
  expect(fullyTaxable.schedule1!.cancelledDebtIncome.toFixed()).toBe('25000');
  expect(partiallyExcluded.schedule1!.cancelledDebtIncome.toFixed()).toBe('10000');
  expect(fullyTaxable.agi.minus(partiallyExcluded.agi).toFixed()).toBe('15000');
  expect(partiallyExcluded.agi.toFixed()).toBe('95000');
});

it('retains included personal interest and separates actual discharge from excluded income', () => {
  const input = actualPartialPersonalCodInput(), original = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('8000');
  expect(result.codNolReduction!.sourceExcludedAmount.toFixed()).toBe('10000');
  expect(result.codAttributeReduction!.regular.property.immediatelyAfterLiabilities.toFixed()).toBe('72000');
  expect(result.agi.toFixed()).toBe('93000');
  expect(input.form1099C[0]!.amountDischarged).toBe('18000');
  expect(input.form1099C[0]!.interestIncluded).toBe('1200');
  const parsed = TaxYearInputSchema.parse(input);
  expect(parsed.form982NolSources!.debts![0]).toMatchObject({ personalDebt: input.form982NolSources.debts[0]!.personalDebt });
  expect(JSON.stringify(input)).toBe(original);
});

it('uses the single documented legacy carry before applying the exclusion to attributes', () => {
  expect(() => calculateFederalTax(partialPersonalLegacyNolInput())).toThrow(/COD current-year minimum tax credit/);
  const input = partialPersonalLegacyNolZeroPoolInput(), result = calculateFederalTax(input);
  expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('10000');
  expect(result.carryforwards.nolCarryforward.toNumber()).toBeLessThan(15000);
  for (const ledger of [result.codNolReduction!.regular!, result.codNolReduction!.alternativeTax!]) {
    expect(ledger.currentTaxUse.toFixed()).toBe('15000');
    expect(ledger.carryforwardBeforeReduction.toFixed()).toBe('0');
    expect(ledger.reduction.toFixed()).toBe('0');
    expect(ledger.carryforward.toFixed()).toBe('0');
  }
  expect(result.agi.toFixed()).toBe('80000');
  expect(result.carryforwards.qbiLossCarryforward?.toFixed()).toBe('15000');
});

it('reduces only the surviving independently computed loss balances', () => {
  expect(() => calculateFederalTax(partialPersonalLargeNolInput())).toThrow(/COD current-year minimum tax credit/);
  const result = calculateFederalTax(partialPersonalLargeNolZeroPoolInput());
  const regular = result.codNolReduction!.regular!, alternative = result.codNolReduction!.alternativeTax!;
  expect(regular.currentTaxUse.toFixed()).toBe('63400');
  expect(regular.carryforwardBeforeReduction.toFixed()).toBe('36600');
  expect(regular.reduction.toFixed()).toBe('20000');
  expect(regular.carryforward.toFixed()).toBe('16600');
  expect(alternative.currentTaxUse.toFixed()).toBe('85500');
  expect(alternative.carryforwardBeforeReduction.toFixed()).toBe('14500');
  expect(alternative.reduction.toFixed()).toBe('14500');
  expect(alternative.carryforward.toFixed()).toBe('0');
  expect(result.codAttributeReduction!.alternativeTax.remainingExclusionBeforeReduction.toFixed()).toBe('5500');
});

it('uses the full discharged liability in the independently sourced basis cap', () => {
  const input = partialPersonalBasisInput(), original = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('8000');
  for (const ledger of [result.codAttributeReduction!.regular, result.codAttributeReduction!.alternativeTax]) {
    expect(ledger.property.immediatelyAfterLiabilities.toFixed()).toBe('72000');
    expect(ledger.property.basisCap.toFixed()).toBe('3000');
    expect(ledger.property.attributeReduction.toFixed()).toBe('3000');
    expect(ledger.property.remainingBasis.toFixed()).toBe('72000');
    expect(ledger.unreducedExclusion.toFixed()).toBe('7000');
  }
  expect(JSON.stringify(input)).toBe(original);
});

it('retains the personal income classification and its actual NIIT threshold effect', () => {
  const input = actualPartialPersonalCodInput({ wages: '195000' });
  input.w2s[0]!.federalWithheld = '50000';
  input.form1099Int = [{ payer: 'Actual personal investment bank', interestIncome: '5000', federalWithheld: '0',
    earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0', taxExemptInterest: '0' }];
  const before = calculateFederalTax({ ...input, form1099C: [], codExclusion: undefined, form982NolSources: undefined, form982AttributeSources: undefined });
  const after = calculateFederalTax(input);
  expect(before.form8960!.magi.toFixed()).toBe('200000');
  expect(before.form8960!.netInvestmentIncome.toFixed()).toBe('5000');
  expect(before.form8960!.niitTax.toFixed()).toBe('0');
  expect(after.form8960!.magi.toFixed()).toBe('208000');
  expect(after.form8960!.netInvestmentIncome.toFixed()).toBe('5000');
  expect(after.form8960!.niitTax.toFixed()).toBe('190');
  input.form1099Int = [];
  const noInvestment = calculateFederalTax(input);
  expect(noInvestment.form8960!.netInvestmentIncome.toFixed()).toBe('0');
  expect(noInvestment.form8960!.niitTax.toFixed()).toBe('0');
});

it('preserves source cents and the finite personal-use and reporting boundaries', () => {
  const input = actualPartialPersonalCodInput({ debt: '18000.37', interest: '1200.12', liabilities: '90000.40', assets: '80000.11' });
  const source = calculateCodNolReduction(input);
  expect(source.insolvencyAmount.toFixed()).toBe('10000.29');
  expect(source.sourceExcludedAmount.toFixed()).toBe('10000.29');
  expect(source.reportedExcludedAmount.toFixed()).toBe('10000');
  expect(source.sourceTaxableAmount.toFixed()).toBe('8000.08');
  expect(source.calculationComplete).toBe(false);
  expect(calculateFederalTax(input).codAttributeReduction!.regular.property.immediatelyAfterLiabilities.toFixed()).toBe('72000.03');
  for (const [assets, expectedExcluded] of [['72000', '18000'], ['70000', '18000'], ['90000', '0']] as const) {
    expect(calculateCodNolReduction(actualPartialPersonalCodInput({ assets })).sourceExcludedAmount.toFixed()).toBe(expectedExcluded);
  }
  for (const change of [
    { sourceFactsConfirmed: false }, { proceedsUse: 'investment' as const }, { proceedsUse: 'business' as const },
    { proceedsUse: 'mixed_or_other' as const }, { borrowingNotDeductibleUnpaidExpenseConfirmed: false },
    { interestTreatment: 'potentially_deductible' as const }, { actualDischargedAmount: '18001' },
    { actualDischargedInterest: '1201' }, { allDischargedAmountsIncluded: false }, { noPaymentOrNewBorrowingAtDischargeConfirmed: false },
  ]) {
    const invalid = actualPartialPersonalCodInput();
    Object.assign(invalid.form982NolSources.debts[0]!.personalDebt, change);
    expect(() => calculateCodNolReduction(invalid)).toThrow(/COD.*personal|COD.*discharge.*reconcile|COD.*interest/i);
  }
  const missing = actualPartialPersonalCodInput();
  Reflect.deleteProperty(missing.form982NolSources.debts[0]!, 'personalDebt');
  expect(() => calculateCodNolReduction(missing)).toThrow(/COD.*personal.*source|COD.*personal.*record/i);
  const excessiveInterest = actualPartialPersonalCodInput({ interest: '18001' });
  expect(() => calculateCodNolReduction(excessiveInterest)).toThrow(/COD.*interest.*exceed|COD.*interest.*amount/i);
});
