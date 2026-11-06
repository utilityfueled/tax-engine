import { inKindCoordinationFixture } from './education-in-kind-coordination.js';
import { educatorInKindFixture } from './educator-in-kind.js';

export function requiredCashAssistance<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing explicit fictional cash-assistance source');
  return value;
}

/** Actual fictional sources, not a default allocation or inferred election. */
export function cashAssistanceFixture(year = 2025) {
  const input = inKindCoordinationFixture(year, false);
  const facts = requiredCashAssistance(input.qualifiedEducationExpenses?.sourceFacts);
  const expense = requiredCashAssistance(facts.expenses?.[0]);
  const prepaid = requiredCashAssistance(input.form1099Q[0]);
  expense.amount = '10000';
  Object.assign(requiredCashAssistance(facts.allocations?.[0]), { amount: '3500', creditAmount: '500' });
  input.form1099Q.push({ ...prepaid, sourceId: 'cash-qtp', accountId: 'fictional-cash-qtp-account',
    distributionMedium: 'cash', grossDistribution: '8000', earnings: '2000', basis: '6000' });
  requiredCashAssistance(facts.allocations).push({ sourceId: 'cash-qtp', expenseId: expense.id, amount: '4500', creditAmount: '500' });
  return input;
}

export function cashAssistanceEducatorFixture(year = 2025) {
  const input = cashAssistanceFixture(year);
  input.adjustments = educatorInKindFixture(year).adjustments;
  const educator = requiredCashAssistance(input.adjustments?.educatorExpenseSources?.[0]);
  requiredCashAssistance(educator.expenses[0]).amount = '2500';
  educator.nontaxableQualifiedTuitionProgramAmount = '1825';
  educator.nontaxableCoverdellEarnings = '0';
  return input;
}
