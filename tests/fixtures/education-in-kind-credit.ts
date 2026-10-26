import { TaxYearInputSchema } from '@/models/inputs.js';
import { educatorInKindFixture } from './educator-in-kind.js';

/** Derived synthetic source records, including the actual claimed LLC student. */
export function inKindCreditFixture(year = 2026) {
  const input = educatorInKindFixture(year);
  const facts = input.qualifiedEducationExpenses?.sourceFacts;
  const expense = facts?.expenses?.[0], allocation = facts?.allocations?.[0];
  const educator = input.adjustments?.educatorExpenseSources?.[0];
  if (!expense || !allocation || !educator) throw new Error('Missing synthetic actual sources');
  expense.educationCreditAmount = '1000'; allocation.amount = '3000'; allocation.creditAmount = '1000';
  educator.nontaxableQualifiedTuitionProgramAmount = '600';
  return TaxYearInputSchema.parse({ ...input, educationExpenses: {
    primarySsnEligible: true, primaryTinEligible: true, claimedAsDependent: false,
    nonresidentAlien: false, aocBanInEffect: false, form8862Required: false,
    possessionIncomeExclusion: '0', aocStudents: [], llcExpenses: '1000',
    llcStudents: [{ name: 'Jane Doe', studentTaxId: input.taxpayer.primary.ssn,
      studentRole: 'primary', qualifiedExpenses: '1000', studentSsnEligible: true,
      studentTinEligible: true, institutionEligible: true, expensesEligibilityConfirmed: true,
      form1098TRequirementMet: true, courseEligibilityConfirmed: true }],
  } });
}
