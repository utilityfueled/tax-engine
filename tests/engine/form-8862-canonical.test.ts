import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateEic } from '@/engine/forms/schedule-eic.js';
import { TAX_CONSTANTS } from '@/models/constants.js';
import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { known, source, packet, filer, denial, child, home } from '../fixtures/form-8862.js';
// Spec: spec/federal/form-8862-eic.yaml. All sources are explicitly fictional.
function inputFrom(current = source()): TaxYearInput {
  const input = structuredClone(simpleW2Fixture);
  input.taxpayer = { ...input.taxpayer, ...current.taxpayer }; input.standardDeductionFacts = current.standardDeductionFacts;
  input.w2s[0] = { ...known(input.w2s[0]), wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' };
  input.eic = { ...current.eic, primaryIsFullTimeStudent: false, recertificationSources: current.sources };
  return input;
}
function result(input: TaxYearInput) { return calculateFederalTax(TaxYearInputSchema.parse(input)); }
describe('canonical actual Form8862', () => {
  it('claims the ordinary current credit only after actual recertification sources reconcile', () => {
    const current = source(); const input = inputFrom(current); const before = structuredClone(input);
    expect(result(input).earnedIncomeCredit.toFixed()).toBe('649'); expect(input).toEqual(before);
    expect(result(input).scheduleEIC?.form8862).toMatchObject({ required: true, currentFormRequirementsMet: true, physical: { line1: 2025, line3IncomeOnly: false } });
    delete known(input.eic).recertificationSources; expect(() => result(input)).toThrow(/actual.*8862|8862.*source/i);
    known(denial(current)).reason = 'income_only'; delete packet(current).children; delete packet(current).allCandidateChildrenIncluded; delete filer(current).homeDays;
    expect(result(inputFrom(current)).scheduleEIC?.form8862?.physical.line3IncomeOnly).toBe(true);
    known(denial(current)).conduct = 'reckless'; known(denial(current)).finalDeterminationDate = '2025-12-01';
    Object.assign(known(denial(current)), { interveningReturnHistoryCompleteConfirmed: true, interveningOriginalReturns: [] });
    expect(result(inputFrom(current)).earnedIncomeCredit.toFixed()).toBe('0');
  });
  it('uses actual current children without imposing childless rules on a self-only child claim', () => {
    const current = source(); const row = child(current, false);
    current.taxpayer.primary.dateOfBirth = '2003-02-01'; known(filer(current).originalTaxpayer).dateOfBirth = '2003-02-01';
    let output = result(inputFrom(current)); expect(output.earnedIncomeCredit.toFixed()).toBe('649');
    expect(output.scheduleEIC?.form8862?.qualifyingChildSourceIds).toEqual(['dependent:0']);
    known(current.taxpayer.dependents[0]).ssn = '900-45-6789'; known(row.original).ssn = '900-45-6789'; row.validSsnIssuedByDueDate = true;
    expect(result(inputFrom(current)).earnedIncomeCredit.toFixed()).toBe('3409');
    known(current.taxpayer.dependents[0]).ssn = ''; known(row.original).ssn = ''; row.validSsnIssuedByDueDate = false;
    known(current.taxpayer.dependents[0]).dateOfBirth = '2025-10-01'; known(current.taxpayer.dependents[0]).monthsLivedWithYou = 2;
    Object.assign(known(row.original), { dateOfBirth: '2025-10-01', monthsLivedWithYou: 2 });
    row.deathDate = '2025-11-30'; row.specialResidencePeriodClaimed = true; row.homeDays = home(31);
    row.bornAndDeceasedRecord = { sourceReference: 'Fictional original live-birth record', recordType: 'birth_certificate', showsLiveBirth: true, copyAvailableForReturnAttachment: true };
    output = result(inputFrom(current)); expect(output.earnedIncomeCredit.toFixed()).toBe('3409');
    expect(output.scheduleEIC?.form8862?.requiredChildEvidenceSourceIds).toEqual(['dependent:0']);
  });
  it('rejects mismatched current form history claimant and child authority even at zero credit', () => {
    const current = source(); const direct = { filingStatus: 'single' as const, qualifyingChildren: 0, qualifyingChildPresent: false,
      claimantInput: current, disallowanceInput: { taxpayer: current.taxpayer, sources: current.eic?.disallowanceSources, qualifyingChildPresent: false },
      recertificationInput: current, earnedIncome: new Decimal(10000), agi: new Decimal(10000), investmentIncome: new Decimal(0), mfsEicEligible: false };
    expect(calculateEic(direct, TAX_CONSTANTS[2025]).credit.toFixed()).toBe('649');
    expect(calculateEic({ ...direct, claimantInput: { ...current, taxpayer: { taxYear: current.taxpayer.taxYear, filingStatus: current.taxpayer.filingStatus,
      primary: { dateOfBirth: current.taxpayer.primary.dateOfBirth, employmentValidSsnIssuedByDueDate: current.taxpayer.primary.employmentValidSsnIssuedByDueDate,
        tinIssuedByDueDate: current.taxpayer.primary.tinIssuedByDueDate } } } }, TAX_CONSTANTS[2025]).credit.toFixed()).toBe('649');
    for (const mutate of [(next: typeof current) => { packet(next).sourceTaxYear = 2024; },
      (next: typeof current) => { known(next.eic?.disallowanceSources).filers = []; },
      (next: typeof current) => { known(next.eic?.claimantEligibility).primaryQualifyingChildOfAnotherTaxpayer = true; },
      (next: typeof current) => { child(next); }]) {
      const changed = structuredClone(current); mutate(changed);
      expect(() => calculateEic({ ...direct, recertificationInput: changed }, TAX_CONSTANTS[2025])).toThrow();
    }
    const high = inputFrom(current); known(high.w2s[0]).wages = '100000';
    known(known(high.eic).recertificationSources).sourceTaxYear = 2024; expect(() => result(high)).toThrow(/year/i);
    high.form2555 = { foreignEarnedIncome: '1000', qualifyingDays: 365 }; expect(() => result(high)).toThrow(/year/i);
    const unknown = { ...direct, qualifyingChildPresent: undefined }; expect(() => calculateEic(unknown, TAX_CONSTANTS[2025])).toThrow(/actual.child|actual child/i);
  });
  it('reconciles current children with the independent separated-spouse source packet', () => {
    const current = source(); const row = child(current); current.taxpayer.filingStatus = 'married_filing_separately';
    const input = inputFrom(current);
    known(input.eic).separatedSpouseSources = { sourceTaxYear: 2025, sourceReference: 'Fictional actual separated-spouse sources', sourceFactsConfirmed: true,
      taxpayer: { ...current.taxpayer.primary }, applicableYearStart: '2025-01-01', applicableYearEnd: '2025-12-31',
      marriedAtYearEnd: true, principalHomesApartLastSixMonths: true, allCandidateChildrenIncluded: true,
      children: [structuredClone(row)] };
    expect(result(input).earnedIncomeCredit.toFixed()).toBe('3409');
    known(known(known(input.eic).separatedSpouseSources).children?.[0]).validSsnIssuedByDueDate = false;
    expect(() => result(input)).toThrow(/child.*conflict|child.*reconcile/i);
    delete known(input.eic).separatedSpouseSources; expect(result(input).earnedIncomeCredit.toFixed()).toBe('0');
  });
});
