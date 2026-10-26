/** Source conservation; in-kind-coordination, multiple-expense-esa and distinct-qtp-esa specs. */
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
  const esas = group.filter(source => source.accountType === 'coverdell_esa');
  const esa = esas[0];
  const qtps = group.filter(source => source.accountType === '529');
  const expenses = (facts.expenses ?? []).filter(source => source.beneficiaryId === qtp?.beneficiaryId);
  const benefits = (facts.inKindBenefits ?? []).filter(source => group.some(form => form.sourceId === source.sourceId));
  const allocations = (facts.allocations ?? []).filter(source => group.some(form => form.sourceId === source.sourceId));
  if (!qtp || !esa || esas.length !== 1 || qtps.length === 0 || group.length !== qtps.length + 1
    || qtp.accountType !== '529' || qtps.some(source => source.distributionMedium !== 'in_kind_prepaid_tuition')
    || !qtp.beneficiaryId || !qtp.recipientOwner
    || new Set(group.map(source => source.accountId)).size !== group.length
    || group.some(source => !source.accountId || source.recipientOwner !== qtp.recipientOwner
      || (qtp.recipientOwner === 'other' && (!qtp.recipientId || source.recipientId !== qtp.recipientId)))
    || group.some(source => source.taxYear !== facts.taxYear || source.sourceFactsConfirmed !== true || source.sourceFactsComplete === false
      || source.recipientNotBeneficiary !== false || source.isTrusteeToTrustee !== false || source.isQtpToRoth !== false
      || source.transfer?.kind !== 'none' || (source.distributionCode !== undefined && source.distributionCode !== '1'))
    || esa.distributionMedium === 'in_kind_prepaid_tuition' || expenses.length === 0 || !expenses.some(source => source.id === expenseId)
    || new Set(expenses.map(source => source.id)).size !== expenses.length
    || expenses.some(source => !source.id || source.category !== 'postsecondary_tuition' || source.qualificationConfirmed !== true)
    || benefits.length !== expenses.length || new Set(benefits.map(source => source.id)).size !== benefits.length
    || benefits.some(source => !source.id || !qtps.some(form => form.sourceId === source.sourceId) || source.qualificationConfirmed !== true)
    || allocations.length !== expenses.length * 2) {
    throw new Error('In-kind tuition ESA allocation requires actual linked tuition benefits, one ordinary ESA and a reconciled recipient source group');
  }
  const esaGross = amount(esa.grossDistribution, 'ESA gross');
  const rows = expenses.map(expense => {
    const linkedBenefits = benefits.filter(source => source.expenseId === expense.id);
    const benefit = linkedBenefits[0];
    const qtpAllocations = allocations.filter(source => source.expenseId === expense.id && source.sourceId === benefit?.sourceId);
    const esaAllocations = allocations.filter(source => source.expenseId === expense.id && source.sourceId === esa.sourceId);
    if (!benefit || linkedBenefits.length !== 1 || qtpAllocations.length !== 1 || esaAllocations.length !== 1) {
      throw new Error('In-kind tuition ESA actual expense requires one benefit and both explicit allocations');
    }
    const provided = amount(benefit.amount, 'provided benefit');
    const expenseAmount = amount(expense.amount, 'tuition expense');
    const refund = amount(expense.refundedAmount, 'refund'), assistance = amount(expense.taxFreeAssistance, 'assistance');
    const credit = amount(expense.educationCreditAmount, 'credit expense'), other = amount(expense.otherTaxBenefitAmount, 'other benefit');
    const qtpAmount = amount(qtpAllocations[0]!.amount, 'QTP allocation'), esaAmount = amount(esaAllocations[0]!.amount, 'ESA allocation');
    const qtpCredit = amount(qtpAllocations[0]!.creditAmount, 'QTP credit allocation'), esaCredit = amount(esaAllocations[0]!.creditAmount, 'ESA credit allocation');
    const adjusted = expenseAmount.minus(assistance).minus(credit);
    if (!refund.isZero() || !other.isZero() || provided.gt(expenseAmount) || adjusted.lt(0)
      || !qtpAmount.plus(esaAmount).eq(adjusted) || !qtpCredit.plus(esaCredit).eq(credit)
      || qtpAmount.plus(qtpCredit).gt(provided)) {
      throw new Error('In-kind tuition ESA actual allocations must conserve each adjusted tuition expense and credit within its benefit');
    }
    return { id: expense.id, sourceId: benefit.sourceId, inputs: { 'Actual tuition': expenseAmount, 'Provided benefit': provided, 'ESA gross distribution': esaGross,
      'Refund': refund, 'Tax-free assistance': assistance, 'Education credit expense': credit, 'Other tax benefit': other,
      'Adjusted tuition': adjusted, 'QTP expense allocation': qtpAmount, 'ESA expense allocation': esaAmount,
      'QTP credit allocation': qtpCredit, 'ESA credit allocation': esaCredit } };
  });
  type InputKey = keyof typeof rows[number]['inputs'];
  const total = (key: InputKey, selected = rows) => selected.reduce((value, row) => value.plus(row.inputs[key]), d(0));
  const qtpGross = qtps.reduce((value, source) => {
    const gross = amount(source.grossDistribution, 'QTP gross');
    const linked = rows.filter(row => row.sourceId === source.sourceId);
    if (linked.length === 0 || !total('Provided benefit', linked).eq(gross)
      || total('QTP expense allocation', linked).plus(total('QTP credit allocation', linked)).gt(gross)) {
      throw new Error('In-kind tuition ESA actual allocations must conserve each original QTP distribution');
    }
    return value.plus(gross);
  }, d(0));
  if (total('ESA expense allocation').plus(total('ESA credit allocation')).gt(esaGross)
    || qtpGross.plus(esaGross).lte(total('Adjusted tuition'))) {
    throw new Error('In-kind tuition ESA actual allocations must conserve original distribution totals across all expenses');
  }
  const selected = rows.find(row => row.id === expenseId && row.sourceId === sourceId);
  if (!selected) throw new Error('In-kind tuition ESA requested expense must match its original QTP benefit');
  return selected.inputs;
}
