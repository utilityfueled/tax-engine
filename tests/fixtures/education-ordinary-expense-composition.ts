import { inKindAssistanceFixture } from './education-in-kind-assistance.js';
import { cashAssistanceFixture, requiredCashAssistance as required } from './education-cash-assistance.js';
import { mixedTuitionFixture } from './education-mixed-tuition.js';

export { required };

/** Explicit fictional originals. No source fact here is an intake default. */
export function ordinaryEducationExpenseFixture(year = 2025) {
  const input = inKindAssistanceFixture(year);
  required(input.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0]).category = 'postsecondary_books';
  return input;
}

export function ordinaryEducationCashReceiptFixture(year = 2025) {
  const input = cashAssistanceFixture(year), facts = required(input.qualifiedEducationExpenses?.sourceFacts);
  const original = required(facts.expenses?.[0]);
  required(facts.expenses).push({ ...original, id: 'cash-books', category: 'postsecondary_books', amount: '1000',
    taxFreeAssistance: '0', educationCreditAmount: '0' });
  required(facts.allocations).push({ sourceId: 'cash-qtp', expenseId: 'cash-books', amount: '1000', creditAmount: '0' });
  return input;
}

export function ordinaryEducationEsaFixture(year = 2025) {
  const input = mixedTuitionFixture(year), facts = required(input.qualifiedEducationExpenses?.sourceFacts);
  Object.assign(required(facts.expenses?.[0]), { category: 'postsecondary_books', educationCreditAmount: '0' });
  Object.assign(required(facts.allocations?.[0]), { amount: '2000', creditAmount: '0' });
  input.educationExpenses = undefined;
  return input;
}

export function ordinaryEducationRefundFixture(year = 2025) {
  const input = ordinaryEducationExpenseFixture(year), facts = required(input.qualifiedEducationExpenses?.sourceFacts);
  Object.assign(required(facts.expenses?.[0]), { refundedAmount: '500', refundHistoryCompleteConfirmed: true });
  required(facts.allocations?.[0]).amount = '2500';
  Object.assign(facts, { expenseRefunds: [{ id: 'refund-one', expenseId: 'tuition', amount: '500',
    receivedDate: `${year}-09-15`, receivedByBeneficiary: true, disposition: 'cash_retained',
    sourceReference: 'fictional institution refund receipt', sourceFactsConfirmed: true }] });
  return input;
}
