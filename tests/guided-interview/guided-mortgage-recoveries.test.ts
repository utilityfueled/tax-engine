// Spec: spec/federal/guided-mortgage-recoveries.yaml
import { expect, it } from 'vitest';
import { buildGuidedMortgageInputs } from '@/lib/guided-mortgage-worksheet';
import { buildGuidedMortgageRecoveries, type MortgageRecoveryData, type RecoveryMiscData } from '@/lib/guided-mortgage-recoveries';
import { emptyDeductionData, type DeductionData } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { calculateHomeMortgageInterest } from '@/engine/forms/home-mortgage-interest';
import { Form1099MiscSchema, TaxYearInputSchema } from '@/models/inputs';
import { completeMortgageSource, completeMortgageWorksheet, completeW2Entry, startCompleteInterview } from './complete-facts';

const loan = { ...completeMortgageSource, lender: 'Actual Lender', accountReference: 'loan-A', mortgageInterest: '12000', interestPaidByReturnAmount: '12000', outstandingPrincipal: '100000', maximumBalanceDuringYear: '100000', sameYearInterestRefund: '1000', refundOfOverpaidInterest: '2000' };
export const recovery: MortgageRecoveryData = { sourceId: 'refund-A', sourceTaxYear: '2025', sourceReference: 'Actual refund advice', payer: 'Actual Lender', accountReference: 'loan-A', accountHolder: 'primary',
  refundSource: 'form1098', form1098SourceId: 'Actual Lender:loan-A', originTaxYear: '2024', refundReceived: '2000', taxableRecovery: '600', alreadyIncludedInOtherIncome: '0',
  entireRefundBelongsToReturn: true, taxBenefitWorksheetReference: 'Completed 2024 Pub525 tax-benefit worksheet', priorReturnAndOtherRecoveriesReviewed: true, taxBenefitWorksheetConfirmed: true };
export const misc: RecoveryMiscData = { sourceId: 'misc-A', sourceTaxYear: '2025', sourceFormRevision: '2025-04', payer: 'Actual Reporting Lender', payerTin: '123456789', accountReference: 'reported-account', accountHolder: 'primary',
  otherIncome: '600', federalWithheld: '60.01', rents: '0', royalties: '0', fishingBoatProceeds: '0', medicalPayments: '0', substitutePayments: '0', cropInsurance: '0', grossAttorneyProceeds: '0', fishPurchasedForResale: '0', section409ADeferrals: '0', nonqualifiedDeferredComp: '0',
  directSales: false, fatcaFilingRequirement: false, stateTaxReporting: 'single', state: 'OH', payerStateId: 'actual-state-id', stateIncome: '600', stateWithheld: '12.34', recoveryOnlyIncomeConfirmed: true, sourceFactsConfirmed: true };
function facts(change: Partial<DeductionData> = {}): DeductionData {
  return { ...emptyDeductionData, method: 'itemized', mortgageInterest: '12000', mortgageEntries: [loan],
    mortgageWorksheet: { ...completeMortgageWorksheet, priorYearInterestRecoveriesPresent: true, allRecoveriesIncluded: true, recoveries: [recovery] }, ...change };
}
function full(data: DeductionData) {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['bought-home'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '85000', socialSecurityWages: '85000', socialSecurityWithheld: '5270', medicareWages: '85000', medicareWithheld: '1232.50', federalWithheld: '10000' }] };
  state.sectionData.deductions = data;
  const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  return { input, result: calculateFederalTax(TaxYearInputSchema.parse(input)) };
}
it('preserves prior recovery income separately from current interest under either deduction election', () => {
  for (const method of ['itemized', 'standard'] as const) {
    const { input, result } = full(facts({ method }));
    expect(input?.form1098[0]?.refundOfOverpaidInterest).toBe('2000');
    expect(result.agi.toFixed()).toBe('85600');
    expect(result.scheduleA?.mortgageInterest.toFixed()).toBe('11000');
    expect(result.schedule1?.lines.find(line => line.form === 'Sched 1' && line.line === '8z')?.value.toFixed()).toBe('600');
    expect(result.deductionUsed).toBe(method);
  }
});
it('conserves original recovery-only MISC income and withholding once', () => {
  const data = facts(); if (!data.mortgageWorksheet) throw new Error('Missing synthetic worksheet');
  data.mortgageWorksheet.recoveryMiscStatements = [misc];
  data.mortgageWorksheet.recoveries = [{ ...recovery, alreadyIncludedInOtherIncome: '600', miscSourceId: 'misc-A' }];
  const { input, result } = full(data);
  expect(input?.form1099Misc).toHaveLength(1); expect(input?.form1099Misc?.[0]).toMatchObject({ sourceId: 'misc-A', taxYear: 2025, accountHolder: 'primary', otherIncome: '600', federalWithheld: '60.01', stateWithheld: '12.34' });
  expect(result.agi.toFixed()).toBe('85600'); expect(result.totalWithholding.toFixed()).toBe('10060.01');
  const source = buildGuidedMortgageInputs(data, 2025, 'single');
  expect(calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: 'single' }, ...source }).additionalTaxableInterestRecovery.toFixed()).toBe('0');
  for (const patch of [{ otherIncome: '601' }, { otherIncome: '599' }, { accountHolder: 'spouse' }, { sourceTaxYear: '2024' }, { rents: '1' }, { royalties: '1' }, { fishPurchasedForResale: '1' }, { directSales: true }, { stateWithheld: undefined }, { sourceFactsConfirmed: null }]) {
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, recoveryMiscStatements: [{ ...misc, ...patch } as RecoveryMiscData] } }, 2025, 'single')).toThrow();
  }
  expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, recoveryMiscStatements: [misc, { ...misc, sourceId: 'copy' }] } }, 2025, 'single')).toThrow(/duplicate|same|reconcil/i);
});
it('accepts actual closed-loan and lender recovery records without invented current loan facts', () => {
  const data = facts({ method: 'standard', mortgageEntries: [], mortgageInterest: '' }); if (!data.mortgageWorksheet) throw new Error('Missing synthetic worksheet');
  data.mortgageWorksheet.recoveryOnlyStatements = [{ lender: 'Actual Lender', accountReference: 'loan-A', accountHolder: 'primary', sourceTaxYear: '2025', mortgageInterest: '0', outstandingPrincipal: '0', originationDate: '2010-01-01', refundOfOverpaidInterest: '2000', mortgageInsurancePremiums: '0', pointsPaid: '0', propertyTaxPaid: '0', noCurrentHomeDebtConfirmed: true, sourceFactsConfirmed: true }];
  const { input, result } = full(data); expect(input?.mortgageInterestWorksheet?.loans).toHaveLength(0); expect(result.agi.toFixed()).toBe('85600');
  const lender = { ...data, mortgageWorksheet: { ...data.mortgageWorksheet, recoveryOnlyStatements: [], recoveries: [{ ...recovery, refundSource: 'lender_statement' as const, form1098SourceId: undefined, taxableRecovery: '0' }] } };
  expect(full(lender).result.agi.toFixed()).toBe('85000');
  expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, recoveryOnlyStatements: [{ ...data.mortgageWorksheet.recoveryOnlyStatements[0], mortgageInterest: '1' }] } }, 2025, 'single')).toThrow(/current|loan/i);
});
it('rejects incomplete and contradictory recovery sources without replacing unknowns', () => {
  const data = facts(); if (!data.mortgageWorksheet) throw new Error('Missing synthetic worksheet');
  for (const patch of [{ originTaxYear: '2025' }, { sourceTaxYear: '' }, { refundReceived: '' }, { taxableRecovery: 'NaN' }, { taxableRecovery: '2001' }, { alreadyIncludedInOtherIncome: '-1' }, { entireRefundBelongsToReturn: false }, { priorReturnAndOtherRecoveriesReviewed: null }, { taxBenefitWorksheetConfirmed: false }, { accountReference: 'different' }, { payer: '' }, { accountHolder: 'spouse' }]) {
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, recoveries: [{ ...recovery, ...patch } as MortgageRecoveryData] } }, 2025, 'single')).toThrow();
  }
  expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, priorYearInterestRecoveriesPresent: false } }, 2025, 'single')).toThrow();
  expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, allRecoveriesIncluded: null } }, 2025, 'single')).toThrow();
  expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, recoveries: [recovery, recovery] } }, 2025, 'single')).toThrow(/duplicate/i);
  const exact = '9007199254740993.01';
  const root = { ...data.mortgageWorksheet, recoveries: [{ ...recovery, refundSource: 'lender_statement' as const, form1098SourceId: undefined, refundReceived: exact, taxableRecovery: exact }] };
  expect(buildGuidedMortgageRecoveries(root, [], 2025, 'single').recoveries[0]?.taxableRecovery).toBe(exact);
  const split = { ...data.mortgageWorksheet, recoveries: [{ ...recovery, refundReceived: '1000', taxableRecovery: '300' }, { ...recovery, sourceId: 'refund-B', originTaxYear: '2023', refundReceived: '1000', taxableRecovery: '300' }] };
  expect(buildGuidedMortgageInputs({ ...data, mortgageWorksheet: split }, 2025, 'single').mortgageInterestWorksheet?.priorYearInterestRecoveries).toHaveLength(2);
});

it('preserves actual MISC source revisions and requires the current year compensation facts', () => {
  const data = facts(); if (!data.mortgageWorksheet) throw new Error('Missing synthetic worksheet');
  const root = { ...data.mortgageWorksheet, recoveries: [{ ...recovery, sourceTaxYear: '2026', originTaxYear: '2025', refundSource: 'lender_statement' as const, form1098SourceId: undefined, alreadyIncludedInOtherIncome: '600', miscSourceId: 'misc-A' }],
    recoveryMiscStatements: [{ ...misc, sourceTaxYear: '2026', sourceFormRevision: '2026-12' as const, cashTips: '0', qualifiedOvertimeCompensation: '0', tippedOccupationCodePresent: false }] };
  expect(buildGuidedMortgageRecoveries(root, [], 2026, 'single').form1099Misc[0]).toMatchObject({ taxYear: 2026, sourceFormRevision: '2026-12', directSales: false, fatcaFilingRequirement: false, fishPurchasedForResale: '0', cashTips: '0', qualifiedOvertimeCompensation: '0', payerStateId: 'actual-state-id' });
  for (const patch of [{ cashTips: undefined }, { cashTips: '1' }, { qualifiedOvertimeCompensation: '1' }, { tippedOccupationCodePresent: null }, { sourceFormRevision: '2025-04' }, { stateTaxReporting: 'multiple' }, { stateTaxReporting: 'none' }]) {
    expect(() => buildGuidedMortgageRecoveries({ ...root, recoveryMiscStatements: [{ ...root.recoveryMiscStatements[0], ...patch } as RecoveryMiscData] }, [], 2026, 'single')).toThrow();
  }
  const historical = { ...root, recoveries: root.recoveries.map(row => ({ ...row, sourceTaxYear: '2025', originTaxYear: '2024' })), recoveryMiscStatements: [{ ...misc, cashTips: '1' }] };
  expect(() => buildGuidedMortgageRecoveries(historical, [], 2025, 'single')).toThrow(/compensation/);
  const legacy = Form1099MiscSchema.parse({ payer: 'Legacy' });
  for (const field of ['sourceId', 'accountReference', 'sourceFormRevision', 'directSales', 'fatcaFilingRequirement', 'fishPurchasedForResale', 'payerStateId'] as const) expect(legacy[field]).toBeUndefined();
});
