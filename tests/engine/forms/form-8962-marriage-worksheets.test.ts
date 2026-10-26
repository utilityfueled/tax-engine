// Spec: spec/federal/form-8962-marriage-worksheets.yaml.
import { expect, it } from 'vitest';
import { d } from '@/utils/decimal.js';
import { calculateForm8962MarriageWorksheets, type Form8962MarriageWorksheetInput } from '@/engine/forms/form-8962-marriage-worksheets.js';

function example(): Form8962MarriageWorksheetInput {
  return { taxYear: 2025, fplRegion: 'contiguous', householdIncome: d('117000'), familySize: 4, marriageMonth: 7,
    months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, premium: d(i < 7 ? '1500' : '1350'), slcsp: d(i < 7 ? '1266' : '1167'), advance: d(i < 7 ? '794' : '573'), coverageEligible: true })),
    families: [
      { owner: 'primary', familySize: 1, months: Array.from({ length: 7 }, (_, i) => ({ month: i + 1, premium: d('500'), slcsp: d('433'), coverageEligible: true })) },
      { owner: 'spouse', familySize: 3, months: Array.from({ length: 7 }, (_, i) => ({ month: i + 1, premium: d('1000'), slcsp: d('833'), coverageEligible: true })) },
    ] };
}
it('matches the published2025 aggregate marriage example with a declared compatible source split', () => {
  const input = example(), before = JSON.stringify(input), result = calculateForm8962MarriageWorksheets(input);
  expect(result.electionApplies).toBe(true);
  expect(result.ordinaryCredit.toFixed()).toBe('5481');
  expect(result.ordinaryRepayment.toFixed()).toBe('2942');
  expect(result.families.map(row => [row.halfIncome.toFixed(), row.fplPercentageForTable.toFixed(), row.monthlyContribution?.toFixed()])).toEqual([['58500', '388', '400'], ['58500', '226', '148']]);
  expect(result.alternativePreMarriageCredit.toFixed()).toBe('5026');
  expect(result.ordinaryPreMarriageCredit.toFixed()).toBe('3486');
  expect(result.ptcAllowed.toFixed()).toBe('7021');
  expect(result.advancePTCTotal.toFixed()).toBe('8423');
  expect(result.excessAPTCRepayment.toFixed()).toBe('1402');
  expect(result.partV.map(row => [row.owner, row.familySize, row.monthlyContribution.toFixed(), row.startMonth, row.stopMonth])).toEqual([['primary', 1, '400', 1, 7], ['spouse', 3, '148', 1, 7]]);
  expect(JSON.stringify(input)).toBe(before);
});
it('keeps the restored2026 cliff separate for joint and individual calculations', () => {
  const input = example(); Object.assign(input, { taxYear: 2026, householdIncome: d('90000'), familySize: 2, marriageMonth: 9 });
  input.months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, premium: d('1000'), slcsp: d('1000'), advance: d(i < 9 ? '400' : '300'), coverageEligible: true }));
  input.families = ['primary', 'spouse'].map(owner => ({ owner: owner as 'primary' | 'spouse', familySize: 1, months: Array.from({ length: 9 }, (_, i) => ({ month: i + 1, premium: d('500'), slcsp: d('500'), coverageEligible: true })) }));
  const result = calculateForm8962MarriageWorksheets(input);
  expect(result.ordinaryCredit.toFixed()).toBe('0');
  expect(result.electionApplies).toBe(true);
  expect(result.families.map(row => [row.fplPercentageForTable.toFixed(), row.monthlyContribution?.toFixed()])).toEqual([['287', '359'], ['287', '359']]);
  expect(result.ptcAllowed.toFixed()).toBe('2538');
  expect(result.excessAPTCRepayment.toFixed()).toBe('1962');
  expect(result.repaymentCap).toBeNull();
  expect(result.months.filter(row => row.month > 9).map(row => row.credit.toFixed())).toEqual(['0', '0', '0']);
  input.householdIncome = d('125202');
  const above = calculateForm8962MarriageWorksheets(input);
  expect(above.families.map(row => row.fplPercentageForTable.toFixed())).toEqual(['401', '401']);
  expect(above.electionApplies).toBe(false);
  expect(above.ptcAllowed.toFixed()).toBe('0');
  expect(above.excessAPTCRepayment.toFixed()).toBe('4500');
});
it('preserves source cents and independent worksheet rounding without inventing a residual', () => {
  const input = example(); input.householdIncome = d('117001');
  for (const family of input.families) for (const row of family.months) { row.premium = row.premium.plus('.49'); row.slcsp = row.slcsp.plus('.49'); }
  for (const row of input.months.filter(row => row.month <= 7)) { row.premium = row.premium.plus('.98'); row.slcsp = row.slcsp.plus('.98'); }
  const before = JSON.stringify(input), result = calculateForm8962MarriageWorksheets(input);
  expect(result.families.map(row => row.halfIncome.toFixed())).toEqual(['58501', '58501']);
  expect(result.months[0].premium.toFixed()).toBe('1501');
  expect(result.months[0].slcsp.toFixed()).toBe('1267');
  expect(result.months[0].maximumCredit.toFixed()).toBe('719');
  expect(result.months[0].credit.toFixed()).toBe('718');
  expect(result.ptcAllowed.toFixed()).toBe('7021');
  expect(JSON.stringify(input)).toBe(before);
});
it('retains the ordinary result when the alternative cannot reduce excess advances', () => {
  const input = example(); input.householdIncome = d('30000'); input.familySize = 2;
  input.months.forEach(row => Object.assign(row, { premium: d('1000'), slcsp: d('900'), advance: d('1000') }));
  input.families.forEach(family => { family.familySize = 1; family.months.forEach(row => Object.assign(row, { premium: d('500'), slcsp: d('450') })); });
  const noBenefit = calculateForm8962MarriageWorksheets(input);
  expect(noBenefit.electionApplies).toBe(false); expect(noBenefit.reason).toBe('no-benefit');
  expect(noBenefit.partV).toEqual([]); expect(noBenefit.excessAPTCRepayment.toFixed()).toBe('750');
  const noExcess = example(); noExcess.months.forEach(row => { row.advance = d('100'); });
  const ordinary = calculateForm8962MarriageWorksheets(noExcess);
  expect(ordinary.electionApplies).toBe(false); expect(ordinary.reason).toBe('no-excess-advance');
  expect(ordinary.ptcAllowed.toFixed()).toBe('5481'); expect(ordinary.netPTC.toFixed()).toBe('4281');
});
it('uses only actual owner coverage months and preserves post-marriage credit', () => {
  const input = example(); input.families[1].months = []; input.families[0].months = input.families[0].months.slice(0, 3);
  input.months = input.months.filter(row => row.month <= 3 || row.month > 7);
  for (const row of input.months.filter(row => row.month <= 3)) Object.assign(row, { premium: d('500'), slcsp: d('433'), advance: d('200') });
  const result = calculateForm8962MarriageWorksheets(input);
  expect(result.partV.map(row => [row.owner, row.startMonth, row.stopMonth])).toEqual([['primary', 1, 3]]);
  expect(result.ptcAllowed.toFixed()).toBe('2094');
  expect(result.excessAPTCRepayment.toFixed()).toBe('1371');
  expect(result.months.filter(row => row.month > 7).map(row => row.credit.toFixed())).toEqual(['399', '399', '399', '399', '399']);
});
it('never creates a refundable credit from the alternative marriage calculation', () => {
  const input = example(); input.months.forEach(row => { row.advance = d(row.month <= 7 ? '600' : '500'); });
  const result = calculateForm8962MarriageWorksheets(input);
  expect(result.electionApplies).toBe(true); expect(result.ptcAllowed.toFixed()).toBe('7021');
  expect(result.advancePTCTotal.toFixed()).toBe('6700'); expect(result.netPTC.toFixed()).toBe('0');
  expect(result.excessAPTCRepayment.toFixed()).toBe('0');
  expect(result.lines.filter(row => row.form === 'Form 8962' && ['27', '28', '29'].includes(row.line))).toEqual([]);
});
it('rejects missing duplicated and inconsistent original monthly amounts', () => {
  const unknown = example(); delete (unknown.months[0] as { coverageEligible?: boolean }).coverageEligible;
  expect(() => calculateForm8962MarriageWorksheets(unknown)).toThrow(/eligible|eligibility|coverage/i);
  const duplicate = example(); duplicate.families[0].months.push(duplicate.families[0].months[0]);
  expect(() => calculateForm8962MarriageWorksheets(duplicate)).toThrow(/duplicate|once/i);
  const altered = example(); altered.families[0].months[0].premium = d('500.01');
  expect(() => calculateForm8962MarriageWorksheets(altered)).toThrow(/premium|reconcile/i);
  const hole = example(); hole.families[0].months.splice(1, 1);
  expect(() => calculateForm8962MarriageWorksheets(hole)).toThrow(/month|missing|reconcile/i);
  const post = example(); post.families[0].months[0].month = 8;
  expect(() => calculateForm8962MarriageWorksheets(post)).toThrow(/month|marriage/i);
  const owners = example(); owners.families[1].owner = 'primary';
  expect(() => calculateForm8962MarriageWorksheets(owners)).toThrow(/owner|once/i);
});
it('does not lose ordinary credit hidden by an excluded alternative owner month', () => {
  const input: Form8962MarriageWorksheetInput = { taxYear: 2026, fplRegion: 'contiguous', householdIncome: d('126000'), familySize: 4, marriageMonth: 7,
    months: [
      { month: 1, premium: d('1500'), slcsp: d('1500'), advance: d('1500'), coverageEligible: true },
      { month: 2, premium: d('500'), slcsp: d('450'), advance: d('500'), coverageEligible: true },
    ], families: [
      { owner: 'primary', familySize: 1, months: [{ month: 1, premium: d('1500'), slcsp: d('1500'), coverageEligible: true }] },
      { owner: 'spouse', familySize: 3, months: [{ month: 2, premium: d('500'), slcsp: d('450'), coverageEligible: true }] },
    ] };
  const result = calculateForm8962MarriageWorksheets(input);
  expect(result.alternativePreMarriageCredit.toFixed()).toBe('34');
  expect(result.ordinaryPreMarriageCredit.toFixed()).toBe('0');
  expect(result.electionApplies).toBe(false); expect(result.reason).toBe('no-benefit');
  expect(result.ptcAllowed.toFixed()).toBe('454'); expect(result.excessAPTCRepayment.toFixed()).toBe('1546');
});
