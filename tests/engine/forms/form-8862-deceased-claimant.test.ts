import { describe, expect, it } from 'vitest';
import { calculateForm8862, type Form8862Input } from '@/engine/forms/form-8862.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
import { source, packet, filer, known, home, denial } from '../../fixtures/form-8862.js';

// Spec: spec/federal/form-8862-deceased-claimant.yaml. Fictional source records.
function death(input: Form8862Input, owner: 'primary' | 'spouse', date: string, days: number) {
  const index = owner === 'primary' ? 0 : 1;
  known(input.standardDeductionFacts)[owner === 'primary' ? 'primaryDeathDate' : 'spouseDeathDate'] = date;
  known(input.standardDeductionFacts).shortTaxYear = false;
  filer(input, index).applicableYearEnd = date;
  filer(input, index).homeDays = home(days);
}
function jointRecord(input: Form8862Input, remarried: boolean | undefined = false) {
  packet(input).jointReturnAfterDeath = {
    sourceReference: 'Fictional actual marriage and final-period records',
    survivingSpouseRemarriedBeforeOwnYearEnd: remarried,
  };
}
function birth(input: Form8862Input, owner: 'primary' | 'spouse', date: string) {
  const person = owner === 'primary' ? input.taxpayer.primary : known(input.taxpayer.spouse);
  person.dateOfBirth = date; known(filer(input, owner === 'primary' ? 0 : 1).originalTaxpayer).dateOfBirth = date;
}
function mainHome(input: Form8862Input, owner: 'primary' | 'spouse', value: boolean) {
  const facts = known(input.eic?.claimantEligibility);
  known(owner === 'primary' ? facts.primaryChildless : facts.spouseChildless).mainHomeInUnitedStatesMoreThanHalfYear = value;
}
describe('deceased claimant Form8862 periods', () => {
  it('derives the deceased claimant period without a fixed full-year day threshold', () => {
    const input = source(); death(input, 'primary', '2025-06-30', 91);
    const before = structuredClone(input);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: true,
      physical: { claimantRows: [{ owner: 'primary', line9Days: 91, line10Age: 40 }] } });
    expect(input).toEqual(before);
    filer(input).homeDays = home(90); mainHome(input, 'primary', false);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false,
      physical: { claimantRows: [{ line9Days: 90 }] } });
    filer(input).homeDays = home(181); mainHome(input, 'primary', true);
    expect(known(calculateForm8862(input)).physical.claimantRows?.[0]?.line9Days).toBe(181);
    filer(input).homeDays = home(182); expect(() => calculateForm8862(input)).toThrow(/period|days/i);
    death(input, 'primary', '2025-06-29', 90); mainHome(input, 'primary', false);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false,
      physical: { claimantRows: [{ applicableYearDays: 180, line9Days: 90 }] } });
    death(input, 'primary', '2025-01-01', 0); mainHome(input, 'primary', false);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false,
      physical: { claimantRows: [{ applicableYearDays: 1, line9Days: 0 }] } });
    filer(input).homeDays = home(1); mainHome(input, 'primary', true);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: true,
      physical: { claimantRows: [{ applicableYearDays: 1, line9Days: 1 }] } });
  });
  it('keeps separate deceased and surviving spouse periods including both-deceased returns', () => {
    const input = source(true); death(input, 'primary', '2025-06-30', 91); jointRecord(input);
    filer(input, 1).homeDays = home(183);
    expect(known(calculateForm8862(input)).physical.claimantRows?.map(row => row.line9Days)).toEqual([91, 183]);
    filer(input, 1).homeDays = home(182); mainHome(input, 'spouse', false);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false });
    death(input, 'spouse', '2025-09-30', 137); mainHome(input, 'spouse', true);
    const before = structuredClone(input); const result = known(calculateForm8862(input));
    expect(result.currentFormRequirementsMet).toBe(true);
    expect(result.physical.claimantRows?.map(row => row.line9Days)).toEqual([91, 137]);
    known(packet(input).filers).reverse();
    expect(calculateForm8862(input)).toEqual(result);
    expect(input).toEqual({ ...before, sources: { ...before.sources, filers: [...known(before.sources?.filers)].reverse() } });
  });
  it('matches the published death-age examples without replacing the survivor home test', () => {
    // i8862 Example1: surviving claimant67, deceased spouse64 in August.
    const input = source(true); birth(input, 'primary', '1958-01-01'); birth(input, 'spouse', '1960-11-01');
    death(input, 'spouse', '2025-08-15', 227); jointRecord(input);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: true,
      physical: { claimantRows: [{ line10Age: 67 }, { line10Age: 64, line9Days: 227 }] } });
    // i8862 Example2 specifies these birth/death dates exactly.
    birth(input, 'spouse', '2000-02-14'); death(input, 'spouse', '2025-02-13', 44);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: true,
      physical: { claimantRows: [{ line10Age: 67 }, { line10Age: 25 }] } });
    death(input, 'spouse', '2025-02-12', 43);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false,
      physical: { claimantRows: [{ line10Age: 67 }, { line10Age: 24 }] } });
    birth(input, 'spouse', '1960-02-13'); death(input, 'spouse', '2025-02-13', 44);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false,
      physical: { claimantRows: [{ line10Age: 67 }, { line10Age: 65 }] } });
  });
  it('rejects unknown or conflicting death-period and joint-return sources without mutation', () => {
    const base = source(true); death(base, 'primary', '2025-06-30', 91); jointRecord(base);
    for (const edit of [
      (input: Form8862Input) => { known(input.standardDeductionFacts).primaryDeathDate = undefined; },
      (input: Form8862Input) => { filer(input).applicableYearEnd = '2025-12-31'; },
      (input: Form8862Input) => { filer(input).applicableYearStart = '2025-02-01'; },
      (input: Form8862Input) => { known(input.standardDeductionFacts).shortTaxYear = true; },
      (input: Form8862Input) => { known(input.standardDeductionFacts).shortTaxYear = undefined; },
      (input: Form8862Input) => { jointRecord(input, true); },
      (input: Form8862Input) => { delete packet(input).jointReturnAfterDeath; },
      (input: Form8862Input) => { known(packet(input).jointReturnAfterDeath).survivingSpouseRemarriedBeforeOwnYearEnd = undefined; },
      (input: Form8862Input) => { known(packet(input).jointReturnAfterDeath).sourceReference = ''; },
      (input: Form8862Input) => { known(filer(input).homeDays).actualUnitedStatesDays = undefined; },
    ]) {
      const input = structuredClone(base); edit(input); const before = structuredClone(input);
      expect(() => calculateForm8862(input)).toThrow(); expect(input).toEqual(before);
    }
  });
  it('retains the full published credit on actual income and preserves the form shortcut', () => {
    const current = source(); death(current, 'primary', '2025-06-30', 91);
    const input = structuredClone(simpleW2Fixture); input.taxpayer = { ...input.taxpayer, ...current.taxpayer };
    input.standardDeductionFacts = current.standardDeductionFacts;
    Object.assign(known(input.w2s[0]), { wages: '10000', federalWithheld: '0', socialSecurityWages: '10000',
      socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' });
    input.eic = { ...current.eic, recertificationSources: current.sources };
    const before = structuredClone(input); const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(result.agi.toFixed()).toBe('10000'); expect(result.earnedIncomeCredit.toFixed()).toBe('649');
    expect(result.scheduleEIC?.form8862?.physical.claimantRows?.[0]?.line9Days).toBe(91); expect(input).toEqual(before);
    known(denial(current)).reason = 'income_only'; delete packet(current).children; delete packet(current).allCandidateChildrenIncluded;
    delete filer(current).homeDays; delete filer(current).applicableYearStart; delete filer(current).applicableYearEnd;
    expect(calculateForm8862(current)).toMatchObject({ currentFormRequirementsMet: true, physical: { line3IncomeOnly: true } });
    expect(known(calculateForm8862(current)).physical.claimantRows).toBeUndefined();
  });
});
