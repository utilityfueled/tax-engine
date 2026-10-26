import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateEicSeparatedSpouseSources } from '@/engine/forms/eic-separated-spouse-sources.js';
import { TaxYearInputSchema, EicConfigSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

// Spec: spec/federal/eic-separated-spouse-sources.yaml. Synthetic source records.
function required<T>(v: T | undefined): T { if (v === undefined) throw new Error('Missing synthetic source'); return v; }
function source(validSsn = true) {
  const base = structuredClone(simpleW2Fixture);
  const primary = { ...base.taxpayer.primary, dateOfBirth: '1980-02-01', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true };
  const child = { firstName: 'Alex', lastName: 'Example', ssn: validSsn ? '333-44-5555' : '999-70-0001', dateOfBirth: '2015-06-01',
    relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false };
  return { ...base, taxpayer: { ...base.taxpayer, filingStatus: 'married_filing_separately' as const, primary, dependents: [child] },
    w2s: [{ ...required(base.w2s[0]), wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }],
    eic: { primaryIsFullTimeStudent: false, claimantEligibility: { sourceTaxYear: 2025, sourceReference: 'actual claimant source', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
      primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } },
    separatedSpouseSources: { sourceTaxYear: 2025, sourceReference: 'actual separation and child sources', sourceFactsConfirmed: true,
      taxpayer: { firstName: primary.firstName, lastName: primary.lastName, ssn: primary.ssn, dateOfBirth: primary.dateOfBirth },
      applicableYearStart: '2025-01-01', applicableYearEnd: '2025-12-31', marriedAtYearEnd: true,
      principalHomesApartLastSixMonths: true as boolean | undefined,
      legallySeparatedUnderStateLaw: undefined as boolean | undefined,
      differentHouseholdsAtYearEnd: undefined as boolean | undefined,
      separationInstrument: undefined as { kind: 'written-separation-agreement' | 'decree-of-separate-maintenance'; state: string; effectiveDate: string; sourceReference: string } | undefined,
      allCandidateChildrenIncluded: true,
      children: [{ sourceId: 'dependent:0', sourceReference: 'actual school and home records',
        original: { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn, dateOfBirth: child.dateOfBirth, relationship: child.relationship, monthsLivedWithYou: child.monthsLivedWithYou },
        livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true as boolean | undefined,
        specialResidencePeriodClaimed: false, marriedAtYearEnd: false, jointReturnFiled: false,
        jointReturnRefundOnly: undefined as boolean | undefined,
        fullTimeStudentForFiveMonths: undefined as boolean | undefined, permanentlyAndTotallyDisabled: undefined as boolean | undefined,
        validSsnIssuedByDueDate: validSsn as boolean | undefined,
        allOtherEligibleClaimantsIncluded: true,
        otherEligibleClaimants: [] as { name: string; sourceReference: string; claimsAnyChildTaxBenefit: boolean }[] }],
    } } };
}
function result(input: unknown) { return calculateFederalTax(TaxYearInputSchema.parse(input)); }
function credit(input: unknown) { return required(result(input).scheduleEIC).credit.toFixed(); }

describe('actual EIC separated-spouse sources', () => {
  it('rejects contradictory ordinary residence months while preserving the six-month source', () => {
    for (const amount of [0, 1, 2, 3, 4, 5]) {
      const input = source(); required(input.taxpayer.dependents[0]).monthsLivedWithYou = amount;
      required(required(input.eic.separatedSpouseSources.children[0]).original).monthsLivedWithYou = amount;
      expect(() => credit(input)).toThrow(/residence months/i);
    }
    const input = source(); required(input.taxpayer.dependents[0]).monthsLivedWithYou = 6;
    required(required(input.eic.separatedSpouseSources.children[0]).original).monthsLivedWithYou = 6;
    expect(credit(input)).toBe('3409');
  });
  it('rejects an original child identifier that duplicates the claimant', () => {
    for (const validSsn of [true, false]) {
      const input = source(validSsn); const original = input.taxpayer.primary.ssn.replace(/-/g, '');
      required(input.taxpayer.dependents[0]).ssn = original;
      required(required(input.eic.separatedSpouseSources.children[0]).original).ssn = original;
      expect(() => credit(input)).toThrow(/claimant.*identifier|duplicate.*identifier/i);
    }
  });
  it('derives each actual separated-spouse alternative without substituting unknown facts', () => {
    const input = source(); const facts = input.eic.separatedSpouseSources;
    expect(credit(input)).toBe('3409'); // Final2025 table, nonjoint one child, $10,000-$10,050.
    facts.principalHomesApartLastSixMonths = false;
    expect(() => credit(input)).toThrow(/separation.*unknown|state-law.*unknown/i);
    facts.legallySeparatedUnderStateLaw = true; facts.differentHouseholdsAtYearEnd = true;
    facts.separationInstrument = { kind: 'written-separation-agreement', state: 'NY', effectiveDate: '2025-10-01', sourceReference: 'actual state-law agreement' };
    expect(credit(input)).toBe('3409');
    facts.separationInstrument.kind = 'decree-of-separate-maintenance'; expect(credit(input)).toBe('3409');
    facts.principalHomesApartLastSixMonths = undefined;
    expect(credit(input)).toBe('3409'); // The established state-law alternative stands independently.
    facts.separationInstrument.state = 'ZZ'; expect(() => credit(input)).toThrow(/state/i);
    facts.separationInstrument.state = 'NY';
    facts.principalHomesApartLastSixMonths = false;
    facts.differentHouseholdsAtYearEnd = false; expect(credit(input)).toBe('0');
    facts.principalHomesApartLastSixMonths = true; expect(() => credit(input)).toThrow(/year.end.*conflict|last.six.*conflict/i);
  });
  it('binds child qualification and original source identity without borrowing the legacy EIC flag', () => {
    const input = source(); const before = JSON.stringify(input);
    expect(input.taxpayer.dependents[0]?.qualifiesForEIC).toBe(false);
    expect(credit(input)).toBe('3409'); expect(JSON.stringify(input)).toBe(before);
    const changed = source(); required(changed.taxpayer.dependents[0]).ssn = '444-55-6666';
    expect(() => credit(changed)).toThrow(/original.*identity|original.*source/i);
    const duplicate = source(); duplicate.eic.separatedSpouseSources.children.push(structuredClone(required(duplicate.eic.separatedSpouseSources.children[0])));
    expect(() => credit(duplicate)).toThrow(/duplicate/i);
    const repeatedIdentity = source();
    const second = { ...required(repeatedIdentity.taxpayer.dependents[0]), firstName: 'Alexis', ssn: '333445555' };
    repeatedIdentity.taxpayer.dependents.push(second);
    repeatedIdentity.eic.separatedSpouseSources.children.push({ ...structuredClone(required(repeatedIdentity.eic.separatedSpouseSources.children[0])),
      sourceId: 'dependent:1', original: { firstName: second.firstName, lastName: second.lastName, ssn: second.ssn,
        dateOfBirth: second.dateOfBirth, relationship: second.relationship, monthsLivedWithYou: second.monthsLivedWithYou } });
    expect(() => credit(repeatedIdentity)).toThrow(/duplicate/i);
    const omitted = source(); omitted.taxpayer.dependents.push({ ...required(omitted.taxpayer.dependents[0]), ssn: '444-55-6666', qualifiesForEIC: true });
    expect(() => credit(omitted)).toThrow(/candidate|missing.*child/i);
    const agreed = source(); required(agreed.eic.separatedSpouseSources.children[0]).otherEligibleClaimants = [{ name: 'Other parent', sourceReference: 'actual no-competing-claim record', claimsAnyChildTaxBenefit: false }];
    expect(credit(agreed)).toBe('3409');
    required(required(agreed.eic.separatedSpouseSources.children[0]).otherEligibleClaimants[0]).claimsAnyChildTaxBenefit = true;
    expect(() => credit(agreed)).toThrow(/competing|tiebreak/i);
  });
  it('uses the self-only amount for an actual invalid-SSN child without imposing childless age rules', () => {
    for (const birth of ['2003-02-01', '1950-02-01']) {
      const input = source(false); input.taxpayer.primary.dateOfBirth = birth; input.eic.separatedSpouseSources.taxpayer.dateOfBirth = birth;
      expect(credit(input)).toBe('649'); // Same official table row; Step3 skips Step4, child not counted under32(b).
      required(input.eic.separatedSpouseSources.children[0]).validSsnIssuedByDueDate = undefined;
      expect(() => credit(input)).toThrow(/child.*SSN.*unknown/i);
    }
    const input = source(false); input.eic.separatedSpouseSources.children = []; input.taxpayer.dependents = [];
    expect(credit(input)).toBe('0'); // Separated spouse still needs an actual qualifying child.
  });
  it('keeps known ineligibility distinct from unknown sources and unsupported methods', () => {
    const input = source(); const row = required(input.eic.separatedSpouseSources.children[0]);
    row.livedWithTaxpayerInUnitedStatesMoreThanHalfYear = false; expect(credit(input)).toBe('0');
    row.livedWithTaxpayerInUnitedStatesMoreThanHalfYear = undefined; expect(() => credit(input)).toThrow(/home.*unknown/i);
    row.livedWithTaxpayerInUnitedStatesMoreThanHalfYear = true; row.marriedAtYearEnd = true;
    expect(() => credit(input)).toThrow(/married.child/i);
    row.marriedAtYearEnd = false; row.specialResidencePeriodClaimed = true;
    expect(() => credit(input)).toThrow(/residence.period/i);
    row.specialResidencePeriodClaimed = false; input.eic.separatedSpouseSources.applicableYearEnd = '2025-08-01';
    expect(() => credit(input)).toThrow(/short.year|applicable.*year/i);
    const months = source(); required(months.taxpayer.dependents[0]).monthsLivedWithYou = 6;
    required(required(months.eic.separatedSpouseSources.children[0]).original).monthsLivedWithYou = 6;
    expect(credit(months)).toBe('3409'); // ScheduleEIC explicitly prints7 for >half-year but <7months.
    required(months.taxpayer.dependents[0]).monthsLivedWithYou = 0;
    required(required(months.eic.separatedSpouseSources.children[0]).original).monthsLivedWithYou = 0;
    expect(() => credit(months)).toThrow(/residence months/i);
  });
  it('preserves legacy omission and enforces actual next-year source boundaries', () => {
    expect(EicConfigSchema.parse({}).mfsEligible).toBeUndefined();
    const actual = source(); actual.eic.separatedSpouseSources.sourceFactsConfirmed = false;
    expect(() => credit(actual)).toThrow(/confirmation|confirmed/i);
    const legacy = structuredClone(simpleW2Fixture); legacy.taxpayer.filingStatus = 'married_filing_separately';
    expect(required(calculateFederalTax(TaxYearInputSchema.parse(legacy)).scheduleEIC).credit.toFixed()).toBe('0');
    const next = source(); next.taxpayer.taxYear = 2026; next.eic.separatedSpouseSources.sourceTaxYear = 2026;
    expect(() => result(next)).toThrow(/2026/);
  });
  it('derives supported original relationship and age conditions while rejecting missing candidate rows', () => {
    for (const relationship of ['step-sibling', 'niece-nephew', 'foster-child', 'grandchild']) {
      const input = TaxYearInputSchema.parse(source());
      const child = required(input.taxpayer.dependents[0]);
      const row = required(required(input.eic?.separatedSpouseSources?.children)[0]);
      child.relationship = relationship; required(row.original).relationship = relationship;
      row.authorizedFosterPlacement = relationship === 'foster-child' ? true : undefined;
      expect(credit(input)).toBe('3409');
      if (relationship === 'foster-child') { row.authorizedFosterPlacement = undefined; expect(() => credit(input)).toThrow(/placement/i); }
    }
    const missing = source(); missing.eic.separatedSpouseSources.children = [];
    expect(() => credit(missing)).toThrow(/candidate|child.*missing/i);
    const student = TaxYearInputSchema.parse(source());
    const child = required(student.taxpayer.dependents[0]);
    const row = required(required(student.eic?.separatedSpouseSources?.children)[0]);
    child.dateOfBirth = '2005-09-10'; required(row.original).dateOfBirth = child.dateOfBirth;
    expect(() => credit(student)).toThrow(/student.*unknown/i);
    row.fullTimeStudentForFiveMonths = true; expect(credit(student)).toBe('3409');
    row.fullTimeStudentForFiveMonths = false; row.permanentlyAndTotallyDisabled = false;
    expect(credit(student)).toBe('0');
    row.permanentlyAndTotallyDisabled = true; expect(credit(student)).toBe('3409');
    child.dateOfBirth = '1980-02-30'; required(row.original).dateOfBirth = child.dateOfBirth;
    expect(() => credit(student)).toThrow(/calendar date/i);
  });
  it('validates actual next-year sources and original identity without fabricating a financial context', () => {
    const input = TaxYearInputSchema.parse(source()); const facts = required(input.eic?.separatedSpouseSources);
    input.taxpayer.taxYear = 2026; facts.sourceTaxYear = 2026;
    facts.applicableYearStart = '2026-01-01'; facts.applicableYearEnd = '2026-12-31';
    const { taxpayer, standardDeductionFacts, eic } = input; const context = { taxpayer, standardDeductionFacts, eic };
    const before = JSON.stringify(context);
    expect(calculateEicSeparatedSpouseSources(context)).toMatchObject({ sourceFactsComplete: true,
      separatedSpouseEligible: true, qualifyingChildSourceIds: ['dependent:0'], ssnCountedChildSourceIds: ['dependent:0'] });
    expect(JSON.stringify(context)).toBe(before);
    facts.sourceTaxYear = 2025; expect(() => calculateEicSeparatedSpouseSources(context)).toThrow(/source year/i);
    facts.sourceTaxYear = 2026; facts.taxpayer = undefined;
    expect(() => calculateEicSeparatedSpouseSources(context)).toThrow(/identity/i);
    facts.taxpayer = { ...taxpayer.primary, ssn: '' }; taxpayer.primary.ssn = '';
    expect(() => calculateEicSeparatedSpouseSources(context)).toThrow(/identifier/i);
  });
});
