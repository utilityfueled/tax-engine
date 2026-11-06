// @vitest-environment jsdom
// Spec: spec/federal/education-annual-category-limits.yaml guide-and-reload.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildSectionRoute, emptyAdjustmentData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedAnnualCategory } from '../fixtures/guided-annual-category-limits';
import { requiredPeriodSource as required } from '../fixtures/guided-room-board-periods';
import { emptyStudentLoanFacts, emptyStudentLoanSource } from '@/lib/guided-student-loan-facts';
it('preserves annual category sources and unknown answers through reload', () => {
  const { state, original } = actualGuidedAnnualCategory(true), id = 'fictional-annual-category';
  const amount = (value: typeof state) => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(value))).agi.toFixed();
  try {
    saveGuidedFlowState(localStorage, id, state); let loaded = required(loadGuidedFlowState(localStorage, id));
    expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded)).form1099Q).toEqual(TaxYearInputSchema.parse(original).form1099Q);
    expect(amount(loaded)).toBe('57200');
    const source = structuredClone(required(loaded.sectionData.credits?.educationDistributions));
    required(source.expenses?.[0]).apprenticeshipRegistered = false;
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: source });
    expect(loaded.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    let draft = required(loaded.sectionData.credits?.educationDistributions);
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: { ...draft, sourceFactsConfirmed: true } });
    expect(amount(loaded)).toBe('59000');
    saveGuidedFlowState(localStorage, id, loaded); loaded = required(loadGuidedFlowState(localStorage, id));
    expect(required(loaded.sectionData.credits?.educationDistributions?.expenses?.[0]).apprenticeshipRegistered).toBe(false);
    draft = structuredClone(required(loaded.sectionData.credits?.educationDistributions));
    required(draft.expenses?.[0]).apprenticeshipRegistered = null;
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: draft });
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: { ...required(loaded.sectionData.credits?.educationDistributions), sourceFactsConfirmed: true } });
    expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    saveGuidedFlowState(localStorage, id, loaded);
    expect(required(loadGuidedFlowState(localStorage, id)).sectionData.credits?.educationDistributions?.expenses?.[0]?.apprenticeshipRegistered).toBeNull();
    expect(loaded.sectionData.credits?.educationDistributions?.forms?.[1]?.fields.earnings).toBe('6000');
  } finally { localStorage.clear(); }
});

it('requires and preserves actual loan records for a zero-benefit education claim', () => {
  const { state, data } = actualGuidedAnnualCategory(), id = 'fictional-annual-loan-claim';
  Object.assign(required(data.expenses?.[0]), { category: 'student_loan', amount: '8000',
    borrowerId: 'actual-loan-source', beneficiaryOrSibling: true, studentLoanInterestAmount: '1000', studentLoanInterestDeducted: '1000' });
  data.loanBorrowers = [{ id: 'actual-loan-source', owner: 'primary',
    priorQualifiedDistributions: `0.${'0'.repeat(59)}1`, otherCurrentQualifiedDistributions: `9999.${'9'.repeat(60)}` }];
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(validateSection(state, 'adjustments').status).toBe('partial');
  state.segmentation.lifeEvents.push('student-loans');
  expect(buildSectionRoute(state.segmentation).map(section => section.id)).toContain('adjustments');
  state.sectionData.adjustments = { ...emptyAdjustmentData, studentLoanFacts: { ...emptyStudentLoanFacts, sourceTaxYear: '2025',
    sourceFactsConfirmed: true, primaryClaimedAsDependent: false, spouseClaimedAsDependent: false,
    puertoRicoIncomeExclusion: '0', americanSamoaIncomeExclusion: '0', loans: [{ ...emptyStudentLoanSource,
      sourceId: 'actual-lender-record', borrowerId: 'actual-loan-source', accountHolder: 'primary', lender: 'Fictional actual lender',
      sourceKind: 'lender_statement', loanOriginationDate: '2012-08-20', interestPaid: '1000', additionalInterestPaid: '0',
      paymentsInTaxYearConfirmed: true, legallyObligated: true, solelyQualifiedEducationExpenses: true,
      eligibleInstitutionAtOrigination: true, enrolledAtLeastHalfTime: true, pursuingCredential: true,
      studentRelationshipAtOrigination: 'self', expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
      employerAssistanceExcluded: '0', otherTaxFreeAssistance: '0', interestDeductibleElsewhere: '0',
      qtpTaxFreeEarningsUsedForInterest: '0', reductionsDistinctConfirmed: true, educationExpenseIds: ['actual-category-receipt'] }] } };
  try {
    saveGuidedFlowState(localStorage, id, state);
    const loaded = required(loadGuidedFlowState(localStorage, id)), original = required(buildTaxInputFromGuidedData(loaded));
    expect(original.studentLoanInterestFacts?.loans?.[0]?.educationExpenseIds).toEqual(['actual-category-receipt']);
    expect(original.adjustments?.studentLoanInterest ?? '0').toBe('0');
    const result = calculateFederalTax(TaxYearInputSchema.parse(original));
    expect([result.form1099Q?.taxableEarnings, result.schedule1?.studentLoanInterest, result.agi].map(value => value?.toFixed()))
      .toEqual(['9000', '1000', '58000']);
    const changed = structuredClone(required(loaded.sectionData.adjustments));
    required(changed.studentLoanFacts?.loans?.[0]).educationExpenseIds = [];
    expect(buildTaxInputFromGuidedData(updateSectionData(loaded, 'adjustments', changed))).toBeNull();
    const changedCredits = structuredClone(required(loaded.sectionData.credits));
    required(changedCredits.educationDistributions?.expenses?.[0]).studentLoanInterestDeducted = '999';
    const edited = updateSectionData(loaded, 'credits', changedCredits);
    expect(edited.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  } finally { localStorage.clear(); }
});
