// Spec: spec/federal/marketplace-marriage-health.yaml, indexed.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8962 } from '@/engine/forms/form-8962.js';
import { calculateMarketplaceHealthDeduction } from '@/engine/forms/marketplace-health-deduction.js';
import { d } from '@/utils/decimal.js';
import { marketplaceMarriageHealthInput } from '../fixtures/marketplace-marriage-health.js';
it('preserves final joint ineligibility with actual pre-marriage credit', async () => {
  const input = marketplaceMarriageHealthInput(2026), before = structuredClone(input);
  const result = calculateFederalTax(input), credit = result.form8962!;
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('4189');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('7811');
  expect(result.agi.toFixed()).toBe('85124');
  expect(credit.taxpayerEligible).toBe(false);
  expect(credit.marriageCalculation!.electionApplies).toBe(true);
  expect([credit.ptcAllowed, credit.excessAPTCRepayment, credit.netPTC].map(value => value.toFixed())).toEqual(['3346', '5054', '0']);
  expect(result.schedule1!.seHealthInsurance.lte(credit.excessAPTCRepayment.plus('3600'))).toBe(true);
  expect(input).toEqual(before);
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026|qualified|supported/i);
});
it('rejects altered or missing alternative-credit evidence', () => {
  const input = marketplaceMarriageHealthInput(2026);
  const credit = calculateForm8962({ taxYear: 2026, filingStatus: 'married_filing_jointly',
    facts: { ...input.form8962, taxpayerModifiedAGI: '85124' }, form1095A: input.form1095A,
    allocationHousehold: { taxpayer: input.taxpayer, standardDeductionFacts: input.standardDeductionFacts, form7206: input.form7206 },
    healthInsuranceCoordination: 'pub974-simplified-2026' });
  const groups = [{ businessSourceId:'scheduleC',accountHolder:'primary' as const,specifiedPremiums:d('12000'),remainingEarnedIncome:d('92935'),nonspecifiedDeduction:d(0),
    months:Array.from({length:12},(_,i)=>({month:i+1,specifiedPremium:d('1000'),sourcePremium:d('1000'),advancePremiumTaxCredit:d('700')})) }];
  const apply = () => calculateMarketplaceHealthDeduction({input,groups,credit});
  expect(apply().businesses[0].allocatedCredit.toFixed()).toBe('3346');
  const actual = credit.marriageCalculation!;
  credit.marriageCalculation = undefined;
  expect(apply).toThrow(/marriage/i);
  credit.marriageCalculation = actual;
  actual.families[0].months[0].credit = actual.families[0].months[0].credit.plus(1);
  actual.families[0].months[1].credit = actual.families[0].months[1].credit.minus(1);
  expect(apply).toThrow(/marriage/i);
});
