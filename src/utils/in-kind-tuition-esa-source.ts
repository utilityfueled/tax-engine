/** Source conservation only; spec/federal/form-1099-q-in-kind-coordination.yaml. */
import Decimal from 'decimal.js';
import type { Form1099Q, QualifiedEducationExpenseSummary } from '@/models/inputs.js';
import { d } from './decimal.js';

type Facts = NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;
const amount = (value: string | undefined, label: string): Decimal => {
  if (value === undefined) throw new Error(`In-kind tuition ESA actual ${label} is missing`);
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`In-kind tuition ESA actual ${label} is invalid`);
  return result;
};

/** Validate a supplied allocation, without selecting it or calculating tax. */
export function readInKindTuitionEsaSource(forms: readonly Form1099Q[], facts: Facts, sourceId: string, expenseId: string): Record<string, Decimal> {
  const qtp = forms.find(source => source.sourceId === sourceId);
  const group = forms.filter(source => source.beneficiaryId === qtp?.beneficiaryId);
  const esa = group.find(source => source.accountType === 'coverdell_esa');
  const expenses = (facts.expenses ?? []).filter(source => source.beneficiaryId === qtp?.beneficiaryId);
  const expense = expenses[0];
  const benefits = (facts.inKindBenefits ?? []).filter(source => group.some(form => form.sourceId === source.sourceId));
  const benefit = benefits[0];
  const allocations = (facts.allocations ?? []).filter(source => group.some(form => form.sourceId === source.sourceId));
  const qtpAllocation = allocations.find(source => source.sourceId === sourceId);
  const esaAllocation = allocations.find(source => source.sourceId === esa?.sourceId);
  if (!qtp || !esa || group.length !== 2 || qtp.accountType !== '529' || qtp.distributionMedium !== 'in_kind_prepaid_tuition'
    || qtp.accountId === esa.accountId || !qtp.beneficiaryId || !qtp.recipientOwner || qtp.recipientOwner !== esa.recipientOwner
    || (qtp.recipientOwner === 'other' && (!qtp.recipientId || qtp.recipientId !== esa.recipientId))
    || group.some(source => source.taxYear !== facts.taxYear || source.sourceFactsConfirmed !== true || source.sourceFactsComplete === false
      || source.recipientNotBeneficiary !== false || source.isTrusteeToTrustee !== false || source.isQtpToRoth !== false
      || source.transfer?.kind !== 'none' || (source.distributionCode !== undefined && source.distributionCode !== '1'))
    || esa.distributionMedium === 'in_kind_prepaid_tuition' || expenses.length !== 1 || !expense || expense.id !== expenseId
    || expense.category !== 'postsecondary_tuition' || expense.qualificationConfirmed !== true
    || benefits.length !== 1 || !benefit || benefit.sourceId !== sourceId || benefit.expenseId !== expenseId || benefit.qualificationConfirmed !== true
    || allocations.length !== 2 || !qtpAllocation || !esaAllocation || allocations.some(source => source.expenseId !== expenseId)) {
    throw new Error('In-kind tuition ESA allocation requires one actual benefit, ordinary ESA, expense and reconciled recipient source group');
  }
  const provided = amount(benefit.amount, 'provided benefit');
  const expenseAmount = amount(expense.amount, 'tuition expense');
  const refund = amount(expense.refundedAmount, 'refund'), assistance = amount(expense.taxFreeAssistance, 'assistance');
  const credit = amount(expense.educationCreditAmount, 'credit expense'), other = amount(expense.otherTaxBenefitAmount, 'other benefit');
  const qtpAmount = amount(qtpAllocation.amount, 'QTP allocation'), esaAmount = amount(esaAllocation.amount, 'ESA allocation');
  const qtpCredit = amount(qtpAllocation.creditAmount, 'QTP credit allocation'), esaCredit = amount(esaAllocation.creditAmount, 'ESA credit allocation');
  const qtpGross = amount(qtp.grossDistribution, 'QTP gross'), esaGross = amount(esa.grossDistribution, 'ESA gross');
  const adjusted = expenseAmount.minus(assistance).minus(credit);
  if (!refund.isZero() || !other.isZero() || !provided.eq(qtpGross) || provided.gt(expenseAmount) || adjusted.lt(0)
    || !qtpAmount.plus(esaAmount).eq(adjusted) || !qtpCredit.plus(esaCredit).eq(credit)
    || qtpAmount.plus(qtpCredit).gt(qtpGross) || esaAmount.plus(esaCredit).gt(esaGross)
    || qtpGross.plus(esaGross).lte(adjusted)) {
    throw new Error('In-kind tuition ESA actual allocations must conserve adjusted tuition and credit within each distribution');
  }
  return { 'Actual tuition': expenseAmount, 'Provided benefit': provided, 'ESA gross distribution': esaGross,
    'Refund': refund, 'Tax-free assistance': assistance, 'Education credit expense': credit, 'Other tax benefit': other,
    'Adjusted tuition': adjusted, 'QTP expense allocation': qtpAmount, 'ESA expense allocation': esaAmount,
    'QTP credit allocation': qtpCredit, 'ESA credit allocation': esaCredit };
}
