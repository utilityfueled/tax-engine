// Spec: spec/federal/eic-qualifying-child-tiebreaker.yaml.
import { describe, expect, it } from 'vitest';
import { calculateEicQualifyingChildSources } from '@/engine/forms/eic-qualifying-child-sources.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import type { EicCurrentChildSource } from '@/models/form-8862-sources.js';
import { eicSeparatedReviewInput } from '../fixtures/eic-separated-review.js';

const dependent = (relationship: string) => ({ firstName: 'Avery', lastName: 'Lee', ssn: '123456789', dateOfBirth: '2012-05-01', relationship, monthsLivedWithYou: 12 });
const row = (patch: Partial<EicCurrentChildSource> = {}): EicCurrentChildSource => ({ sourceId: 'dependent:0', sourceReference: 'Fictional home records', sourceFactsConfirmed: true, original: dependent('grandchild'), livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true, specialResidencePeriodClaimed: false, marriedAtYearEnd: false,
  jointReturnFiled: false, fullTimeStudentForFiveMonths: false, permanentlyAndTotallyDisabled: false, authorizedFosterPlacement: false, validSsnIssuedByDueDate: true, allOtherEligibleClaimantsIncluded: true, otherEligibleClaimants: [], ...patch });
const run = (source: EicCurrentChildSource, relationship = 'grandchild', filingStatus: 'single' | 'married_filing_jointly' = 'single', child = { ...source, original: dependent(relationship) }) => calculateEicQualifyingChildSources({
  taxpayer: { taxYear: 2025, filingStatus, primary: { firstName: 'Sam', lastName: 'Lee', ssn: '987654321', dateOfBirth: '1960-01-01' }, spouse: filingStatus === 'single' ? undefined : { firstName: 'Pat', lastName: 'Lee', ssn: '987654322', dateOfBirth: '1960-01-01' },
    dependents: [dependent(relationship)] } as never, allCandidateChildrenIncluded: true, children: [child] });
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
    const agi = { taxpayerTiebreakAgi: '30000' };
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('10000', true, true)] }))).toBe(false);
    expect(run(row({ ...agi, otherEligibleClaimants: [other('10000', true, true)] })).children[0]!.tiebreakLost).toBe(true);
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('10000', true)] }))).toBe(true);
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('40000', true)] }))).toBe(false);
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('10000', true), other('29999', true)] }))).toBe(true);
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('10000', true), other('30001', true)] }))).toBe(false);
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('20000', false)] }))).toBe(true);
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('40000', false)] }))).toBe(false);
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('20000', false, true)] }))).toBe(true);
    expect(wins(row({ ...agi, otherEligibleClaimants: [other('40000', false, true)] }))).toBe(false);
    expect(run(row({ otherEligibleClaimants: [{ name: 'Other parent', sourceReference: 'Fictional', claimsAnyChildTaxBenefit: false }] }), 'child').qualifyingChildPresent).toBe(true);
    expect(() => run(row({ otherEligibleClaimants: [{ name: 'Other parent', sourceReference: 'Fictional', claimsAnyChildTaxBenefit: true }] }), 'child')).toThrow(/contested competing-claim/);
  });

  it('rejects comparisons with no published method', () => {
    const others = { taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('10000', true)] };
    expect(() => run(row(others), 'grandchild', 'married_filing_jointly')).toThrow(/joint return needs a reviewer method/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('30000', true)] }))).toThrow(/equal AGI needs a reviewer method/);
    expect(() => wins(row({ otherEligibleClaimants: [other('10000', true)] }))).toThrow(/filer AGI/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [{ name: 'Parent', sourceReference: 'Fictional', adjustedGrossIncome: '1', claimsAnyChildTaxBenefit: false }] }))).toThrow(/claimant parent answer/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [{ name: 'Parent', sourceReference: 'Fictional', isParent: true, claimsAnyChildTaxBenefit: false }] }))).toThrow(/claimant AGI/);
    expect(() => wins(row({ taxpayerTiebreakAgi: '30000' }))).toThrow(/no comparison to make/);
    expect(() => run(row({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [other('1', false)] }), 'child')).toThrow(/no comparison to make/);
  });

  it('ties the entered AGI to the completed return', () => {
    const base = eicSeparatedReviewInput(), agi = calculateFederalTax(TaxYearInputSchema.parse(base)).agi;
    const relative = (taxpayerTiebreakAgi: string, parentAgi: string) => { const input = eicSeparatedReviewInput(); input.taxpayer.dependents[0]!.relationship = 'grandchild';
      const child = input.eic.separatedSpouseSources.children[0]!; child.original.relationship = 'grandchild';
      Object.assign(child, { taxpayerTiebreakAgi, otherEligibleClaimants: [other(parentAgi, true)] }); return TaxYearInputSchema.parse(input); };
    const won = calculateFederalTax(relative(agi.toFixed(), '1000'));
    expect(won.earnedIncomeCredit.gt(0)).toBe(true);
    expect(calculateFederalTax(relative(agi.toFixed(), agi.plus(1).toFixed())).earnedIncomeCredit.toFixed()).toBe('0');
    expect(() => calculateFederalTax(relative(agi.plus(1).toFixed(), '1000'))).toThrow(/must match Form 1040 line 11/);
  });
});
