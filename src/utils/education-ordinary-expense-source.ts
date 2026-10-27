/** Actual ordinary receipt qualification; education-ordinary-expense-composition spec. */
import Decimal from 'decimal.js';
import type { EducationExpenses, QualifiedEducationExpenseSummary } from '@/models/inputs.js';

type Facts = NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;
type Expense = NonNullable<Facts['expenses']>[number];

export function isOrdinaryEducationExpense(expense: Pick<Expense, 'category'>): boolean {
  return ['postsecondary_tuition', 'postsecondary_books', 'postsecondary_computer', 'postsecondary_special_needs'].includes(expense.category);
}

function actualDate(value: string | undefined, label: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Ordinary education actual ${label} date is missing`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Ordinary education actual ${label} date is invalid`);
  return value;
}

/** Read source amounts exactly; neither a benefit membership nor a tax allocation is inferred. */
export function readOrdinaryEducationExpense(facts: Facts, expense: Expense, year: number | undefined) {
  if (!isOrdinaryEducationExpense(expense) || !Number.isInteger(year)) throw new Error('Ordinary education receipt category and actual tax year are required');
  const refunds = (facts.expenseRefunds ?? []).filter(row => row.expenseId === expense.id);
  const values = [expense.amount, expense.refundedAmount, expense.taxFreeAssistance, expense.educationCreditAmount,
    expense.otherTaxBenefitAmount, ...refunds.map(row => row.amount),
    ...(facts.allocations ?? []).filter(row => row.expenseId === expense.id).flatMap(row => [row.amount, row.creditAmount])]
    .filter((value): value is string => value !== undefined).map(value => new Decimal(value)).filter(value => value.isFinite());
  const integers = Math.max(1, ...values.map(value => value.precision(true) - value.decimalPlaces()));
  const fractions = Math.max(0, ...values.map(value => value.decimalPlaces()));
  const SourceDecimal = Decimal.clone({ precision: Math.max(40, integers + fractions + String(values.length).length + 2) });
  const amount = (value: string | undefined, label: string): Decimal => {
    if (value === undefined) throw new Error(`Ordinary education actual ${label} amount is missing`);
    const result = new SourceDecimal(value);
    if (!result.isFinite() || result.lt(0)) throw new Error(`Ordinary education actual ${label} amount is invalid`);
    return result;
  };
  const paid = actualDate(expense.paidDate, 'expense paid');
  if (Number(paid.slice(0, 4)) !== year || typeof expense.qualificationConfirmed !== 'boolean') throw new Error('Ordinary education actual receipt year and qualification answer are required');
  const cost = amount(expense.amount, 'expense'), refund = amount(expense.refundedAmount, 'refund');
  const assistance = amount(expense.taxFreeAssistance, 'assistance'), credit = amount(expense.educationCreditAmount, 'credit');
  const other = amount(expense.otherTaxBenefitAmount, 'other tax benefit');
  const available = cost.minus(refund).minus(assistance).minus(credit).minus(other);
  if (available.lt(0)) throw new Error('Ordinary education actual receipt reductions exceed its original cost');
  if (refund.gt(0) || refunds.length > 0 || expense.refundHistoryCompleteConfirmed !== undefined) {
    if (expense.refundHistoryCompleteConfirmed !== true || facts.expenseRefunds === undefined) throw new Error('Ordinary education actual complete refund history is required');
    let refunded = new SourceDecimal(0);
    for (const row of refunds) {
      const received = actualDate(row.receivedDate, 'refund received');
      if (Number(received.slice(0, 4)) !== year || received < paid || row.sourceFactsConfirmed !== true || !row.sourceReference?.trim()
        || row.receivedByBeneficiary !== true || row.disposition !== 'cash_retained') {
        throw new Error('Ordinary education refund requires actual confirmed current-year cash retained by the beneficiary; other chronology or disposition needs its separate source method');
      }
      refunded = refunded.plus(amount(row.amount, 'refund receipt'));
    }
    if (!refunded.eq(refund)) throw new Error('Ordinary education refund receipts must exactly reconcile to their original expense refund');
  }
  if (credit.gt(0) && expense.category !== 'postsecondary_tuition') {
    if (expense.qualificationConfirmed !== true || expense.creditExpenseQualificationConfirmed !== true || !expense.creditExpenseSourceReference?.trim()
      || !['aotc_required_course_materials', 'llc_required_institution_charge'].includes(expense.creditExpenseTreatment ?? '')
      || (expense.creditExpenseTreatment === 'aotc_required_course_materials' && expense.category === 'postsecondary_special_needs')) {
      throw new Error('Ordinary education non-tuition credit requires its actual qualified course-material or required institution-charge source');
    }
  }
  return { cost, refund, assistance, credit, other, available, qualified: expense.qualificationConfirmed,
    adjusted: expense.qualificationConfirmed ? available : new SourceDecimal(0) };
}

/** Validate original refund identity and actual credit-program binding before canonical calculation. */
export function validateOrdinaryEducationSources(facts: Facts, year: number, educationExpenses?: EducationExpenses, validatedCategoryExpenseIds: ReadonlySet<string> = new Set()): void {
  const ids = new Set<string>();
  for (const refund of facts.expenseRefunds ?? []) {
    const id = refund.id?.trim();
    const expense = (facts.expenses ?? []).filter(row => row.id === refund.expenseId);
    if (!id || ids.has(id) || expense.length !== 1 || !expense[0]
      || (!isOrdinaryEducationExpense(expense[0]) && !validatedCategoryExpenseIds.has(expense[0].id))) throw new Error('Ordinary education refund requires a unique original refund and receipt identity');
    ids.add(id);
  }
  for (const expense of facts.expenses ?? []) {
    if (!isOrdinaryEducationExpense(expense)) continue;
    const source = readOrdinaryEducationExpense(facts, expense, year);
    if (source.credit.isZero() || expense.category === 'postsecondary_tuition') continue;
    const beneficiary = (facts.beneficiaries ?? []).filter(row => row.id === expense.beneficiaryId);
    const identity = beneficiary.length === 1 ? beneficiary[0]?.studentTaxId?.replaceAll('-', '') : undefined;
    const aoc = educationExpenses?.aocStudents.filter(row => identity && row.studentTaxId?.replaceAll('-', '') === identity) ?? [];
    const llc = educationExpenses?.llcStudents?.filter(row => identity && row.studentTaxId?.replaceAll('-', '') === identity) ?? [];
    if (aoc.length + llc.length !== 1 || (expense.creditExpenseTreatment === 'aotc_required_course_materials' ? aoc.length !== 1 : llc.length !== 1)) {
      throw new Error('Ordinary education non-tuition credit source must match its actual AOTC or LLC student');
    }
  }
}
