// Spec: spec/federal/form-8962-marriage-first-day.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8962MarriageSources } from '@/engine/forms/form-8962-marriage-sources.js';
import { calculateForm8962MarriageWorksheets } from '@/engine/forms/form-8962-marriage-worksheets.js';
import { calculatePremiumTaxCreditReturn } from '@/engine/forms/premium-tax-credit-return.js';
import { d } from '@/utils/decimal.js';
import { marriageSourcesFixture } from '../../fixtures/marriage-sources.js';

function source(date: string, lastAlternativeMonth: number) {
  const input = marriageSourcesFixture(Number(date.slice(0, 4))), packet = input.form8962?.marriageSources;
  if (!packet?.benchmarks) throw new Error('Missing source fixture');
  packet.marriageDate = date;
  packet.benchmarks = packet.benchmarks.filter(row => (row.month ?? 0) <= lastAlternativeMonth);
  Object.assign(input.w2s[0], { wages: '117000', socialSecurityWages: '117000', medicareWages: '117000', federalWithheld: '0', accountHolder: 'primary' });
  return input;
}
function isolated(input: ReturnType<typeof source>, income = '117000') {
  return calculatePremiumTaxCreditReturn({ input, agi: d(income), taxExemptInterest: d(0), foreignIncomeReduction: d(0),
    foreignHousingDeduction: d(0), socialSecurityBenefitsGross: d(0), socialSecurityBenefitsTaxable: d(0) });
}

it('uses ordinary July credit for a July first wedding and preserves later-day treatment', () => {
  const input = source('2025-07-01', 6), before = JSON.stringify(input), result = calculateFederalTax(input), credit = result.form8962;
  expect(result.agi.toFixed()).toBe('117000');
  expect([credit?.ptcAllowed.toFixed(), credit?.advancePTCTotal.toFixed(), credit?.netPTC.toFixed(), credit?.excessAPTCRepayment.toFixed()])
    .toEqual(['6801', '8423', '0', '1622']);
  expect(credit?.marriageCalculation?.partV.map(row => row.stopMonth)).toEqual([6, 6]);
  expect(credit?.marriageCalculation?.months.filter(row => [6, 7, 8].includes(row.month)).map(row => [row.contribution.toFixed(), row.credit.toFixed()]))
    .toEqual([['548', '718'], ['768', '498'], ['768', '399']]);
  expect(result.allLines.filter(row => row.form === 'Sched 2' && row.line === '1a').map(row => row.value.toFixed())).toEqual(['1622']);
  expect(JSON.stringify(input)).toBe(before);
  const later = isolated(source('2025-07-02', 7));
  expect([later?.ptcAllowed.toFixed(), later?.excessAPTCRepayment.toFixed()]).toEqual(['7021', '1402']);
  expect(calculateForm8962MarriageSources(input)).toMatchObject({ marriageMonth: 7, lastPreMarriageMonth: 6 });
});

it('derives every February through December first-day cutoff from actual dates', () => {
  // Original separate policies continue all year. These are independent literal
  // totals at117000 joint income, monthly alternative718/ordinary498/APTC794.
  const expectedCredit = ['6196','6416','6636','6856','7076','7296','7516','7736','7956','8176','8396'];
  const expectedRepayment = ['3250','3112','2892','2672','2452','2232','2012','1792','1572','1352','1132'];
  for (let weddingMonth = 2; weddingMonth <= 12; weddingMonth++) {
    const input = source(`2025-${String(weddingMonth).padStart(2, '0')}-01`, 7), form = input.form8962, packet = form?.marriageSources;
    if (!form || !packet?.policies) throw new Error('Missing source fixture');
    input.form1095A = input.form1095A.slice(0, 2).map(policy => ({ ...policy,
      coveredIndividuals: policy.coveredIndividuals?.map(person => ({ ...person, lastMonth: 12 })),
      monthlyPremiums: Array.from({ length: 12 }, (_, i) => ({ ...policy.monthlyPremiums[0], month: i + 1 })) }));
    packet.policies = packet.policies.slice(0, 2).map((row, index) => ({ ...row, original: structuredClone(input.form1095A[index]) }));
    form.monthlyReconciliation = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, enrolleePremium: '1500', slcsp: '1266', advancePremiumTaxCredit: '794', coverageEligible: true, incomeBasedSepEnrollment: false }));
    packet.benchmarks = (['primary', 'spouse'] as const).flatMap(owner => Array.from({ length: weddingMonth - 1 }, (_, i) => ({
      owner, month: i + 1, slcsp: owner === 'primary' ? '433' : '833', sourceReference: 'Actual corrected source', sourceFactsConfirmed: true,
      coveredIndividualSsns: owner === 'primary' ? ['111-22-3333'] : ['444-55-6666','777-88-1111','777-88-2222'],
    })));
    const before = JSON.stringify(input), bound = calculateForm8962MarriageSources(input), result = isolated(input);
    expect(bound).toMatchObject({ marriageMonth: weddingMonth, lastPreMarriageMonth: weddingMonth - 1 });
    expect(result?.marriageCalculation?.partV.map(row => row.stopMonth)).toEqual([weddingMonth - 1, weddingMonth - 1]);
    expect([result?.ptcAllowed.toFixed(), result?.excessAPTCRepayment.toFixed()]).toEqual([expectedCredit[weddingMonth - 2], expectedRepayment[weddingMonth - 2]]);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('keeps full married months at the actual2026 joint income boundary', () => {
  const input = source('2026-07-01', 6), result = isolated(input, '130000');
  expect([result?.ptcAllowed.toFixed(), result?.advancePTCTotal.toFixed(), result?.netPTC.toFixed(), result?.excessAPTCRepayment.toFixed()])
    .toEqual(['2340', '8423', '0', '6083']);
  expect(result?.marriageCalculation?.months.find(row => row.month === 7)?.credit.toFixed()).toBe('0');
  expect(()=>calculateFederalTax(input)).toThrow(/2026/);
});

it('rejects January first and stale or missing completed month boundaries', () => {
  expect(() => calculateForm8962MarriageSources(source('2025-01-01', 0))).toThrow(/January 1.*not eligible|not eligible.*January 1/i);
  expect(() => calculateForm8962MarriageSources(source('2025-07-01', 7))).toThrow(/benchmark.*unmatched/i);
  const bound = calculateForm8962MarriageSources(source('2025-07-01', 6));
  const input = { ...bound, taxYear: 2025, fplRegion: 'contiguous' as const, householdIncome: d('117000') };
  for (const cutoff of [undefined, 0, 5, 8, 6.5, Number.NaN]) {
    expect(() => calculateForm8962MarriageWorksheets({ ...input, lastPreMarriageMonth: cutoff as number })).toThrow(/month|boundary/i);
  }
});
