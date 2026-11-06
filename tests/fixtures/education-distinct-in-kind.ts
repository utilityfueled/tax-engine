import { TaxYearInputSchema } from '@/models/inputs.js';
import { inKindAssistanceFixture } from './education-in-kind-assistance.js';
import { inKindCreditFixture } from './education-in-kind-credit.js';

/** Separate fictional original statements and tuition records, not tax overrides. */
export function distinctInKindFixture(year = 2026, credit = false) {
  const input = inKindAssistanceFixture(year), facts = input.qualifiedEducationExpenses?.sourceFacts;
  const source = input.form1099Q[0], expense = facts?.expenses?.[0], benefit = facts?.inKindBenefits?.[0], allocation = facts?.allocations?.[0];
  if (!source || !expense || !benefit || !allocation || !facts) throw new Error('Incomplete synthetic source fixture');
  input.form1099Q.push({ ...source, sourceId: 'second-prepaid', accountId: 'second-actual-account', grossDistribution: '6000', earnings: '900', basis: '5100' });
  facts.expenses?.push({ ...expense, id: 'second-tuition', paidDate: `${year}-01-15`, amount: '6000', taxFreeAssistance: '1500' });
  facts.inKindBenefits?.push({ ...benefit, id: 'second-benefit', sourceId: 'second-prepaid', expenseId: 'second-tuition', amount: '6000', providedDate: `${year}-01-15`, sourceReference: 'Second actual synthetic tuition benefit' });
  facts.allocations?.push({ ...allocation, sourceId: 'second-prepaid', expenseId: 'second-tuition', amount: '4500' });
  if (credit) {
    const secondExpense = facts.expenses?.[1], secondAllocation = facts.allocations?.[1];
    if (!secondExpense || !secondAllocation) throw new Error('Missing second source');
    expense.educationCreditAmount = '1000'; allocation.creditAmount = '1000'; allocation.amount = '2000';
    secondExpense.educationCreditAmount = '500'; secondAllocation.creditAmount = '500'; secondAllocation.amount = '4000';
    input.educationExpenses = inKindCreditFixture(year).educationExpenses;
    const student = input.educationExpenses?.llcStudents?.[0];
    if (!input.educationExpenses || !student) throw new Error('Missing actual synthetic credit source');
    input.educationExpenses.llcExpenses = '1500'; student.qualifiedExpenses = '1500';
  }
  return TaxYearInputSchema.parse(input);
}
