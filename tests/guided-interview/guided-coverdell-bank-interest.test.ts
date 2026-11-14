// Spec: spec/federal/guided-coverdell-bank-interest.yaml
import { describe, expect, it } from 'vitest';
import { buildInterestInputs } from '@/lib/guided-interest-originals';
import { buildEducationDistributionInputs, educationDistributionFactErrors } from '@/lib/guided-education-distributions';
import { confirmCoverdellBankInterest } from '@/lib/guided-coverdell-bank-interest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyCreditsData, emptyAdjustmentData, updateSectionData, setInterviewTaxYear, validateSection } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { emptyStudentLoanFacts, emptyStudentLoanSource, studentLoanEducationSources } from '@/lib/guided-student-loan-facts';
import { educationOriginalOptions } from '@/lib/guided-coverdell-bank-interest';
import { calculateFederalTax } from '@/engine/federal.js';
import { guidedCoverdellBankInterest } from '../fixtures/guided-coverdell-bank-interest.js';
import { startCompleteInterview } from './complete-facts';

function actualState() {
  const fixture = guidedCoverdellBankInterest();
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  if (!state.sectionData['personal-info']) throw Error('Missing actual owner');
  state.sectionData['personal-info'].ssn = fixture.canonical.taxpayer.primary.ssn;
  state.sectionData['income-investments'] = { interestEntries: [fixture.interest], dividendEntries: [], brokerageEntries: [] };
  state.sectionData.credits = { ...emptyCreditsData, educationDistributions: fixture.data };
  return { state, fixture };
}
describe('guided original Coverdell bank interest', () => {
  it('preserves explicit original PA allocation without inventing zero', () => {
    expect(buildInterestInputs([guidedCoverdellBankInterest().interest])[0]).toHaveProperty('paDirectObligationInterest', '0');
    expect(buildInterestInputs([{ payer: 'Fictional bank', interestIncome: '100', federalWithheld: '0' }])[0]?.paDirectObligationInterest).toBeUndefined();
  });
  it('preserves actual original bank interest exactly once', () => {
    const { data, context, canonical } = guidedCoverdellBankInterest();
    const inputs = buildEducationDistributionInputs(data, 2025, 'single', undefined, context);
    const result = calculateFederalTax({ ...canonical, ...inputs });
    expect(result.agi.toFixed()).toBe('400');
    expect(result.totalTax.toFixed()).toBe('30');
    const { state } = actualState();
    const roundTrip = buildTaxInputFromGuidedData(state);
    expect(roundTrip?.form1099Q?.[0]?.postDisqualificationInterestSources).toMatchObject({ originalIntIndex: 0, taxableBankInterest: '100' });
    if (!roundTrip) throw Error('Missing canonical return');
    expect(calculateFederalTax(TaxYearInputSchema.parse(roundTrip)).agi.toFixed()).toBe('400');
    expect(validateSection(state, 'credits').status).toBe('complete');
  });
  it('denies unknown changed and unsupported conversion originals', () => {
    const missing = guidedCoverdellBankInterest();
    for (const context of [undefined, {}, { ...missing.context, primarySsn: undefined }, { ...missing.context, primarySsn: '3333' }, { ...missing.context, interestEntries: undefined }])
      expect(() => buildEducationDistributionInputs(missing.data, 2025, 'single', undefined, context)).toThrow();
    const mutations = [
      (f: ReturnType<typeof guidedCoverdellBankInterest>) => { f.interest.paDirectObligationInterest = undefined; },
      (f: ReturnType<typeof guidedCoverdellBankInterest>) => { f.interest.foreignCountry = 'CA'; },
      (f: ReturnType<typeof guidedCoverdellBankInterest>) => { f.interest.stateWithheld = '1'; },
      (f: ReturnType<typeof guidedCoverdellBankInterest>) => { f.interest.interestIncome = '99'; },
      (f: ReturnType<typeof guidedCoverdellBankInterest>) => { f.context.interestEntries?.push({ ...f.interest }); },
      (f: ReturnType<typeof guidedCoverdellBankInterest>) => { f.context.primarySsn = '222-33-4444'; },
      (f: ReturnType<typeof guidedCoverdellBankInterest>) => { if (f.data.forms?.[0]?.bankInterestConversion) f.data.forms[0].bankInterestConversion.otherIncome = ''; },
    ];
    for (const mutate of mutations) {
      const f = guidedCoverdellBankInterest(); mutate(f);
      expect(() => buildEducationDistributionInputs(f.data, 2025, 'single', undefined, f.context)).toThrow(/review/i);
      const row = f.data.forms?.[0]; if (!row) throw Error('Missing fixture');
      row.bankInterestConversion = confirmCoverdellBankInterest(row, f.context, 2025, 'single');
      expect(Object.keys(educationDistributionFactErrors(f.data, 2025, 'single', undefined, f.context))).not.toHaveLength(0);
    }
  });
  it('invalidates review on actual source changes without invalidating a confirmation alone', () => {
    const { state } = actualState();
    const investments = state.sectionData['income-investments']; if (!investments) throw Error('Missing actual originals');
    const changed = updateSectionData(state, 'income-investments', { ...investments, interestEntries: investments.interestEntries.map(row => ({ ...row, payer: 'Changed actual bank' })) });
    expect(changed.sectionData.credits?.educationDistributions?.forms?.[0]?.bankInterestConversion?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    expect(setInterviewTaxYear(state, 2026).sectionData.credits?.educationDistributions?.forms?.[0]?.bankInterestConversion?.sourceFactsConfirmed).toBeNull();
    const same = updateSectionData(state, 'credits', { ...state.sectionData.credits, educationDistributions: { ...state.sectionData.credits?.educationDistributions, sourceFactsConfirmed: true } });
    expect(same.sectionData.credits?.educationDistributions?.forms?.[0]?.bankInterestConversion?.sourceFactsConfirmed).toBe(true);
  });
  it('requires actual identities after explicit review and preserves coordinated loan replay', () => {
    const f = guidedCoverdellBankInterest();
    for (const context of [undefined, {}, { ...f.context, primarySsn: undefined }, { ...f.context, primarySsn: '3333' }]) {
      const row = structuredClone(f.data.forms?.[0]); if (!row) throw Error('Missing fixture');
      row.bankInterestConversion = confirmCoverdellBankInterest(row, context, 2025, 'single');
      expect(() => buildEducationDistributionInputs({ ...f.data, forms: [row] }, 2025, 'single', undefined, context)).toThrow(/actual|original|SSN/i);
    }
    expect(() => educationOriginalOptions(f.context, undefined, 'single')).toThrow();
    expect(() => educationOriginalOptions(f.context, 2025, undefined)).toThrow();
    expect(() => Reflect.apply(educationOriginalOptions, undefined, [f.context, 2025, 'unknown'])).toThrow();
    expect(studentLoanEducationSources({ ...emptyCreditsData, educationDistributions: f.data }, 'single', 2025, undefined, undefined, f.context)).toEqual([]);
    expect(() => studentLoanEducationSources({ ...emptyCreditsData, educationDistributions: f.data }, 'single', 2025)).toThrow();
    const { state } = actualState();
    state.sectionData.adjustments = { ...emptyAdjustmentData, studentLoanInterest: '50.25', studentLoanFacts: {
      ...emptyStudentLoanFacts, sourceTaxYear: '2025', sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
      spouseClaimedAsDependent: false, puertoRicoIncomeExclusion: '0', americanSamoaIncomeExclusion: '0',
      loans: [{ ...emptyStudentLoanSource, sourceId: 'Fictional separate student loan', borrowerId: 'Fictional primary borrower',
        accountHolder: 'primary', lender: 'Fictional separate lender', sourceKind: 'lender_statement', loanOriginationDate: '2010-08-01',
        interestPaid: '50.25', additionalInterestPaid: '0', paymentsInTaxYearConfirmed: true, legallyObligated: true,
        solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true, enrolledAtLeastHalfTime: true,
        pursuingCredential: true, studentRelationshipAtOrigination: 'self', expensesWithinReasonablePeriod: true,
        relatedLender: false, employerPlanLoan: false, employerAssistanceExcluded: '0', otherTaxFreeAssistance: '0',
        interestDeductibleElsewhere: '0', qtpTaxFreeEarningsUsedForInterest: '0', reductionsDistinctConfirmed: true, educationExpenseIds: [] }],
    } };
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    const input = buildTaxInputFromGuidedData(state);
    expect(input?.studentLoanInterestFacts?.loans?.[0]?.interestPaid).toBe('50.25');
    expect(input?.form1099Q?.[0]?.postDisqualificationInterestSources?.taxableBankInterest).toBe('100');
    if (!input) throw Error('Missing composed original return');
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).totalInterest.toFixed()).toBe('100');
    const unreviewed = structuredClone(state), old = unreviewed.sectionData.credits?.educationDistributions?.forms?.[0];
    if (!old?.bankInterestConversion) throw Error('Missing original conversion');
    old.bankInterestConversion.sourceFactsConfirmed = null; old.bankInterestConversion.confirmedOriginalValues = undefined;
    const nextCredits = structuredClone(unreviewed.sectionData.credits); const row = nextCredits?.educationDistributions?.forms?.[0];
    if (!nextCredits || !row) throw Error('Missing actual credits');
    row.bankInterestConversion = confirmCoverdellBankInterest(row, f.context, 2025, 'single');
    const reviewed = updateSectionData(unreviewed, 'credits', nextCredits);
    expect(reviewed.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBe(true);


  });
  it('captures actual 2026 originals while preserving the complete annual gate', () => {
    const f = guidedCoverdellBankInterest(2026);
    expect(buildEducationDistributionInputs(f.data, 2026, 'single', undefined, f.context).form1099Q?.[0]?.postDisqualificationInterestSources?.sourceTaxYear).toBe(2026);
    expect(() => calculateFederalTax(f.canonical)).toThrow(/2026|readiness|support/i);
  });
});
