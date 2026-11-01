// Spec: spec/federal/eic-qualifying-child-tiebreaker.yaml.
import { describe, expect, it } from 'vitest';
import { calculateEicQualifyingChildSources } from '@/engine/forms/eic-qualifying-child-sources.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import type { EicCurrentChildSource } from '@/models/form-8862-sources.js';
import { eicSeparatedReviewInput } from '../fixtures/eic-separated-review.js';
import { child as form8862Child, source as form8862Source } from '../fixtures/form-8862.js';
import { form8862ReviewInput } from '../fixtures/form-8862-review.js';

const dependent = (relationship: string) => ({ firstName: 'Avery', lastName: 'Lee', ssn: '123456789', dateOfBirth: '2012-05-01', relationship, monthsLivedWithYou: 12 });
const row = (patch: Partial<EicCurrentChildSource> = {}): EicCurrentChildSource => ({ sourceId: 'dependent:0', sourceReference: 'Fictional home records', sourceFactsConfirmed: true, original: dependent('grandchild'), livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true, specialResidencePeriodClaimed: false, marriedAtYearEnd: false,
  jointReturnFiled: false, fullTimeStudentForFiveMonths: false, permanentlyAndTotallyDisabled: false, authorizedFosterPlacement: false, validSsnIssuedByDueDate: true, allOtherEligibleClaimantsIncluded: true, otherEligibleClaimants: [], ...patch });
const run = (source: EicCurrentChildSource, relationship = 'grandchild', filingStatus: 'single' | 'married_filing_jointly' | 'head_of_household' = 'single', child = { ...source, original: dependent(relationship) }, flags = {}) => calculateEicQualifyingChildSources({
  taxpayer: { taxYear: 2025, filingStatus, primary: { firstName: 'Sam', lastName: 'Lee', ssn: '987654321', dateOfBirth: '1960-01-01' }, spouse: filingStatus !== 'married_filing_jointly' ? undefined : { firstName: 'Pat', lastName: 'Lee', ssn: '987654322', dateOfBirth: '1960-01-01' },
    dependents: [{ ...dependent(relationship), ...flags }] } as never, allCandidateChildrenIncluded: true, children: [child] });
const other = (adjustedGrossIncome: string, isParent: boolean, claimsAnyChildTaxBenefit = false) => ({ name: `${isParent ? 'Parent' : 'Aunt'} ${adjustedGrossIncome}`, sourceReference: 'Fictional record', isParent, adjustedGrossIncome, claimsAnyChildTaxBenefit });
const wins = (child: EicCurrentChildSource) => run(child).qualifyingChildPresent;

describe('EIC qualifying-child tie-breakers', () => {
  it('applies the dependency test to a married child', () => {
    const adult = { marriedAtYearEnd: true };
    expect(run(row({ ...adult, marriedChildDependency: 'can_claim' }), 'child').qualifyingChildPresent).toBe(true);
    expect(run(row({ ...adult, marriedChildDependency: 'released_to_other_parent' }), 'child').qualifyingChildPresent).toBe(true);
    expect(run(row({ ...adult, marriedChildDependency: 'cannot_claim' }), 'child').qualifyingChildPresent).toBe(false);
    expect(() => run(row(adult), 'child')).toThrow(/married-child dependency answer is unknown/);
    expect(() => run(row({ marriedChildDependency: 'can_claim' }), 'child')).toThrow(/conflicts with an unmarried child/);
    expect(run(row({ ...adult, marriedChildDependency: 'can_claim', jointReturnFiled: true, jointReturnRefundOnly: false }), 'child').qualifyingChildPresent).toBe(false);
    expect(run(row({ ...adult, marriedChildDependency: 'can_claim', jointReturnFiled: true, jointReturnRefundOnly: true }), 'child').qualifyingChildPresent).toBe(true);
  });

  it('applies the nonparent competing-claim order', () => {
    const agi = { taxpayerTiebreakAgi: '30000' }, withOthers = (...otherEligibleClaimants: ReturnType<typeof other>[]) => row({ ...agi, otherEligibleClaimants });
    expect(wins(withOthers(other('10000', true, true)))).toBe(false);
    expect(run(withOthers(other('10000', true, true))).children[0]!.tiebreakLost).toBe(true);
    expect(run(withOthers(other('10000', true, true))).tiebreakLostChildSourceIds).toEqual(['dependent:0']);
    expect(run(row({ otherEligibleClaimants: [other('10000', true, true)] })).qualifyingChildPresent).toBe(false);
    expect(wins(withOthers(other('10000', true)))).toBe(true);
    expect(wins(withOthers(other('10000', true), other('29999', true)))).toBe(true);
    // A nonparent who claims nothing has no effect, and parents alone limit the filer.
    expect(wins(row({ otherEligibleClaimants: [other('40000', false)] }))).toBe(true);
    expect(wins(withOthers(other('5000', true), other('40000', false)))).toBe(true);
    expect(wins(withOthers(other('20000', false, true)))).toBe(true);
    expect(wins(withOthers(other('40000', false, true)))).toBe(false);
    expect(wins(withOthers(other('5000', true), other('40000', false, true)))).toBe(false);
    // Stepparents and foster parents follow the nonparent rule; a biological or adoptive parent does not.
    for (const relationship of ['stepchild', 'foster child', 'niece']) expect(run(row({ ...withOthers(other('10000', true, true)), authorizedFosterPlacement: true }), relationship).qualifyingChildPresent, relationship).toBe(false);
    for (const relationship of ['son', 'daughter', 'adopted child']) expect(run(row({ otherEligibleClaimants: [{ name: 'Other parent', sourceReference: 'Fictional', claimsAnyChildTaxBenefit: false }] }), relationship).qualifyingChildPresent, relationship).toBe(true);
    expect(run(row({ otherEligibleClaimants: [{ name: 'Other parent', sourceReference: 'Fictional', claimsAnyChildTaxBenefit: false }] }), 'child').qualifyingChildPresent).toBe(true);
    expect(() => run(row({ otherEligibleClaimants: [{ name: 'Other parent', sourceReference: 'Fictional', claimsAnyChildTaxBenefit: true }] }), 'child')).toThrow(/contested competing-claim/);
  });

  it('rejects comparisons with no published method', () => {
    const others = { taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('10000', true)] };
    expect(() => run(row(others), 'grandchild', 'married_filing_jointly')).toThrow(/joint return needs a reviewer method/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('30000', false, true)] }))).toThrow(/equal AGI needs a reviewer method/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('30000', true)] }))).toThrow(/at or above the filer AGI/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('90000', true)] }))).toThrow(/at or above the filer AGI/);
    expect(() => wins(row({ otherEligibleClaimants: [other('10000', true)] }))).toThrow(/filer AGI/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [{ name: 'Parent', sourceReference: 'Fictional', adjustedGrossIncome: '1', claimsAnyChildTaxBenefit: false }] }))).toThrow(/claimant parent answer/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [{ name: 'Parent', sourceReference: 'Fictional', isParent: true, claimsAnyChildTaxBenefit: false }] }))).toThrow(/claimant AGI/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000' }))).toThrow(/no comparison to make/);
    expect(() => run(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('1', false)] }), 'child')).toThrow(/no comparison to make/);
  });

  it('keeps shared benefits with the person who has the child', () => {
    const claimed = { taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('10000', true, true)] }, message = /child tax credit or other dependent credit/;
    expect(() => run(row(claimed), 'grandchild', 'single', undefined, { qualifiesForCTC: true })).toThrow(message);
    expect(() => run(row(claimed), 'grandchild', 'single', undefined, { qualifiesForODC: true })).toThrow(message);
    expect(run(row(claimed), 'grandchild', 'single', undefined, { qualifiesForCTC: false, qualifiesForODC: false }).qualifyingChildPresent).toBe(false);
    expect(() => run(row(claimed), 'grandchild', 'head_of_household')).toThrow(/head of household/);
    expect(() => run(row({ marriedAtYearEnd: true, marriedChildDependency: 'cannot_claim' }), 'child', 'head_of_household')).toThrow(/head of household/);
    expect(run(row({ marriedAtYearEnd: true, marriedChildDependency: 'released_to_other_parent' }), 'child', 'head_of_household').qualifyingChildPresent).toBe(true);
    const second = { ...dependent('child'), firstName: 'Blake', ssn: '123456780' };
    const two = calculateEicQualifyingChildSources({ taxpayer: { taxYear: 2025, filingStatus: 'head_of_household', primary: { firstName: 'Sam', lastName: 'Lee', ssn: '987654321', dateOfBirth: '1960-01-01' }, dependents: [dependent('grandchild'), second] } as never,
      allCandidateChildrenIncluded: true, children: [row(claimed), row({ sourceId: 'dependent:1', original: second })] });
    expect(two.qualifyingChildSourceIds).toEqual(['dependent:1']);
    const married = (marriedChildDependency: EicCurrentChildSource['marriedChildDependency']) => row({ marriedAtYearEnd: true, marriedChildDependency });
    expect(() => run(married('cannot_claim'), 'child', 'single', undefined, { qualifiesForCTC: true })).toThrow(message);
    expect(() => run(married('released_to_other_parent'), 'child', 'single', undefined, { qualifiesForODC: true })).toThrow(message);
    expect(run(married('can_claim'), 'child', 'single', undefined, { qualifiesForCTC: true }).qualifyingChildPresent).toBe(true);
  });

  it('ties the entered AGI to the completed return', () => {
    const base = eicSeparatedReviewInput(), agi = calculateFederalTax(TaxYearInputSchema.parse(base)).agi;
    const relative = (taxpayerTiebreakAgi: string, parentAgi: string) => { const input = eicSeparatedReviewInput(); input.taxpayer.dependents[0]!.relationship = 'grandchild';
      const child = input.eic.separatedSpouseSources.children[0]!; child.original.relationship = 'grandchild';
      Object.assign(child, { taxpayerTiebreakAgi, otherEligibleClaimants: [other(parentAgi, true)] }); return TaxYearInputSchema.parse(input); };
    const won = calculateFederalTax(relative(agi.toFixed(), '1000'));
    expect(won.earnedIncomeCredit.gt(0)).toBe(true);
    const claimed = eicSeparatedReviewInput(); claimed.taxpayer.dependents[0]!.relationship = 'grandchild';
    const child = claimed.eic.separatedSpouseSources.children[0]!; child.original.relationship = 'grandchild';
    Object.assign(child, { taxpayerTiebreakAgi: agi.toFixed(), otherEligibleClaimants: [other(agi.plus(1).toFixed(), false, true)] });
    const lost = calculateFederalTax(TaxYearInputSchema.parse(claimed));
    expect(lost.earnedIncomeCredit.toFixed()).toBe('0');
    expect(lost.allLines.some(line => line.form === 'EIC' && line.line === 'tiebreaker' && line.value.eq(1))).toBe(true);
    expect(() => calculateFederalTax(relative(agi.plus('0.49').toFixed(), '1000'))).not.toThrow();
    const care = (taxId: string, firstName: string) => ({ expenses: '1000', qualifyingPersons: [{ firstName, lastName: 'Example', identifierType: 'tax_id', taxId, over12Disabled: false, qualifyingPersonConfirmed: true, qualifiedExpenses: '1000' }] });
    const person = claimed.taxpayer.dependents[0]!;
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...claimed, dependentCare: care(person.ssn, 'Someone') }))).toThrow(/dependent care benefit/);
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...claimed, dependentCare: care('111223333', person.firstName) }))).toThrow(/dependent care benefit/);
    expect(() => calculateFederalTax(relative(agi.plus(1).toFixed(), '1000'))).toThrow(new RegExp(`must match Form 1040 line 11, currently ${agi.toFixed()}`));
  });

  it('ties the entered AGI on the Form 8862 route too', () => {
    const agi = calculateFederalTax(form8862ReviewInput()).agi;
    const recertified = (taxpayerTiebreakAgi: string) => { const current = form8862Source(), row = form8862Child(current); current.taxpayer.dependents[0]!.relationship = 'grandchild'; row.original!.relationship = 'grandchild';
      Object.assign(row, { taxpayerTiebreakAgi, otherEligibleClaimants: [other(agi.plus(1).toFixed(), false, true)] }); return form8862ReviewInput(current); };
    const lost = calculateFederalTax(recertified(agi.toFixed()));
    expect(lost.allLines.some(line => line.form === 'EIC' && line.line === 'tiebreaker' && line.value.eq(1))).toBe(true);
    expect(() => calculateFederalTax(recertified(agi.minus(1).toFixed()))).toThrow(/must match Form 1040 line 11/);
  });

  it('accepts a negative filer AGI and rejects text', () => {
    expect(wins(row({ taxpayerTiebreakAgi: '-100', otherEligibleClaimants: [other('-500', true)] }))).toBe(true);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30,000', otherEligibleClaimants: [other('1', true)] }))).toThrow(/filer AGI needs an actual amount/);
    expect(() => wins(row({ taxpayerTiebreakAgi: 'x30000', otherEligibleClaimants: [other('1', true)] }))).toThrow(/filer AGI needs an actual amount/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000x', otherEligibleClaimants: [other('1', true)] }))).toThrow(/filer AGI needs an actual amount/);
  });
});
