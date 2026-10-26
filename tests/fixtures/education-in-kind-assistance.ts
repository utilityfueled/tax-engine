import { educatorInKindFixture } from './educator-in-kind.js';

/** Original synthetic records; assistance is not a calculated tax override. */
export function inKindAssistanceFixture(year = 2026) {
  const input = educatorInKindFixture(year);
  input.adjustments = undefined;
  input.educationExpenses = undefined;
  const facts = input.qualifiedEducationExpenses?.sourceFacts;
  const expense = facts?.expenses?.[0], allocation = facts?.allocations?.[0];
  if (!expense || !allocation) throw new Error('Missing source fixture');
  expense.taxFreeAssistance = '1000';
  allocation.amount = '3000';
  return input;
}
