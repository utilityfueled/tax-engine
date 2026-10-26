/** Original source conservation; form-1099-q-distinct-in-kind-assistance.yaml. */
import Decimal from 'decimal.js';
import type { Form1099Q, QualifiedEducationExpenseSummary } from '@/models/inputs.js';
import { d, sum } from './decimal.js';

type Facts = NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined) throw new Error(`In-kind tuition assistance actual ${label} is missing`);
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`In-kind tuition assistance actual ${label} is invalid`);
  return result;
}
const unique = (ids: readonly string[]): boolean => ids.every(id => id.trim().length > 0) && new Set(ids).size === ids.length;

/** Read each recorded expense's allocation; never select or spread assistance. */
export function readInKindTuitionAssistanceSource(forms: readonly Form1099Q[], facts: Facts, sourceId: string, expenseId: string): Record<string, Decimal> {
  const original = forms.find(form => form.sourceId === sourceId);
  const group = forms.filter(form => form.beneficiaryId === original?.beneficiaryId);
  const sourceIds = new Set(group.map(form => form.sourceId));
  const expenses = (facts.expenses ?? []).filter(expense => expense.beneficiaryId === original?.beneficiaryId);
  const expenseIds = new Set(expenses.map(expense => expense.id));
  const benefits = (facts.inKindBenefits ?? []).filter(benefit => sourceIds.has(benefit.sourceId) || expenseIds.has(benefit.expenseId));
  const allocations = (facts.allocations ?? []).filter(allocation => sourceIds.has(allocation.sourceId) || expenseIds.has(allocation.expenseId));
  if (!original?.beneficiaryId || !original.recipientOwner || facts.sourceFactsConfirmed !== true || facts.allDistributionsReconciled !== true
    || !expenses.length || !unique(group.map(form => form.sourceId ?? '')) || !unique(expenses.map(expense => expense.id))
    || !unique(benefits.map(benefit => benefit.id)) || benefits.length !== expenses.length || allocations.length !== expenses.length
    || group.some(form => !form.accountId || form.accountType !== '529' || form.distributionMedium !== 'in_kind_prepaid_tuition'
      || form.taxYear !== facts.taxYear || form.sourceFactsConfirmed !== true || form.sourceFactsComplete === false
      || form.recipientNotBeneficiary !== false || form.isTrusteeToTrustee !== false || form.isQtpToRoth !== false
      || form.transfer?.kind !== 'none' || (form.distributionCode !== undefined && form.distributionCode !== '1')
      || form.recipientOwner !== original.recipientOwner || (original.recipientOwner === 'other' && (!original.recipientId || form.recipientId !== original.recipientId)))
    || [...benefits, ...allocations].some(row => !sourceIds.has(row.sourceId) || !expenseIds.has(row.expenseId))) {
    throw new Error('In-kind tuition assistance requires complete distinct original tuition, benefit and ordinary QTP source groups');
  }
  let selected: Record<string, Decimal> | undefined;
  for (const expense of expenses) {
    const linked = benefits.filter(benefit => benefit.expenseId === expense.id);
    const assigned = allocations.filter(allocation => allocation.expenseId === expense.id);
    const benefit = linked[0], allocation = assigned[0];
    if (linked.length !== 1 || assigned.length !== 1 || !benefit || !allocation || benefit.sourceId !== allocation.sourceId
      || expense.category !== 'postsecondary_tuition' || expense.qualificationConfirmed !== true || benefit.qualificationConfirmed !== true) {
      throw new Error('In-kind tuition assistance requires one distinct actual benefit and allocation per qualified tuition expense');
    }
    const provided = amount(benefit.amount, 'provided benefit'), tuition = amount(expense.amount, 'tuition');
    const refund = amount(expense.refundedAmount, 'refund'), assistance = amount(expense.taxFreeAssistance, 'assistance');
    const credit = amount(expense.educationCreditAmount, 'credit expense'), other = amount(expense.otherTaxBenefitAmount, 'other benefit');
    const allocated = amount(allocation.amount, 'allocation'), allocatedCredit = amount(allocation.creditAmount, 'allocated credit');
    if (!provided.eq(tuition) || !refund.isZero() || !other.isZero() || !allocatedCredit.eq(credit)
      || !allocated.plus(credit).plus(assistance).eq(provided)) {
      throw new Error('In-kind tuition assistance actual expense, benefit, assistance and credit allocation must reconcile independently');
    }
    if (benefit.sourceId === sourceId && expense.id === expenseId) selected = {
      'Actual expense': tuition, 'Provided benefit': provided, 'Refund': refund, 'Tax-free assistance': assistance,
      'Education credit expense': credit, 'Other tax benefit': other, 'Original allocation': allocated,
    };
  }
  for (const form of group) {
    const linked = benefits.filter(benefit => benefit.sourceId === form.sourceId);
    if (!linked.length || !sum(...linked.map(benefit => amount(benefit.amount, 'provided benefit'))).eq(amount(form.grossDistribution, 'original Box1'))) {
      throw new Error('In-kind tuition assistance benefit sources must conserve each original statement Box1');
    }
  }
  if (!selected) throw new Error('In-kind tuition assistance selected original source and expense are not linked');
  return selected;
}
