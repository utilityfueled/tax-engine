import { expect, it } from 'vitest';
import { EicConfigSchema, TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

// Spec: spec/federal/eic-investment-income-presence.yaml. Fictional sources only.
function input(interest = '12000', eic?: unknown) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '2000', federalWithheld: '0', socialSecurityWages: '2000', socialSecurityWithheld: '124', medicareWages: '2000', medicareWithheld: '29' }],
    form1099Int: [{ payer: 'Fictional Bank', payerEin: '12-3456789', interestIncome: interest }], eic,
  });
}
function credit(value: ReturnType<typeof input>) {
  return calculateFederalTax(value).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed();
}
it('preserves absent override facts and validates an explicit legacy total', () => {
  expect(EicConfigSchema.parse({}).investmentIncomeOverride).toBeUndefined();
  expect(EicConfigSchema.parse(JSON.parse(JSON.stringify(EicConfigSchema.parse({}))))).not.toHaveProperty('investmentIncomeOverride');
  expect(EicConfigSchema.parse({ investmentIncomeOverride: '0' }).investmentIncomeOverride).toBe('0');
  expect(EicConfigSchema.parse({ investmentIncomeOverride: '11950.01' }).investmentIncomeOverride).toBe('11950.01');
  expect(EicConfigSchema.safeParse({ investmentIncomeOverride: '-1' }).success).toBe(false);
});
it('keeps the actual investment ceiling when an EIC record is opened', () => {
  expect(credit(input())).toBe('0');
  const opened = input('12000', {}), before = JSON.stringify(opened);
  expect(credit(opened)).toBe('0');
  expect(JSON.stringify(opened)).toBe(before);
});
it('keeps claimant and investment sources independent through save and reopen', () => {
  const facts = { claimantEligibility: { sourceTaxYear: 2025, sourceReference: 'Synthetic confirmed claimant records', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false, qualifyingChildOfAnotherTaxpayer: false } } };
  const saved = JSON.stringify(input('12000', facts));
  expect(credit(TaxYearInputSchema.parse(JSON.parse(saved)))).toBe('0');
  expect(credit(input('11950', facts))).toBe('155');
});
