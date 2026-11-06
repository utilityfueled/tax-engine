// Spec: spec/federal/marketplace-health-business-gross-sources.yaml.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { readMarketplacePartnershipGrossIncome } from '@/engine/forms/marketplace-health-business-gross.js';
import { partnershipHealthNegativeLimitInput } from '../../fixtures/marketplace-health-negative-limit.js';

it('binds actual ordinary partnership gross income without substituting net earnings', () => {
  const input = TaxYearInputSchema.parse(partnershipHealthNegativeLimitInput()), before = JSON.stringify(input);
  expect(readMarketplacePartnershipGrossIncome(input).map(row => [row.sourceId, row.amount.toFixed()])).toEqual([['scheduleK1:0', '10000'], ['scheduleK1:1', '40000']]);
  const first = input.form7206?.partnershipGrossIncomeSources?.statements?.[0];
  if (!first?.originalK1) throw new Error('Missing source');
  first.grossIncome = '10000.010000000000000000001';
  expect(readMarketplacePartnershipGrossIncome(input)[0].amount.toFixed()).toBe('10000.010000000000000000001');
  first.grossIncome = '10000';
  expect(JSON.stringify(input)).toBe(before);
  const zero = structuredClone(input);
  zero.scheduleK1[0].ordinaryIncome = '0'; zero.scheduleK1[0].selfEmploymentEarnings = '0';
  const row = zero.form7206!.partnershipGrossIncomeSources!.statements![0];
  row.originalK1!.ordinaryIncome = '0'; row.originalK1!.selfEmploymentEarnings = '0'; row.grossIncome = '0';
  expect(readMarketplacePartnershipGrossIncome(zero)[0].amount.toFixed()).toBe('0');
});
it('rejects unknown stale duplicate and net-substitution gross sources', () => {
  const input = TaxYearInputSchema.parse(partnershipHealthNegativeLimitInput());
  const changes: ((copy: typeof input) => void)[] = [
    c => { c.form7206!.partnershipGrossIncomeSources!.sourceTaxYear = 2024; },
    c => { c.form7206!.partnershipGrossIncomeSources!.sourceFactsConfirmed = undefined; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].grossIncome = undefined; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].grossIncome = '4999.99'; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].grossIncome = 'NaN'; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].sourceFactsConfirmed = false; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].allGrossIncomeIncludedConfirmed = undefined; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].originalK1!.ordinaryIncome = '5000.01'; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].originalK1!.partnershipEIN = '98-7654321'; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].accountHolder = 'spouse'; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].businessSourceId = 'scheduleC'; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements![0].businessSourceId = 'scheduleK1:00'; },
    c => { c.form7206!.partnershipGrossIncomeSources!.statements!.push(structuredClone(c.form7206!.partnershipGrossIncomeSources!.statements![0])); },
    c => { c.scheduleK1[0].guaranteedPayments = '0.01'; },
    c => { c.scheduleK1[0].interestIncome = '0.01'; },
    c => { c.scheduleK1[0].isForeignPartnership = true; },
    c => { c.scheduleK1[0].taxYear = undefined; },
  ];
  for (const change of changes) {
    const copy = structuredClone(input); change(copy); const before = JSON.stringify(copy);
    expect(() => readMarketplacePartnershipGrossIncome(copy)).toThrow(/gross|original|source|statement/);
    expect(JSON.stringify(copy)).toBe(before);
  }
  delete input.form7206!.partnershipGrossIncomeSources;
  expect(readMarketplacePartnershipGrossIncome(input)).toEqual([]);
});
