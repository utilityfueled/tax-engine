import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { calculateEicClaimantEligibility } from '@/engine/forms/eic-claimant-eligibility.js';
import { calculateEic } from '@/engine/forms/schedule-eic.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import Decimal from 'decimal.js';

// Spec: spec/federal/eic-claimant-eligibility.yaml. All facts are synthetic.
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error("Missing synthetic source"); return value; }
function source(joint = false) {
  const input = structuredClone(simpleW2Fixture);
  input.taxpayer.primary = {...input.taxpayer.primary, employmentValidSsnIssuedByDueDate:true, tinIssuedByDueDate:true, usResidencyMonths:12};
  input.w2s[0] = {...required(input.w2s[0]), wages:'10000', federalWithheld:'0', socialSecurityWages:'10000', socialSecurityWithheld:'620', medicareWages:'10000', medicareWithheld:'145'};
  if (joint) {
    input.taxpayer.filingStatus = 'married_filing_jointly';
    input.taxpayer.spouse = {...input.taxpayer.primary,firstName:'John',ssn:'321-54-9876',dateOfBirth:'1998-02-01'};
  }
  return input;
}
function credit(input: ReturnType<typeof source>) {
  return required(calculateFederalTax(TaxYearInputSchema.parse(input)).allLines.find(line => line.form === '1040' && line.line === '27a')).value.toFixed();
}
function packet(joint = false) {
  const childless = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false, qualifyingChildOfAnotherTaxpayer: false };
  return {sourceTaxYear:2025,sourceReference:'Actual claimant residency and identification records',sourceFactsConfirmed:true,primaryNonresidentAlienDuringYear:false,primaryChildless:{...childless},...(joint ? {spouseNonresidentAlienDuringYear:false,spouseChildless:{...childless}} : {})};
}

describe('actual EIC claimant eligibility', () => {
  it('rejects known ineligible SSNs and nonresident claimants in the canonical return', () => {
    const control = source();
    expect(credit(control)).toBe('649'); // Published2025 maximum;10,000 is in the plateau.
    const primary = source(); primary.taxpayer.primary.employmentValidSsnIssuedByDueDate = false;
    expect(credit(primary)).toBe('0');
    const spouse = source(true); required(spouse.taxpayer.spouse).employmentValidSsnIssuedByDueDate = false;
    expect(credit(spouse)).toBe('0');
    const nonresident = source();
    nonresident.standardDeductionFacts = {...nonresident.standardDeductionFacts,nonresidentAlien:true,residentJointElection:false};
    nonresident.deductionElection = 'itemized';
    expect(credit(nonresident)).toBe('0');
    const joint = source(true);
    joint.eic = {mfsEligible:false,primaryIsFullTimeStudent:false,claimantEligibility:{...packet(true),spouseNonresidentAlienDuringYear:true,residentJointElection:false}};
    expect(credit(joint)).toBe('0');
    required(joint.eic.claimantEligibility).residentJointElection = true;
    required(joint.standardDeductionFacts).residentJointElection = true;
    expect(credit(joint)).toBe('649');
  });
  it('uses either spouse and actual age or death dates for the childless age test', () => {
    const joint = source(true); joint.taxpayer.primary.dateOfBirth = '2002-02-01';
    expect(credit(joint)).toBe('649'); // Pub596 Rule11 Example2:23-year-old +27-year-old spouse.
    const jan1 = source(); jan1.taxpayer.primary.dateOfBirth = '2001-01-01';
    expect(credit(jan1)).toBe('649');
    jan1.taxpayer.primary.dateOfBirth = '1961-01-01';
    expect(credit(jan1)).toBe('649'); // Does not reach65 until Jan1,2026.
    jan1.taxpayer.primary.dateOfBirth = '1960-12-31';
    expect(credit(jan1)).toBe('0');
    const deceased = source(true); deceased.taxpayer.primary.dateOfBirth = '1958-01-01';
    required(deceased.taxpayer.spouse).dateOfBirth = '1960-11-01';
    required(deceased.standardDeductionFacts).spouseDeathDate = '2025-08-01';
    expect(credit(deceased)).toBe('649');
    required(deceased.taxpayer.spouse).dateOfBirth = '2000-02-14';
    required(deceased.standardDeductionFacts).spouseDeathDate = '2025-02-13';
    expect(credit(deceased)).toBe('649'); // Pub596 death Example2: day before25th birthday.
    required(deceased.standardDeductionFacts).spouseDeathDate = '2025-02-12';
    expect(credit(deceased)).toBe('0');
    const first = source(); first.taxpayer.primary.dateOfBirth = '2000-02-14';
    required(first.standardDeductionFacts).primaryDeathDate = '2025-02-12';
    expect(credit(first)).toBe('0');
  });
  it('preserves legacy unknowns while rejecting incomplete or contradictory actual sources', () => {
    const legacy = source(); delete legacy.taxpayer.primary.employmentValidSsnIssuedByDueDate;
    expect(credit(legacy)).toBe('649');
    const actual = source(true); actual.eic = {mfsEligible:false,primaryIsFullTimeStudent:false,claimantEligibility:packet(true)};
    expect(credit(actual)).toBe('649');
    delete required(actual.taxpayer.spouse).employmentValidSsnIssuedByDueDate;
    expect(() => credit(actual)).toThrow(/SSN.*unknown|known.*SSN/i);
    required(actual.taxpayer.spouse).employmentValidSsnIssuedByDueDate = true;
    required(actual.eic.claimantEligibility).sourceTaxYear = 2024;
    expect(() => credit(actual)).toThrow(/year/i);
    required(actual.eic.claimantEligibility).sourceTaxYear = 2025;
    required(actual.eic.claimantEligibility).primaryNonresidentAlienDuringYear = true;
    expect(() => credit(actual)).toThrow(/resident.*reconcile|residen.*conflict/i);
  });
  it('requires actual 2026 claimant sources without opening the full-year gate', () => {
    const input = source(true); input.taxpayer.taxYear = 2026;
    expect(() => calculateEicClaimantEligibility(input, true)).toThrow(/source year/i);
    input.eic = { mfsEligible: false, primaryIsFullTimeStudent: false, claimantEligibility: { ...packet(true), sourceTaxYear: 2026 } };
    expect(calculateEicClaimantEligibility(input, true)).toMatchObject({ sourceFactsComplete: true, childlessAgeEligible: true, disqualificationReason: undefined });
    // Indexed source-only control: floor(.0765×8,680)=664 at the plateau.
    expect(calculateEic({ claimantInput: input, filingStatus: 'married_filing_jointly', qualifyingChildren: 0,
      earnedIncome: new Decimal(10000), agi: new Decimal(10000), investmentIncome: new Decimal(0), mfsEicEligible: false }, FEDERAL_2026_CONSTANTS).credit.toFixed()).toBe('664');
    const before = JSON.stringify(input);
    expect(() => calculateFederalTax(input)).toThrow(/2026/);
    expect(JSON.stringify(input)).toBe(before);
    delete required(input.eic.claimantEligibility).spouseNonresidentAlienDuringYear;
    expect(() => calculateEicClaimantEligibility(input, true)).toThrow(/nonresident.*unknown/i);
    required(input.eic.claimantEligibility).spouseNonresidentAlienDuringYear = false;
    delete required(input.taxpayer.spouse).employmentValidSsnIssuedByDueDate;
    expect(() => calculateEicClaimantEligibility(input, true)).toThrow(/SSN.*unknown/i);
    required(input.taxpayer.spouse).employmentValidSsnIssuedByDueDate = false;
    expect(calculateEicClaimantEligibility(input, true).disqualificationReason).toMatch(/SSN/);
    required(input.taxpayer.spouse).employmentValidSsnIssuedByDueDate = true;
    delete required(input.standardDeductionFacts).spouseDeathDate;
    expect(() => calculateEicClaimantEligibility(input, true)).toThrow(/death status.*unknown/i);
    required(input.standardDeductionFacts).spouseDeathDate = '2025-08-01';
    expect(() => calculateEicClaimantEligibility(input, true)).toThrow(/death date.*return year/i);
    required(input.standardDeductionFacts).spouseDeathDate = null;
    required(input.taxpayer.spouse).dateOfBirth = '2000-02-30';
    expect(() => calculateEicClaimantEligibility(input, true)).toThrow(/calendar date/i);
  });
  it('does not demand claimant sources for an income-based zero credit', () => {
    const input = source(); input.taxpayer.taxYear = 2026;
    const result = calculateEic({ claimantInput: input, filingStatus: 'single', qualifyingChildren: 0,
      earnedIncome: new Decimal(100000), agi: new Decimal(100000), investmentIncome: new Decimal(0), mfsEicEligible: false }, FEDERAL_2026_CONSTANTS);
    expect(result.credit.toFixed()).toBe('0');
    expect(result.lines.some(line => line.line === 'claimantSources' && line.value.eq(1))).toBe(false);
    input.eic = { mfsEligible: false, primaryIsFullTimeStudent: false, claimantEligibility: { ...packet(), sourceTaxYear: 2025 } };
    expect(() => calculateEic({ claimantInput: input, filingStatus: 'single', qualifyingChildren: 0,
      earnedIncome: new Decimal(100000), agi: new Decimal(100000), investmentIncome: new Decimal(0), mfsEicEligible: false }, FEDERAL_2026_CONSTANTS)).toThrow(/source year/i);
  });
  it('keeps known disqualification distinct from missing affirmative 2026 facts', () => {
    const input = source(true); input.taxpayer.taxYear = 2026;
    input.taxpayer.primary.employmentValidSsnIssuedByDueDate = false;
    expect(calculateEicClaimantEligibility(input, true)).toMatchObject({ sourceFactsComplete: false, disqualificationReason: expect.stringMatching(/SSN/) });
    input.taxpayer.primary.employmentValidSsnIssuedByDueDate = true;
    input.taxpayer.primary.dateOfBirth = '2004-05-20'; required(input.taxpayer.spouse).dateOfBirth = '2004-06-20';
    expect(calculateEicClaimantEligibility(input, true)).toMatchObject({ sourceFactsComplete: false, childlessAgeEligible: false, disqualificationReason: expect.stringMatching(/age/) });
    required(input.taxpayer.spouse).dateOfBirth = '1998-02-01';
    expect(() => calculateEicClaimantEligibility(input, true)).toThrow(/source year/);
    input.taxpayer.filingStatus = 'single'; delete input.taxpayer.spouse;
    input.standardDeductionFacts = { ...input.standardDeductionFacts, nonresidentAlien: true, residentJointElection: false };
    expect(calculateEicClaimantEligibility(input, true)).toMatchObject({ sourceFactsComplete: false, disqualificationReason: expect.stringMatching(/nonresident/) });
    input.eic = { mfsEligible: false, primaryIsFullTimeStudent: false, claimantEligibility: { sourceTaxYear: 2025 } };
    expect(() => calculateEicClaimantEligibility(input, true)).toThrow(/source year/);
  });
});
