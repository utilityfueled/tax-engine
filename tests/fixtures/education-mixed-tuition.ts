import { inKindCoordinationFixture } from './education-in-kind-coordination.js';
import { tuitionAccountGroupFixture } from './education-tuition-account-group.js';
import { educatorInKindFixture } from './educator-in-kind.js';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing explicit fictional mixed tuition source');
  return value;
}

/** Explicit fictional original records; never a default allocation or basis. */
export function mixedTuitionFixture(year = 2025, multipleEsa = false) {
  const input = multipleEsa ? tuitionAccountGroupFixture(year) : inKindCoordinationFixture(year);
  const facts = required(input.qualifiedEducationExpenses?.sourceFacts), first = required(input.form1099Q[0]);
  const expense = required(facts.expenses?.[0]);
  input.form1099Q.push({ ...first, sourceId: 'cash-qtp', accountId: 'actual-cash-qtp-account', distributionMedium: 'cash',
    grossDistribution: '2000', earnings: '1000', basis: '1000' });
  required(facts.allocations?.find(row => row.sourceId === 'esa')).amount = multipleEsa ? '2000' : '4000';
  required(facts.allocations).push({ sourceId: 'cash-qtp', expenseId: expense.id, amount: '1000', creditAmount: '0' });
  return input;
}

export function mixedTuitionEducatorFixture(year = 2025) {
  const input = mixedTuitionFixture(year);
  input.adjustments = educatorInKindFixture(year).adjustments;
  const educator = required(input.adjustments?.educatorExpenseSources?.[0]);
  required(educator.expenses[0]).amount = '2000';
  educator.nontaxableQualifiedTuitionProgramAmount = '700';
  educator.nontaxableCoverdellEarnings = '800';
  return input;
}
