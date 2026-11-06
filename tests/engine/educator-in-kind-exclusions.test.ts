// Spec: spec/federal/educator-in-kind-exclusions.yaml. Derived source controls.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { reconcileEducatorEducationExclusions } from '@/engine/forms/educator-education-exclusions.js';
import { educatorInKindFixture } from '../fixtures/educator-in-kind.js';

it('reconciles actual in-kind earnings without deducting basis or another recipients benefit', () => {
  const input = educatorInKindFixture(), before = JSON.stringify(input);
  const educationDistributions = calculateForm1099Q(input.form1099Q ?? [], input.qualifiedEducationExpenses, { taxYear: 2026 });
  const result = reconcileEducatorEducationExclusions({ taxYear: 2026, filingStatus: 'single', educationDistributions, educatorSources: input.adjustments?.educatorExpenseSources });
  expect(result.ownerExclusions.map(row => row.qtpEarnings.toFixed())).toEqual(['800', '0']);
  expect(JSON.stringify(input)).toBe(before);
  expect(JSON.stringify(result)).not.toContain('prepaid-account');
  expect(JSON.stringify(result)).not.toContain('Synthetic actual tuition credit application');
  const source = input.adjustments?.educatorExpenseSources?.[0];
  if (!source || !input.form1099Q?.[0]) throw new Error('Missing synthetic records');
  source.nontaxableQualifiedTuitionProgramAmount = '0';
  input.form1099Q[0].recipientOwner = 'spouse';
  const spouseDistribution = calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses, { taxYear: 2026 });
  expect(reconcileEducatorEducationExclusions({ taxYear: 2026, filingStatus: 'married_filing_jointly', educationDistributions: spouseDistribution,
    educatorSources: [source] }).ownerExclusions.map(row => row.qtpEarnings.toFixed())).toEqual(['0', '800']);
  input.form1099Q[0].recipientOwner = 'other'; input.form1099Q[0].recipientId = 'outside-recipient';
  const outsideDistribution = calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses, { taxYear: 2026 });
  expect(reconcileEducatorEducationExclusions({ taxYear: 2026, filingStatus: 'single', educationDistributions: outsideDistribution,
    educatorSources: [source] }).ownerExclusions.map(row => row.qtpEarnings.toFixed())).toEqual(['0', '0']);
});
it('uses actual qualified benefits in both years canonical educator deductions', () => {
  for (const year of [2025, 2026]) {
    const input = educatorInKindFixture(year), result = calculateFederalTax(input);
    expect(result.schedule1?.educatorExpenses.toFixed()).toBe('200');
    expect(result.form1099Q?.taxableEarnings.toFixed()).toBe('0');
    expect(result.agi.toFixed()).toBe('49800');
    expect(result.allLines.filter(row => row.form === 'Educator education exclusions' && row.line === 'primary:qtp-exclusion').map(row => row.value.toFixed())).toEqual(['800']);
    const source = input.adjustments?.educatorExpenseSources?.[0]; if (!source) throw new Error('Missing synthetic educator');
    for (const wrong of ['0', '3200', '4000']) {
      source.nontaxableQualifiedTuitionProgramAmount = wrong;
      expect(() => calculateFederalTax(input)).toThrow(/reconcile.*educator/i);
    }
  }
});
it('preserves source boundaries and final exclusion rounding', () => {
  for (const [earnings, basis, declared] of [['800.49', '3199.51', '800'], ['800.50', '3199.50', '801'], ['0', '4000', '0']]) {
    const input = educatorInKindFixture(); const form = input.form1099Q?.[0], source = input.adjustments?.educatorExpenseSources?.[0];
    if (!form || !source) throw new Error('Missing synthetic records');
    form.earnings = earnings; form.basis = basis; source.nontaxableQualifiedTuitionProgramAmount = declared;
    const result = calculateFederalTax(input);
    expect(result.allLines.find(row => row.form === 'Educator education exclusions' && row.line === 'primary:qtp-exclusion')?.value.toFixed()).toBe(declared);
  }
  for (const mutation of ['missing-benefit', 'different-year', 'unknown-medium', 'different-amount', 'unknown-qualification']) {
    const input = educatorInKindFixture(); const form = input.form1099Q?.[0], facts = input.qualifiedEducationExpenses?.sourceFacts, benefit = facts?.inKindBenefits?.[0];
    if (!form || !facts || !benefit) throw new Error('Missing synthetic records');
    if (mutation === 'missing-benefit') facts.inKindBenefits = undefined;
    if (mutation === 'different-year') benefit.providedDate = '2025-08-15';
    if (mutation === 'unknown-medium') form.distributionMedium = undefined;
    if (mutation === 'different-amount') benefit.amount = '3999.99';
    if (mutation === 'unknown-qualification') benefit.qualificationConfirmed = undefined;
    expect(() => calculateFederalTax(input)).toThrow(/benefit|medium|in-kind|qualification/i);
  }
});
