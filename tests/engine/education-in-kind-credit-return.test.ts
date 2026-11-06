// Spec: spec/federal/form-1099-q-in-kind-credit.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { inKindCreditFixture } from '../fixtures/education-in-kind-credit.js';

it('coordinates tuition credit income and actual educator exclusion once', () => {
  for (const [year, educatorDeduction, agi] of [[2025, '300', '49900'], [2026, '350', '49850']] as const) {
    const input = inKindCreditFixture(year), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.form1099Q?.taxableEarnings.toFixed()).toBe('200');
    expect(result.form1099Q?.netPenalty.toFixed()).toBe('0');
    expect(result.schedule1?.educatorExpenses.toFixed()).toBe(educatorDeduction);
    expect(result.form8863?.llcAfterPhaseOut.toFixed()).toBe('200');
    expect(result.agi.toFixed()).toBe(agi);
    expect(result.allLines.filter(row => row.form === 'Sched 1' && row.line === '8z').map(row => row.value.toFixed())).toEqual(['200']);
    expect(JSON.stringify(input)).toBe(before);
    const educator = input.adjustments?.educatorExpenseSources?.[0]; if (!educator) throw new Error('Missing educator');
    for (const wrong of ['0', '800', '4000']) {
      educator.nontaxableQualifiedTuitionProgramAmount = wrong;
      expect(() => calculateFederalTax(input)).toThrow(/reconcile.*educator/i);
    }
    const withoutClaim = inKindCreditFixture(year); withoutClaim.educationExpenses = undefined;
    expect(() => calculateFederalTax(withoutClaim)).toThrow(/credit.*student|student.*credit/);
    const noAllowedCredit = inKindCreditFixture(year), wage = noAllowedCredit.w2s[0];
    if (!wage) throw new Error('Missing wage source');
    wage.wages = '100000';
    expect(() => calculateFederalTax(noAllowedCredit)).toThrow(/allocation.*credit|credit.*allocation/);
  }
});

it('binds in-kind recipients to actual return identities before routing income', () => {
  for (const year of [2025, 2026]) {
    const baseline = inKindCreditFixture(year); baseline.adjustments = undefined;
    expect(calculateFederalTax(baseline).agi.toFixed()).toBe('50200');
    for (const mutation of ['outside-label', 'wrong-primary', 'missing-identity']) {
      const input = inKindCreditFixture(year); input.adjustments = undefined;
      const form = input.form1099Q?.[0], beneficiary = input.qualifiedEducationExpenses?.sourceFacts?.beneficiaries?.[0];
      if (!form || !beneficiary) throw new Error('Missing source');
      if (mutation === 'outside-label') { form.recipientOwner = 'other'; form.recipientId = 'outside-person'; }
      if (mutation === 'wrong-primary') beneficiary.studentTaxId = '999-88-7777';
      if (mutation === 'missing-identity') beneficiary.studentTaxId = undefined;
      expect(() => calculateFederalTax(input)).toThrow(/in-kind.*recipient|beneficiary.*identity/);
    }
    const actualOutside = inKindCreditFixture(year); actualOutside.adjustments = undefined; actualOutside.educationExpenses = undefined;
    const facts = actualOutside.qualifiedEducationExpenses?.sourceFacts;
    const form = actualOutside.form1099Q?.[0], beneficiary = facts?.beneficiaries?.[0], expense = facts?.expenses?.[0], benefit = facts?.inKindBenefits?.[0], allocation = facts?.allocations?.[0];
    if (!form || !beneficiary || !expense || !benefit || !allocation) throw new Error('Missing source');
    form.recipientOwner = 'other'; form.recipientId = 'outside-person'; beneficiary.studentTaxId = '999-88-7777';
    expense.qualificationConfirmed = false; benefit.qualificationConfirmed = false; expense.educationCreditAmount = '0';
    allocation.amount = '4000'; allocation.creditAmount = '0';
    const result = calculateFederalTax(actualOutside);
    expect(result.agi.toFixed()).toBe('50000');
    expect(result.form1099Q?.perRecipient[0]?.taxableEarnings.toFixed()).toBe('800');
    expect(result.form1099Q?.taxableEarnings.toFixed()).toBe('0');
    expect(JSON.stringify(result.form1099Q)).not.toContain('999-88-7777');
    const joint = inKindCreditFixture(year); joint.adjustments = undefined;
    joint.taxpayer.filingStatus = 'married_filing_jointly';
    joint.taxpayer.spouse = { ...joint.taxpayer.primary, firstName: 'Alex', ssn: '987-65-4321' };
    joint.w2s.forEach(wage => { wage.accountHolder = 'primary'; });
    const jointBeneficiary = joint.qualifiedEducationExpenses?.sourceFacts?.beneficiaries?.[0], jointForm = joint.form1099Q?.[0];
    const jointStudent = joint.educationExpenses?.llcStudents?.[0];
    if (!jointBeneficiary || !jointForm || !jointStudent) throw new Error('Missing joint source');
    jointBeneficiary.studentTaxId = '987654321'; jointForm.recipientOwner = 'spouse';
    jointStudent.studentTaxId = '987-65-4321'; jointStudent.studentRole = 'spouse';
    expect(calculateFederalTax(joint).form1099Q?.taxableEarnings.toFixed()).toBe('200');
    jointForm.recipientOwner = 'other'; jointForm.recipientId = 'outside-person';
    expect(() => calculateFederalTax(joint)).toThrow(/in-kind.*recipient/);
  }
});
