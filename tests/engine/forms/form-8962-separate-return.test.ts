// Spec: spec/federal/form-8962-separate-return.yaml. Synthetic source records.
import { expect, it } from 'vitest';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { sharedPolicyFixture } from '../../fixtures/shared-policy.js';
import { separateReturnFixture } from '../../fixtures/separate-return-policy.js';

const policyOf = (input: ReturnType<typeof separateReturnFixture>) => input.form8962!.sharedPolicyAllocations!.policies![0]!;
const january = (result: ReturnType<typeof calculateForm8962SharedPolicy>) => { const row = result.months[0]!; return [row.premium.toFixed(), row.slcsp.toFixed(), row.advance.toFixed()]; };

it("allocates premium and advance credit with the filer's own benchmark", () => {
  const input = separateReturnFixture(true), before = JSON.stringify(input), result = calculateForm8962SharedPolicy(input);
  expect(january(result)).toEqual(['500', '420', '250']);
  expect(result.periods).toHaveLength(1);
  expect(result.periods[0]).toMatchObject({ firstMonth: 1, lastMonth: 12, method: 'separate_return_exception' });
  expect(result.periods[0]!.fraction.toFixed(2)).toBe('0.50');
  expect(result.lines.filter(line => line.line.startsWith('allocation-')).map(line => line.line)).toEqual(['allocation-1e', 'allocation-1g']);
  expect(JSON.stringify(input)).toBe(before);
});
it('applies Exception 1 to a married filer living apart', () => {
  const input = separateReturnFixture(true);
  input.taxpayer.filingStatus = 'head_of_household'; input.form8962!.marriedFilingSeparatelyExceptionConfirmed = undefined;
  policyOf(input).separateReturn!.livingApartExceptionConfirmed = true;
  expect(january(calculateForm8962SharedPolicy(input))).toEqual(['500', '420', '250']);
  expect(calculateFederalTax(input).form8962!.ptcAllowed.gt(0)).toBe(true);
  policyOf(input).separateReturn!.livingApartExceptionConfirmed = false;
  expect(() => calculateForm8962SharedPolicy(input)).toThrow(/living-apart exception/);
  for (const status of ['single', 'married_filing_separately', 'qualifying_surviving_spouse'] as const) {
    const other = separateReturnFixture(true); other.taxpayer.filingStatus = status;
    policyOf(other).separateReturn!.livingApartExceptionConfirmed = true;
    expect(() => calculateForm8962SharedPolicy(other)).toThrow(/living-apart exception/);
  }
  const joint = separateReturnFixture(true); joint.taxpayer.filingStatus = 'married_filing_jointly';
  policyOf(joint).separateReturn!.livingApartExceptionConfirmed = true;
  expect(() => calculateForm8962SharedPolicy(joint)).toThrow(/joint spouse/);
});
it('allocates only the advance credit without an exception', () => {
  const result = calculateForm8962SharedPolicy(separateReturnFixture(false));
  expect(january(result)).toEqual(['0', '0', '250']);
  expect(result.periods[0]).toMatchObject({ method: 'separate_return_advance_only' });
  expect(result.lines.filter(line => line.line.startsWith('allocation-')).map(line => line.line)).toEqual(['allocation-1g']);
});
it('reconciles half the advance credit on the return', () => {
  const repaid = calculateFederalTax(separateReturnFixture(false)).form8962!;
  expect(repaid.ptcAllowed.toFixed()).toBe('0');
  expect(repaid.excessAPTC.toFixed()).toBe('3000');
  expect(repaid.repaymentCap?.toFixed()).toBe('750');
  expect(repaid.excessAPTCRepayment.toFixed()).toBe('750');
  const credit = calculateFederalTax(separateReturnFixture(true)).form8962!;
  expect(credit.advancePTCTotal.toFixed()).toBe('3000');
  expect(credit.annualPremium.toFixed()).toBe('6000');
  expect(credit.annualSLCSP.toFixed()).toBe('5040');
  expect(credit.ptcAllowed.gt(0)).toBe(true);
});
it('accepts the matching spouse and a blank reported benchmark', () => {
  const input = separateReturnFixture(true);
  input.taxpayer.spouse = { firstName: 'Robin', lastName: 'Other', ssn: '234-56-7890', dateOfBirth: '1980-01-01' } as never;
  input.form1095A[0]!.monthlyPremiums = input.form1095A[0]!.monthlyPremiums.map(row => ({ ...row, slcsp: null }));
  policyOf(input).original = structuredClone(input.form1095A[0]);
  policyOf(input).separateReturn!.ownCoverageFamilySlcsp![0]!.slcsp = '950';
  expect(january(calculateForm8962SharedPolicy(input))).toEqual(['500', '950', '250']);
});
it('needs a source for an own benchmark above the reported figure', () => {
  const equal = separateReturnFixture(true); policyOf(equal).separateReturn!.ownCoverageFamilySlcsp![0]!.slcsp = '900';
  expect(calculateForm8962SharedPolicy(equal).periods[0]!.ownBenchmarkAboveReported).toBeUndefined();
  const above = separateReturnFixture(true); policyOf(above).separateReturn!.ownCoverageFamilySlcsp![0]!.slcsp = '950';
  expect(() => calculateForm8962SharedPolicy(above)).toThrow(/above the reported SLCSP/);
  policyOf(above).separateReturn!.benchmarkAboveReportedReference = 'Marketplace tax tool result';
  const result = calculateForm8962SharedPolicy(above);
  expect(january(result)).toEqual(['500', '950', '250']);
  expect(result.periods.every(period => period.ownBenchmarkAboveReported)).toBe(true);
  const zero = separateReturnFixture(true);
  zero.form1095A[0]!.monthlyPremiums = zero.form1095A[0]!.monthlyPremiums.map(row => ({ ...row, slcsp: '0' }));
  policyOf(zero).original = structuredClone(zero.form1095A[0]);
  expect(() => calculateForm8962SharedPolicy(zero)).toThrow(/above the reported SLCSP/);
});
it('explains each allocated amount in the review record', () => {
  const lines = (exception: boolean) => calculateForm8962SharedPolicy(separateReturnFixture(exception)).lines;
  expect(lines(true).find(line => line.line === 'allocation-1e')?.description).toBe('Equal allocation between spouses filing separately');
  expect(lines(false).find(line => line.line === 'month-1:premium')?.formula).toMatch(/only the advance credit/);
  expect(lines(true).find(line => line.line === 'month-1:premium')?.formula).not.toMatch(/only the advance credit/);
  expect(lines(true).find(line => line.line === 'month-1:slcsp')?.formula).toMatch(/own coverage-family benchmark/);
});
it('allocates a policy with no advance credit', () => {
  const input = separateReturnFixture(true);
  input.form1095A[0]!.monthlyPremiums = input.form1095A[0]!.monthlyPremiums.map(row => ({ ...row, advancePremiumTaxCredit: '0' }));
  policyOf(input).original = structuredClone(input.form1095A[0]);
  expect(january(calculateForm8962SharedPolicy(input))).toEqual(['500', '420', '0']);
});
it('requires the spouse the marriage and the benchmark sources', () => {
  const mutations: Array<[(input: ReturnType<typeof separateReturnFixture>) => void, RegExp]> = [
    [input => { input.form8962!.marriedFilingSeparatelyExceptionConfirmed = undefined; }, /exception answer/],
    [input => { policyOf(input).separateReturn!.sourceReference = ' '; }, /separate-return allocation reference/],
    [input => { policyOf(input).separateReturn!.marriedAtYearEndConfirmed = undefined; }, /year-end marriage/],
    [input => { policyOf(input).separateReturn!.onlySpouseTaxFamiliesConfirmed = false; }, /year-end marriage/],
    [input => { input.taxpayer.spouse = { firstName: 'Robin', lastName: 'Other', ssn: '345-67-8901', dateOfBirth: '1980-01-01' } as never; }, /actual spouse/],
    [input => { input.taxpayer.spouse = { firstName: 'Casey', lastName: 'Other', ssn: '234-56-7890', dateOfBirth: '1980-01-01' } as never; }, /actual spouse/],
    [input => { policyOf(input).agreementReference = 'Signed agreement'; }, /agreement or default/],
    [input => { policyOf(input).defaultAllocation = { sourceReference: 'Enrollment records' }; }, /agreement or default/],
    [input => { policyOf(input).separateReturn!.ownCoverageFamilySlcsp![2]!.slcsp = '900.01'; }, /above the reported SLCSP/],
    [input => { policyOf(input).agreementConfirmed = true; }, /agreement or default/],
    [input => { policyOf(input).monthlyAllocations = [{ month: 1, fraction: '0.75' }]; }, /agreement or default/],
    [input => { policyOf(input).separateReturn!.ownCoverageFamilySlcsp!.pop(); }, /each original month/],
    [input => { policyOf(input).separateReturn!.ownCoverageFamilySlcsp![1]!.month = 1; }, /duplicated/],
    [input => { policyOf(input).twoTaxFamiliesConfirmed = false; }, /two-family/],
    [input => { policyOf(input).coveredFamilyAssignments![1]!.family = 'this_return'; }, /conflicts|must have/],
    [input => { input.form1095A[0]!.coveredIndividuals![1]!.lastMonth = 6; policyOf(input).original = structuredClone(input.form1095A[0]); }, /month must have/],
  ];
  for (const [mutate, message] of mutations) { const input = separateReturnFixture(true); mutate(input); expect(() => calculateForm8962SharedPolicy(input)).toThrow(message); }
  const own = separateReturnFixture(false); policyOf(own).separateReturn!.ownCoverageFamilySlcsp = [{ month: 1, slcsp: '420' }];
  expect(() => calculateForm8962SharedPolicy(own)).toThrow(/does not allocate a benchmark/);
});
it('keeps other routes rejected', () => {
  const agreement = sharedPolicyFixture(); agreement.taxpayer.filingStatus = 'married_filing_separately';
  expect(() => calculateForm8962SharedPolicy(agreement)).toThrow(/separate-return allocation requires/);
  const single = separateReturnFixture(true); single.taxpayer.filingStatus = 'single';
  expect(() => calculateForm8962SharedPolicy(single)).toThrow(/actual separate return/);
  const second = separateReturnFixture(true), original = { ...structuredClone(second.form1095A[0]!), policyNumber: 'ACTUAL-POLICY-200', coveredIndividuals: [second.form1095A[0]!.coveredIndividuals![0]!] };
  second.form1095A.push(original);
  second.form8962!.sharedPolicyAllocations!.policies!.push({ sourceId: 'form1095A:1', original: structuredClone(original), situation: 'not_shared', unsharedSourceReference: 'Actual unshared record',
    allCoveredPeopleInThisTaxFamilyConfirmed: true, originalSlcspCorrectConfirmed: true });
  expect(() => calculateForm8962SharedPolicy(second)).toThrow(/second policy/);
});
