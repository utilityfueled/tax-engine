/** Source conservation; in-kind-coordination and tuition-account-group specs. */
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
  const qtps = group.filter(source => source.accountType === '529');
  const expenses = (facts.expenses ?? []).filter(source => source.beneficiaryId === qtp?.beneficiaryId);
  const benefits = (facts.inKindBenefits ?? []).filter(source => group.some(form => form.sourceId === source.sourceId));
  const allocations = (facts.allocations ?? []).filter(source => group.some(form => form.sourceId === source.sourceId));
  if (!qtp || esas.length === 0 || qtps.length === 0 || group.length !== qtps.length + esas.length
    || qtp.accountType !== '529' || qtps.some(source => source.distributionMedium !== 'in_kind_prepaid_tuition')
    || !qtp.beneficiaryId || !qtp.recipientOwner
    || new Set(group.map(source => source.accountId)).size !== group.length
    || group.some(source => !source.accountId || source.recipientOwner !== qtp.recipientOwner
      || (qtp.recipientOwner === 'other' && (!qtp.recipientId || source.recipientId !== qtp.recipientId)))
    || group.some(source => source.taxYear !== facts.taxYear || source.sourceFactsConfirmed !== true || source.sourceFactsComplete === false
      || source.recipientNotBeneficiary !== false || source.isTrusteeToTrustee !== false || source.isQtpToRoth !== false
      || source.transfer?.kind !== 'none' || (source.distributionCode !== undefined && source.distributionCode !== '1'))
    || esas.some(source => source.distributionMedium === 'in_kind_prepaid_tuition')
    || expenses.length === 0 || !expenses.some(source => source.id === expenseId)
    || new Set(expenses.map(source => source.id)).size !== expenses.length
    || expenses.some(source => !source.id || source.category !== 'postsecondary_tuition' || source.qualificationConfirmed !== true)
    || benefits.length === 0 || new Set(benefits.map(source => source.id)).size !== benefits.length
    || benefits.some(source => !source.id || !qtps.some(form => form.sourceId === source.sourceId)
      || !expenses.some(expense => expense.id === source.expenseId) || source.qualificationConfirmed !== true)
    || allocations.some(source => !expenses.some(expense => expense.id === source.expenseId))) {
    throw new Error('In-kind tuition ESA allocation requires actual linked tuition benefits, ordinary ESA accounts and a reconciled recipient source group');
  }
  const esaGross = esas.reduce((value, source) => value.plus(amount(source.grossDistribution, 'ESA gross')), d(0));
  const rows = expenses.map(expense => {
    const linkedBenefits = benefits.filter(source => source.expenseId === expense.id);
    const linkedQtps = qtps.filter(source => linkedBenefits.some(benefit => benefit.sourceId === source.sourceId));
    const linkedSources = [...linkedQtps, ...esas];
    const expenseAllocations = allocations.filter(source => source.expenseId === expense.id);
    if (linkedQtps.length === 0 || expenseAllocations.length !== linkedSources.length) {
      throw new Error('In-kind tuition ESA actual expense requires its original benefits and every explicit account allocation');
    }
    const accountRows = linkedSources.map(source => {
      const matches = expenseAllocations.filter(allocation => allocation.sourceId === source.sourceId);
      if (matches.length !== 1) throw new Error('In-kind tuition ESA actual expense requires one allocation for each linked account');
      const allocated = amount(matches[0]!.amount, 'account allocation');
      const credit = amount(matches[0]!.creditAmount, 'account credit allocation');
      const provided = linkedBenefits.filter(benefit => benefit.sourceId === source.sourceId)
        .reduce((value, benefit) => value.plus(amount(benefit.amount, 'provided benefit')), d(0));
      if (source.accountType === '529' && allocated.plus(credit).gt(provided)) {
        throw new Error('In-kind tuition ESA actual QTP allocation exceeds its own original provided benefit');
      }
      return { sourceId: source.sourceId, accountType: source.accountType, allocated, credit, provided };
    });
    const qtpRows = accountRows.filter(row => row.accountType === '529');
    const esaRows = accountRows.filter(row => row.accountType === 'coverdell_esa');
    const total = (selected: typeof accountRows, key: 'allocated' | 'credit' | 'provided') => selected.reduce((value, row) => value.plus(row[key]), d(0));
    const provided = total(qtpRows, 'provided');
    const expenseAmount = amount(expense.amount, 'tuition expense');
    const refund = amount(expense.refundedAmount, 'refund'), assistance = amount(expense.taxFreeAssistance, 'assistance');
    const credit = amount(expense.educationCreditAmount, 'credit expense'), other = amount(expense.otherTaxBenefitAmount, 'other benefit');
    const qtpAmount = total(qtpRows, 'allocated'), esaAmount = total(esaRows, 'allocated');
    const qtpCredit = total(qtpRows, 'credit'), esaCredit = total(esaRows, 'credit');
    const adjusted = expenseAmount.minus(assistance).minus(credit);
    if (!refund.isZero() || !other.isZero() || provided.gt(expenseAmount) || adjusted.lt(0)
      || !qtpAmount.plus(esaAmount).eq(adjusted) || !qtpCredit.plus(esaCredit).eq(credit)
      || qtpAmount.plus(qtpCredit).gt(provided)) {
      throw new Error('In-kind tuition ESA actual allocations must conserve each adjusted tuition expense and credit within its benefit');
    }
    return { id: expense.id, accountRows, inputs: { 'Actual tuition': expenseAmount, 'Provided benefit': provided, 'ESA gross distribution': esaGross,
      'Refund': refund, 'Tax-free assistance': assistance, 'Education credit expense': credit, 'Other tax benefit': other,
      'Adjusted tuition': adjusted, 'QTP expense allocation': qtpAmount, 'ESA expense allocation': esaAmount,
      'QTP credit allocation': qtpCredit, 'ESA credit allocation': esaCredit } };
  });
  type InputKey = keyof typeof rows[number]['inputs'];
  const total = (key: InputKey, selected = rows) => selected.reduce((value, row) => value.plus(row.inputs[key]), d(0));
  const qtpGross = qtps.reduce((value, source) => {
    const gross = amount(source.grossDistribution, 'QTP gross');
    const linked = rows.flatMap(row => row.accountRows.filter(account => account.sourceId === source.sourceId));
    const provided = linked.reduce((value, row) => value.plus(row.provided), d(0));
    const allocated = linked.reduce((value, row) => value.plus(row.allocated).plus(row.credit), d(0));
    if (linked.length === 0 || !provided.eq(gross) || allocated.gt(gross)) {
      throw new Error('In-kind tuition ESA actual allocations must conserve each original QTP distribution');
    }
    return value.plus(gross);
  }, d(0));
  for (const esa of esas) {
    const allocated = rows.flatMap(row => row.accountRows.filter(account => account.sourceId === esa.sourceId))
      .reduce((value, row) => value.plus(row.allocated).plus(row.credit), d(0));
    if (allocated.gt(amount(esa.grossDistribution, 'ESA gross'))) {
      throw new Error('In-kind tuition ESA actual allocations exceed an original ESA distribution');
    }
  }
  if (total('ESA expense allocation').plus(total('ESA credit allocation')).gt(esaGross)
    || qtpGross.plus(esaGross).lte(total('Adjusted tuition'))) {
    throw new Error('In-kind tuition ESA actual allocations must conserve original distribution totals across all expenses');
  }
  const selected = rows.find(row => row.id === expenseId);
  const selectedQtp = selected?.accountRows.find(row => row.sourceId === sourceId && row.accountType === '529');
  if (!selected || !selectedQtp) throw new Error('In-kind tuition ESA requested expense must match its original QTP benefit');
  return { ...selected.inputs, 'Provided benefit': selectedQtp.provided,
    'QTP expense allocation': selectedQtp.allocated, 'QTP credit allocation': selectedQtp.credit };
}
