// Spec: spec/federal/form-8960-ordinary-sources.yaml.
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { resolveForm8960OrdinarySources, type Form8960OrdinaryContext } from '@/engine/forms/form-8960-ordinary-sources.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const d = (value: string) => new Decimal(value);
const context = (changes: Partial<Form8960OrdinaryContext['deductions']> = {}): Form8960OrdinaryContext => ({
  filingStatus: 'single', magi: d('270000'), niitThreshold: d('200000'),
  deductions: { itemized: true, allowedItemizedDeductions: d('30000'), investmentInterest: d('1000'),
    ordinaryLoss: d('500'), saltDeduction: d('20000'), incomeOrSalesTaxes: d('15000'),
    realPropertyTaxes: d('6000'), personalPropertyTaxes: d('1000'), salesTaxElected: false, ...changes },
});
const statement = { payer: 'Synthetic annuity insurer', payerTin: '112233445', accountReference: 'Synthetic account A', accountHolder: 'primary', grossDistribution: '30000.25', taxableAmount: '10000.25', distributionCode: '7D', iraSepSimple: false };
const envelope = { sourceTaxYear: 2025, sourceReference: 'Synthetic complete NIIT source worksheet', sourceFactsConfirmed: true };
const taxAllocation = () => ({
  allocationMethodDescription: 'Actual completed source allocation: investment-related income and property taxes; remaining deductions allocated to excluded income.',
  noDuplicateDeductionConfirmed: true,
  incomeOrSalesTaxes: { sourceAmount: '15000', regularDeductibleAmount: '13000', investmentAllocableAmount: '2000.25' },
  realPropertyTaxes: { sourceAmount: '6000', regularDeductibleAmount: '6000', investmentAllocableAmount: '500.25' },
  personalPropertyTaxes: { sourceAmount: '1000', regularDeductibleAmount: '1000', investmentAllocableAmount: '0' },
});
const input = (changes: Record<string, unknown> = {}) => TaxYearInputSchema.parse({ ...simpleW2Fixture, ...changes });

describe('Form8960 ordinary source reconciliation', () => {
  it('preserves missing ordinary-source fields in the input schema', () => {
    const parsed = input({ form8960Sources: { ...envelope, annuities: [{ sourceId: 'form1099R:0' }], ordinaryTaxAllocation: { incomeOrSalesTaxes: {} } } });
    expect(parsed.form8960Sources?.annuities).toEqual([{ sourceId: 'form1099R:0' }]);
    expect(parsed.form8960Sources?.ordinaryTaxAllocation?.incomeOrSalesTaxes?.investmentAllocableAmount).toBeUndefined();
    expect(parsed.form8960Sources?.ordinaryTaxAllocation?.noDuplicateDeductionConfirmed).toBeUndefined();
  });

  it('includes actual codeD taxable amounts once and keeps qualified distributions separate', () => {
    const result = resolveForm8960OrdinarySources(input({ form1099R: [statement, { ...statement, distributionCode: '7', iraSepSimple: true, grossDistribution: '40000', taxableAmount: '40000' }] }), context());
    expect(result.annuityIncome.toFixed()).toBe('10000.25');
    expect(result.lines.find(line => line.line === 'form1099R:0:taxable-annuity')?.value.toFixed()).toBe('10000.25');
    expect(result.investmentInterestExpense.toFixed()).toBe('1000');
    expect(result.ordinaryLossDeduction.toFixed()).toBe('500');
    expect(result.investmentIncomeTaxes.toFixed()).toBe('0');
    const zero = resolveForm8960OrdinarySources(input({ form1099R: [{ ...statement, taxableAmount: '0' }] }), context());
    expect(zero.annuityIncome.toFixed()).toBe('0');
  });

  it('rejects missing conflicting duplicate or stale annuity classifications', () => {
    for (const change of [{ taxableAmount: undefined }, { accountHolder: undefined }, { taxableAmount: '-1' }, { taxableAmount: '30001' }, { iraSepSimple: true }, { eligibleGovernmental457bPlan: true }, { taxableAmountNotDetermined: true }, { simplifiedMethodCostInPlan: '0', simplifiedMethodExpectedPayments: 240, simplifiedMethodPaymentsReceivedThisYear: 12, simplifiedMethodPriorYearRecovered: '0' }]) {
      expect(() => resolveForm8960OrdinarySources(input({ form1099R: [{ ...statement, ...change }] }), context())).toThrow();
    }
    const source = { sourceId: 'form1099R:0', payerName: statement.payer, payerTin: statement.payerTin, accountReference: statement.accountReference, owner: 'primary', classification: 'nonqualified_annuity', grossDistribution: '30000.25', taxableAmount: '10000.25', sourceReference: 'Actual synthetic contract statement' };
    const actual = input({ taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, form1099R: [{ ...statement, distributionCode: '7' }], form8960Sources: { ...envelope, sourceTaxYear: 2026, annuities: [source] } });
    expect(resolveForm8960OrdinarySources(actual, context()).annuityIncome.toFixed()).toBe('10000.25');
    const missing = { ...actual, form8960Sources: undefined };
    expect(() => resolveForm8960OrdinarySources(missing, context())).toThrow(/classification/i);
    for (const altered of [{ ...source, owner: 'spouse' }, { ...source, taxableAmount: '10000' }, { ...source, grossDistribution: '30000' }, { ...source, sourceId: 'form1099R:1' }, { ...source, sourceReference: '' }]) {
      expect(() => resolveForm8960OrdinarySources(input({ ...actual, form8960Sources: { ...actual.form8960Sources, annuities: [altered] } }), context())).toThrow();
    }
    expect(() => resolveForm8960OrdinarySources(input({ ...actual, form8960Sources: { ...actual.form8960Sources, annuities: [source, source] } }), context())).toThrow(/duplicate/i);
    const excluded = { ...source, classification: 'excluded_retirement_plan', excludedPlanSection: '401' };
    expect(resolveForm8960OrdinarySources(input({ ...actual, form8960Sources: { ...actual.form8960Sources, annuities: [excluded] } }), context()).annuityIncome.toFixed()).toBe('0');
    for (const accountReference of ['Synthetic account B', undefined]) {
      expect(() => resolveForm8960OrdinarySources(input({ ...actual, form1099R: [{ ...statement, distributionCode: '7', accountReference }], form8960Sources: { ...actual.form8960Sources, annuities: [excluded] } }), context())).toThrow(/account/i);
    }
    expect(() => resolveForm8960OrdinarySources(input({ ...actual, form8960Sources: { ...actual.form8960Sources, annuities: [{ ...excluded, accountReference: undefined }] } }), context())).toThrow(/account/i);
    expect(() => resolveForm8960OrdinarySources(input({ ...actual, form1099R: [{ ...statement, distributionCode: '7', payer: 'Replacement payer', payerTin: '998887777' }], form8960Sources: { ...actual.form8960Sources, annuities: [excluded] } }), context())).toThrow(/payer|statement/i);
    expect(() => resolveForm8960OrdinarySources(input({ ...actual, form1099R: [statement], form8960Sources: { ...actual.form8960Sources, annuities: [excluded] } }), context())).toThrow(/codeD|nonqualified/i);
    // Neither supported year may silently omit a taxable annuity above threshold.
    expect(() => resolveForm8960OrdinarySources(input({ form1099R: [{ ...statement, distributionCode: '7' }] }), context())).toThrow(/classification/i);
    expect(() => resolveForm8960OrdinarySources(input({ form1099R: [{ ...statement, distributionCode: '7', grossDistribution: '0', taxableAmount: '100' }] }), context())).toThrow(/taxable|gross/i);
    // Below-threshold historical facts remain unverified; they imply no plan classification.
    expect(resolveForm8960OrdinarySources(input({ form1099R: [{ ...statement, distributionCode: '7' }] }), { ...context(), magi: d('200000') }).unverifiedAnnuitySourceIds).toEqual(['form1099R:0']);
  });

  it('reconciles actual tax deductions and preserves source cents before rounding', () => {
    const result = resolveForm8960OrdinarySources(input({ form8960Sources: { ...envelope, ordinaryTaxAllocation: taxAllocation() } }), context());
    // Source cents sum2500.50; one physical-line rounding gives2501, not2500.
    expect(result.investmentIncomeTaxes.toFixed()).toBe('2501');
    expect(result.lines.find(line => line.line === 'taxes:allocable-before-rounding')?.value.toFixed()).toBe('2500.5');
    expect(result.investmentInterestExpense.plus(result.investmentIncomeTaxes).plus(result.ordinaryLossDeduction).toFixed()).toBe('4001');
  });

  it('rejects unavailable contradictory or unreconciled tax deductions', () => {
    const actual = input({ form8960Sources: { ...envelope, ordinaryTaxAllocation: taxAllocation() } });
    for (const changes of [{ allocationMethodDescription: '' }, { noDuplicateDeductionConfirmed: false }, { incomeOrSalesTaxes: { ...taxAllocation().incomeOrSalesTaxes, sourceAmount: '15001' } }, { realPropertyTaxes: { ...taxAllocation().realPropertyTaxes, regularDeductibleAmount: '6001' } }, { personalPropertyTaxes: { ...taxAllocation().personalPropertyTaxes, investmentAllocableAmount: '1001' } }, { personalPropertyTaxes: { ...taxAllocation().personalPropertyTaxes, regularDeductibleAmount: '999' } }, { incomeOrSalesTaxes: { ...taxAllocation().incomeOrSalesTaxes, investmentAllocableAmount: undefined } }]) {
      expect(() => resolveForm8960OrdinarySources(input({ ...actual, form8960Sources: { ...envelope, ordinaryTaxAllocation: { ...taxAllocation(), ...changes } } }), context())).toThrow();
    }
    expect(() => resolveForm8960OrdinarySources(actual, context({ salesTaxElected: true }))).toThrow(/sales/i);
    const standard = resolveForm8960OrdinarySources(actual, context({ itemized: false, allowedItemizedDeductions: d('0') }));
    expect(standard.investmentIncomeTaxes.toFixed()).toBe('0');
    expect(standard.investmentInterestExpense.toFixed()).toBe('0');
    expect(standard.ordinaryLossDeduction.toFixed()).toBe('0');
    expect(() => resolveForm8960OrdinarySources({ ...actual, form8960Sources: { ...actual.form8960Sources, sourceFactsConfirmed: false } }, context())).toThrow(/confirm/i);
  });

  it('shares the final itemized allowance across interest taxes and ordinary losses', () => {
    const actual = input({ form8960Sources: { ...envelope, ordinaryTaxAllocation: taxAllocation() } });
    const limited = context({ allowedItemizedDeductions: d('3500') });
    expect(() => resolveForm8960OrdinarySources(actual, limited)).toThrow(/allocation/i);
    const allocated = input({ ...actual, form8960Sources: { ...actual.form8960Sources, itemizedAllocation: { investmentInterest: '1000', investmentIncomeTaxes: '2000', ordinaryLoss: '500' } } });
    const result = resolveForm8960OrdinarySources(allocated, limited);
    expect(result.investmentIncomeTaxes.toFixed()).toBe('2000');
    expect(result.investmentInterestExpense.plus(result.investmentIncomeTaxes).plus(result.ordinaryLossDeduction).toFixed()).toBe('3500');
    expect(() => resolveForm8960OrdinarySources(input({ ...allocated, form8960Sources: { ...allocated.form8960Sources, itemizedAllocation: { investmentInterest: '1001', investmentIncomeTaxes: '1999', ordinaryLoss: '500' } } }), limited)).toThrow(/allocation/i);
  });
});
