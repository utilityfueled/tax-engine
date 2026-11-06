/** Original source conservation; distinct-in-kind and cash-assistance specs. */
import Decimal from 'decimal.js';
import { calculateRoomBoardPeriods } from './education-room-board-periods.js';
import { readOrdinaryEducationExpense } from './education-ordinary-expense-source.js';
import type { Form1099Q, QualifiedEducationExpenseSummary } from '@/models/inputs.js';

type Facts = NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;
const unique = (ids: readonly string[]): boolean => ids.every(id => id.trim().length > 0) && new Set(ids).size === ids.length;

/** Read each recorded expense's allocation; never select or spread assistance. */
export function readInKindTuitionAssistanceSource(forms: readonly Form1099Q[], facts: Facts, sourceId: string, expenseId: string): Record<string, Decimal> {
  const roomBoard = calculateRoomBoardPeriods(forms, facts, facts.taxYear);
  const original = forms.find(form => form.sourceId === sourceId);
  const group = forms.filter(form => form.beneficiaryId === original?.beneficiaryId);
  const sourceIds = new Set(group.map(form => form.sourceId));
  const expenses = (facts.expenses ?? []).filter(expense => expense.beneficiaryId === original?.beneficiaryId && !roomBoard.expenseIds.has(expense.id));
  const expenseIds = new Set(expenses.map(expense => expense.id));
  const annualBenefits = (facts.inKindBenefits ?? []).filter(benefit => sourceIds.has(benefit.sourceId) || expenseIds.has(benefit.expenseId));
  const annualAllocations = (facts.allocations ?? []).filter(allocation => sourceIds.has(allocation.sourceId) || expenseIds.has(allocation.expenseId));
  const benefits = annualBenefits.filter(row=>!roomBoard.expenseIds.has(row.expenseId));
  const allocations = annualAllocations.filter(row=>!roomBoard.expenseIds.has(row.expenseId));
  const prepaid = group.filter(form => form.distributionMedium === 'in_kind_prepaid_tuition');
  const cash = group.filter(form => form.distributionMedium === 'cash');
  // Source equality must retain all supplied decimal places. This local context
  // does not change the separate tax worksheets' precision or rounding.
  const originals = [...group.map(form => form.grossDistribution), ...benefits.map(benefit => benefit.amount),
    ...allocations.flatMap(row => [row.amount, row.creditAmount]),
    ...expenses.flatMap(row => [row.amount, row.refundedAmount, row.taxFreeAssistance, row.educationCreditAmount, row.otherTaxBenefitAmount])]
    .filter((value): value is string => value !== undefined).map(value => new Decimal(value)).filter(value => value.isFinite());
  const integerDigits = Math.max(1, ...originals.map(value => value.precision(true) - value.decimalPlaces()));
  const fractionalDigits = Math.max(0, ...originals.map(value => value.decimalPlaces()));
  const SourceDecimal = Decimal.clone({ precision: Math.max(40, integerDigits + fractionalDigits + String(originals.length).length + 2) });
  const amount = (value: string | undefined, label: string): Decimal => {
    if (value === undefined) throw new Error(`In-kind tuition assistance actual ${label} is missing`);
    const result = new SourceDecimal(value);
    if (!result.isFinite() || result.lt(0)) throw new Error(`In-kind tuition assistance actual ${label} is invalid`);
    return result;
  };
  const sum = (values: readonly Decimal[]): Decimal => values.reduce((total, value) => total.plus(value), new SourceDecimal(0));
  if (!original?.beneficiaryId || !original.recipientOwner || facts.sourceFactsConfirmed !== true || facts.allDistributionsReconciled !== true
    || original.distributionMedium !== 'in_kind_prepaid_tuition' || !prepaid.length || prepaid.length + cash.length !== group.length
    || !expenses.length || !unique(group.map(form => form.sourceId ?? '')) || !unique(expenses.map(expense => expense.id))
    || !unique(group.map(form => form.accountId ?? '')) || !unique(benefits.map(benefit => benefit.id))
    || group.some(form => !form.accountId || form.accountType !== '529'
      || form.taxYear !== facts.taxYear || form.sourceFactsConfirmed !== true || form.sourceFactsComplete === false
      || form.recipientNotBeneficiary !== false || form.isTrusteeToTrustee !== false || form.isQtpToRoth !== false
      || form.transfer?.kind !== 'none' || (form.distributionCode !== undefined && form.distributionCode !== '1')
      || form.recipientOwner !== original.recipientOwner || (original.recipientOwner === 'other' && (!original.recipientId || form.recipientId !== original.recipientId)))
    || benefits.some(row => !prepaid.some(form => form.sourceId === row.sourceId))
    || [...benefits, ...allocations].some(row => !sourceIds.has(row.sourceId) || !expenseIds.has(row.expenseId))) {
    throw new Error('In-kind tuition assistance requires complete distinct original tuition, benefit and ordinary QTP source groups');
  }
  let selected: Record<string, Decimal> | undefined;
  for (const expense of expenses) {
    const linked = benefits.filter(benefit => benefit.expenseId === expense.id);
    const assigned = allocations.filter(allocation => allocation.expenseId === expense.id);
    const benefit = linked[0];
    const allocation = assigned.find(row => row.sourceId === benefit?.sourceId);
    if (linked.length > 1 || assigned.length !== linked.length + cash.length || (benefit && !allocation)
      || new Set(assigned.map(row => row.sourceId)).size !== assigned.length
      || cash.some(form => !assigned.some(row => row.sourceId === form.sourceId))
      || (benefit && (expense.qualificationConfirmed !== true || benefit.qualificationConfirmed !== true))) {
      throw new Error('In-kind expense assistance requires each actual benefit and every original cash allocation per ordinary receipt');
    }
    const source = readOrdinaryEducationExpense(facts, expense, facts.taxYear);
    const { cost: tuition, refund, assistance, credit, other, adjusted } = source;
    const provided = benefit ? amount(benefit.amount, 'provided benefit') : new SourceDecimal(0);
    const allocated = allocation ? amount(allocation.amount, 'allocation') : new SourceDecimal(0);
    const allocatedCredit = allocation ? amount(allocation.creditAmount, 'allocated credit') : new SourceDecimal(0);
    const cashRows = assigned.filter(row => cash.some(form => form.sourceId === row.sourceId));
    const cashAmount = sum(cashRows.map(row => amount(row.amount, 'cash allocation')));
    const cashCredit = sum(cashRows.map(row => amount(row.creditAmount, 'cash credit allocation')));
    const prepaidCapacity = provided.minus(allocatedCredit);
    const qualifiedPrepaid = SourceDecimal.min(prepaidCapacity, adjusted);
    if (provided.gt(tuition) || (!cash.length && !provided.eq(tuition)) || !other.isZero()
      || adjusted.lt(0) || prepaidCapacity.lt(0) || cashCredit.gt(tuition.minus(provided))
      || !allocatedCredit.plus(cashCredit).eq(credit) || !allocated.eq(qualifiedPrepaid)
      || !allocated.plus(cashAmount).eq(adjusted)) {
      throw new Error('In-kind tuition assistance actual expense, benefit, assistance and credit allocation must reconcile independently');
    }
    if (benefit?.sourceId === sourceId && expense.id === expenseId) selected = {
      'Actual expense': tuition, 'Provided benefit': provided, 'Refund': refund, 'Tax-free assistance': assistance,
      'Education credit expense': credit, 'Other tax benefit': other, 'Original allocation': allocated,
      ...(cash.length ? { 'Adjusted tuition': adjusted, 'Qualified prepaid tuition': qualifiedPrepaid,
        'Cash QTP expense allocation': cashAmount, 'Cash QTP credit allocation': cashCredit } : {}),
    };
  }
  for (const form of group) {
    const linked = annualBenefits.filter(benefit => benefit.sourceId === form.sourceId);
    const assigned = annualAllocations.filter(row => row.sourceId === form.sourceId);
    const gross = amount(form.grossDistribution, 'original Box1');
    if (!assigned.length || (form.distributionMedium === 'in_kind_prepaid_tuition'
      && (!linked.length || !sum(linked.map(benefit => amount(benefit.amount, 'provided benefit'))).eq(gross)))
      || sum(assigned.map(row => amount(row.amount, 'allocation').plus(amount(row.creditAmount, 'allocated credit')))).gt(gross)) {
      throw new Error('In-kind tuition assistance benefit sources must conserve each original statement Box1');
    }
  }
  if (!selected) throw new Error('In-kind tuition assistance selected original source and expense are not linked');
  return selected;
}
