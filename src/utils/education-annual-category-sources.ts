/** Actual annual category sources; spec/federal/education-annual-category-limits.yaml. */
import Decimal from 'decimal.js';
import type { Form1099Q, QualifiedEducationExpenseSummary } from '@/models/inputs.js';
import { isExpandedEducationDistributionAllowed } from './education-distribution-date.js';

type Facts = NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;
export interface AnnualEducationCategorySource {
  available: Decimal;
  qualified: Decimal;
  k12: boolean;
  borrowerId?: string;
  borrowerRemaining?: Decimal;
}

/** Validate receipts, not a user-entered exclusion or a chosen cash account split. */
export function readAnnualEducationCategorySources(forms: readonly Form1099Q[], facts: Facts, year: number): Map<string, AnnualEducationCategorySource> {
  const result = new Map<string, AnnualEducationCategorySource>();
  const actualDate = (value: string | undefined, label: string): string => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Annual category actual ${label} date is missing`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) !== year)
      throw new Error(`Annual category actual ${label} date must match the source year`);
    return value;
  };
  const answer = (value: boolean | undefined, label: string): boolean => {
    if (typeof value !== 'boolean') throw new Error(`Annual category actual ${label} answer is missing`);
    return value;
  };
  for (const expense of facts.expenses ?? []) {
    const group = forms.filter(form => form.beneficiaryId === expense.beneficiaryId);
    const cash = group.filter(form => form.accountType === '529' && form.distributionMedium === 'cash');
    if (cash.length < 2 || group.some(form => form.accountType === 'coverdell_esa') || expense.category.startsWith('postsecondary_')) continue;
    if (!(expense.category.startsWith('k12_') || expense.category.startsWith('credential_') || ['apprenticeship', 'student_loan'].includes(expense.category)))
      throw new Error('Annual cash QTP special expense category requires its separate source calculation');
    const refundRows = (facts.expenseRefunds ?? []).filter(row => row.expenseId === expense.id);
    const borrowerRows = (facts.loanBorrowers ?? []).filter(row => row.id === expense.borrowerId);
    const raw = [expense.amount, expense.refundedAmount, expense.taxFreeAssistance, expense.educationCreditAmount,
      expense.otherTaxBenefitAmount, expense.studentLoanInterestAmount, expense.studentLoanInterestDeducted, ...refundRows.map(row => row.amount),
      ...borrowerRows.flatMap(row => [row.priorQualifiedDistributions, row.otherCurrentQualifiedDistributions])]
      .filter((value): value is string => value !== undefined).map(value => new Decimal(value)).filter(value => value.isFinite());
    const integers = Math.max(1, ...raw.map(value => value.precision(true) - value.decimalPlaces()));
    const fractions = Math.max(0, ...raw.map(value => value.decimalPlaces()));
    const D = Decimal.clone({ precision: Math.max(50, integers + fractions + String(raw.length).length + 4) });
    const money = (value: string | undefined, label: string): Decimal => {
      if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`Annual category actual ${label} amount is missing or invalid`);
      const amount = new D(value);
      if (!amount.isFinite() || amount.lt(0)) throw new Error(`Annual category actual ${label} amount is invalid`);
      return amount;
    };
    const paid = actualDate(expense.paidDate, 'expense paid');
    const cost = money(expense.amount, 'expense'), refund = money(expense.refundedAmount, 'refund');
    const aid = money(expense.taxFreeAssistance, 'assistance'), credit = money(expense.educationCreditAmount, 'credit');
    const other = money(expense.otherTaxBenefitAmount, 'other benefit');
    const available = cost.minus(refund).minus(aid).minus(credit).minus(other);
    if (available.lt(0)) throw new Error('Annual category actual reductions exceed the original receipt');
    if (credit.gt(0)) throw new Error('Annual category credit allocation requires its actual postsecondary credit qualification and separate category coordination');
    if (refund.gt(0) || refundRows.length || expense.refundHistoryCompleteConfirmed !== undefined) {
      if (expense.refundHistoryCompleteConfirmed !== true || !Array.isArray(facts.expenseRefunds)) throw new Error('Annual category actual complete refund history is required');
      let total = new D(0);
      const ids = new Set<string>();
      for (const row of refundRows) {
        const id = row.id.trim(), received = actualDate(row.receivedDate, 'refund received');
        if (!id || ids.has(id) || received < paid || row.sourceFactsConfirmed !== true || !row.sourceReference?.trim()
          || row.receivedByBeneficiary !== true || row.disposition !== 'cash_retained') {
          throw new Error('Annual category refund requires unique actual confirmed current-year cash retained by the beneficiary');
        }
        ids.add(id); total = total.plus(money(row.amount, 'refund receipt'));
      }
      if (!total.eq(refund)) throw new Error('Annual category actual refund receipts must exactly reconcile to the original receipt');
    }
    let eligible = answer(expense.qualificationConfirmed, 'expense qualification');
    if (eligible && expense.category === 'k12_tutoring') {
      const unrelated = answer(expense.tutorUnrelated, 'tutor relationship');
      const outside = answer(expense.tutoringOutsideHome, 'tutoring location');
      const qualified = answer(expense.tutorQualified, 'tutor statutory credentials');
      eligible = unrelated && outside && qualified;
    }
    if (eligible && expense.category === 'k12_disability_therapy') {
      const disability = answer(expense.studentHasDisability, 'student disability');
      const provider = answer(expense.providerLicensedOrAccredited, 'therapy provider qualification');
      eligible = disability && provider;
    }
    if (eligible && expense.category.startsWith('credential_')) {
      const recognized = answer(expense.credentialRecognized, 'recognized credential');
      const required = answer(expense.requiredForCredential, 'required credential expense');
      eligible = recognized && required;
    }
    if (eligible && expense.category === 'apprenticeship') {
      const registered = answer(expense.apprenticeshipRegistered, 'Labor Department registered and certified apprenticeship');
      const required = answer(expense.requiredForApprenticeship, 'required apprenticeship costs');
      eligible = registered && required;
    }
    let borrowerRemaining: Decimal | undefined;
    if (expense.category === 'student_loan') {
      const related = answer(expense.beneficiaryOrSibling, 'loan borrower relationship');
      const interest = money(expense.studentLoanInterestAmount, 'student-loan interest');
      const deducted = money(expense.studentLoanInterestDeducted, 'student-loan interest deducted');
      if (interest.gt(cost) || deducted.gt(interest)) throw new Error('Annual category actual loan interest does not reconcile to its payment');
      const borrowers = borrowerRows;
      if (!expense.borrowerId || borrowers.length !== 1 || !borrowers[0]?.owner)
        throw new Error('Annual category actual student-loan borrower history is required');
      const remaining = D.max(0, new D(10000).minus(money(borrowers[0].priorQualifiedDistributions, 'prior borrower qualified distributions'))
        .minus(money(borrowers[0].otherCurrentQualifiedDistributions, 'other current borrower qualified distributions')));
      borrowerRemaining = remaining;
      if (eligible && related && available.gt(0) && remaining.gt(0) && interest.gt(0))
        throw new Error('Annual cash QTP positive qualified loan interest requires its separate annual earnings attribution method');
      eligible &&= related;
    }
    if (eligible) {
      const dated = cash.map(form => {
        const allowed = isExpandedEducationDistributionAllowed(form, expense.category, year);
        const expanded = year === 2025 && ((expense.category.startsWith('k12_') && expense.category !== 'k12_tuition') || expense.category.startsWith('credential_'));
        if (expanded && form.distributionDate !== undefined && typeof form.allDistributionsAfterJuly42025 === 'boolean'
          && form.allDistributionsAfterJuly42025 !== allowed) throw new Error('Annual cash actual distribution date contradicts the supplied after-July4 answer');
        return allowed;
      });
      if (dated.some(value => value !== dated[0])) throw new Error('Annual cash mixed effective-date timing requires a separate expense attribution method');
      eligible = dated[0] === true;
    }
    result.set(expense.id, { available, qualified: eligible ? available : new D(0), k12: expense.category.startsWith('k12_'),
      ...(expense.category === 'student_loan' ? { borrowerId: expense.borrowerId, borrowerRemaining } : {}) });
  }
  return result;
}
