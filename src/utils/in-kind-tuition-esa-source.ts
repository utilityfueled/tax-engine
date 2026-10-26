/** Source conservation; in-kind-coordination, tuition-account-group and mixed-tuition specs. */
import Decimal from 'decimal.js';
import { calculateRoomBoardPeriods } from './education-room-board-periods.js';
import { isOrdinaryEducationExpense, readOrdinaryEducationExpense } from './education-ordinary-expense-source.js';
import type { Form1099Q, QualifiedEducationExpenseSummary } from '@/models/inputs.js';

type Facts = NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;

/** Validate a supplied allocation, without selecting it or calculating tax. */
export function readInKindTuitionEsaSource(forms: readonly Form1099Q[], facts: Facts, sourceId: string, expenseId: string): Record<string, Decimal> {
  const roomBoard = calculateRoomBoardPeriods(forms, facts, facts.taxYear);
  const qtp = forms.find(source => source.sourceId === sourceId);
  const group = forms.filter(source => source.beneficiaryId === qtp?.beneficiaryId);
  const esas = group.filter(source => source.accountType === 'coverdell_esa');
  const qtps = group.filter(source => source.accountType === '529');
  const prepaidQtps = qtps.filter(source => source.distributionMedium === 'in_kind_prepaid_tuition');
  const cashQtps = qtps.filter(source => source.distributionMedium === 'cash');
  const expenses = (facts.expenses ?? []).filter(source => source.beneficiaryId === qtp?.beneficiaryId && !roomBoard.expenseIds.has(source.id));
  const annualBenefits = (facts.inKindBenefits ?? []).filter(source => group.some(form => form.sourceId === source.sourceId));
  const annualAllocations = (facts.allocations ?? []).filter(source => group.some(form => form.sourceId === source.sourceId));
  const benefits = annualBenefits.filter(source => !roomBoard.expenseIds.has(source.expenseId));
  const allocations = annualAllocations.filter(source => !roomBoard.expenseIds.has(source.expenseId));
  // Source conservation precedes the separate whole-dollar worksheets. Keep
  // each original decimal place without changing global calculation precision.
  const originals = [...group.map(source => source.grossDistribution), ...benefits.map(source => source.amount),
    ...allocations.flatMap(source => [source.amount, source.creditAmount]),
    ...expenses.flatMap(source => [source.amount, source.refundedAmount, source.taxFreeAssistance, source.educationCreditAmount, source.otherTaxBenefitAmount])]
    .filter((value): value is string => value !== undefined).map(value => new Decimal(value)).filter(value => value.isFinite());
  const integerDigits = Math.max(1, ...originals.map(value => value.precision(true) - value.decimalPlaces()));
  const fractionalDigits = Math.max(0, ...originals.map(value => value.decimalPlaces()));
  const SourceDecimal = Decimal.clone({ precision: Math.max(40, integerDigits + fractionalDigits + String(originals.length).length + 2) });
  const amount = (value: string | undefined, label: string): Decimal => {
    if (value === undefined) throw new Error(`In-kind tuition ESA actual ${label} is missing`);
    const result = new SourceDecimal(value);
    if (!result.isFinite() || result.lt(0)) throw new Error(`In-kind tuition ESA actual ${label} is invalid`);
    return result;
  };
  if (!qtp || esas.length === 0 || qtps.length === 0 || group.length !== qtps.length + esas.length
    || qtp.accountType !== '529' || qtp.distributionMedium !== 'in_kind_prepaid_tuition'
    || qtps.length !== prepaidQtps.length + cashQtps.length
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
    || expenses.some(source => !source.id || !isOrdinaryEducationExpense(source) || typeof source.qualificationConfirmed !== 'boolean')
    || benefits.length === 0 || new Set(benefits.map(source => source.id)).size !== benefits.length
    || benefits.some(source => !source.id || !prepaidQtps.some(form => form.sourceId === source.sourceId)
      || !expenses.some(expense => expense.id === source.expenseId) || source.qualificationConfirmed !== true)
    || allocations.some(source => !expenses.some(expense => expense.id === source.expenseId))) {
    throw new Error('In-kind tuition ESA allocation requires actual linked tuition benefits, ordinary ESA accounts and a reconciled recipient source group');
  }
  const esaGross = esas.reduce((value, source) => value.plus(amount(source.grossDistribution, 'ESA gross')), new SourceDecimal(0));
  const rows = expenses.map(expense => {
    const linkedBenefits = benefits.filter(source => source.expenseId === expense.id);
    const linkedQtps = prepaidQtps.filter(source => linkedBenefits.some(benefit => benefit.sourceId === source.sourceId));
    const linkedSources = [...linkedQtps, ...cashQtps, ...esas];
    const expenseAllocations = allocations.filter(source => source.expenseId === expense.id);
    if (expenseAllocations.length !== linkedSources.length) {
      throw new Error('In-kind tuition ESA actual expense requires its original benefits and every explicit account allocation');
    }
    const accountRows = linkedSources.map(source => {
      const matches = expenseAllocations.filter(allocation => allocation.sourceId === source.sourceId);
      if (matches.length !== 1) throw new Error('In-kind tuition ESA actual expense requires one allocation for each linked account');
      const allocated = amount(matches[0]!.amount, 'account allocation');
      const credit = amount(matches[0]!.creditAmount, 'account credit allocation');
      const provided = linkedBenefits.filter(benefit => benefit.sourceId === source.sourceId)
        .reduce((value, benefit) => value.plus(amount(benefit.amount, 'provided benefit')), new SourceDecimal(0));
      if (source.distributionMedium === 'in_kind_prepaid_tuition' && allocated.plus(credit).gt(provided)) {
        throw new Error('In-kind tuition ESA actual QTP allocation exceeds its own original provided benefit');
      }
      return { sourceId: source.sourceId, accountType: source.accountType, medium: source.distributionMedium, allocated, credit, provided };
    });
    const qtpRows = accountRows.filter(row => row.accountType === '529');
    const prepaidRows = qtpRows.filter(row => row.medium === 'in_kind_prepaid_tuition');
    const cashRows = qtpRows.filter(row => row.medium === 'cash');
    const esaRows = accountRows.filter(row => row.accountType === 'coverdell_esa');
    const total = (selected: typeof accountRows, key: 'allocated' | 'credit' | 'provided') => selected.reduce((value, row) => value.plus(row[key]), new SourceDecimal(0));
    const provided = total(qtpRows, 'provided');
    const { cost: expenseAmount, refund, assistance, credit, other, adjusted } = readOrdinaryEducationExpense(facts, expense, facts.taxYear);
    const qtpAmount = total(qtpRows, 'allocated'), esaAmount = total(esaRows, 'allocated');
    const qtpCredit = total(qtpRows, 'credit'), esaCredit = total(esaRows, 'credit');
    if (!other.isZero() || provided.gt(expenseAmount) || adjusted.lt(0)
      || !qtpAmount.plus(esaAmount).eq(adjusted) || !qtpCredit.plus(esaCredit).eq(credit)
      || total(prepaidRows, 'allocated').plus(total(prepaidRows, 'credit')).gt(provided)) {
      throw new Error('In-kind tuition ESA actual allocations must conserve each adjusted tuition expense and credit within its benefit');
    }
    const cashInputs: Record<string, Decimal> = cashRows.length
      ? { 'Cash QTP expense allocation': total(cashRows, 'allocated'), 'Cash QTP credit allocation': total(cashRows, 'credit') } : {};
    return { id: expense.id, accountRows, cashInputs, inputs: { 'Actual tuition': expenseAmount, 'Provided benefit': provided, 'ESA gross distribution': esaGross,
      'Refund': refund, 'Tax-free assistance': assistance, 'Education credit expense': credit, 'Other tax benefit': other,
      'Adjusted tuition': adjusted, 'QTP expense allocation': qtpAmount, 'ESA expense allocation': esaAmount,
      'QTP credit allocation': qtpCredit, 'ESA credit allocation': esaCredit } };
  });
  type InputKey = keyof typeof rows[number]['inputs'];
  const total = (key: InputKey, selected = rows) => selected.reduce((value, row) => value.plus(row.inputs[key]), new SourceDecimal(0));
  const qtpGross = qtps.reduce((value, source) => {
    const gross = amount(source.grossDistribution, 'QTP gross');
    const linked = rows.flatMap(row => row.accountRows.filter(account => account.sourceId === source.sourceId));
    const provided = annualBenefits.filter(row=>row.sourceId===source.sourceId).reduce((value,row)=>value.plus(amount(row.amount,'annual provided benefit')),new SourceDecimal(0));
    const allocated = annualAllocations.filter(row=>row.sourceId===source.sourceId).reduce((value,row)=>value.plus(amount(row.amount,'annual allocation')).plus(amount(row.creditAmount,'annual credit')),new SourceDecimal(0));
    if ((linked.length === 0 && !roomBoard.qualifiedBySource.has(source.sourceId??'')) || (source.distributionMedium === 'in_kind_prepaid_tuition' && !provided.eq(gross)) || allocated.gt(gross)) {
      throw new Error('In-kind tuition ESA actual allocations must conserve each original QTP distribution');
    }
    return value.plus(gross);
  }, new SourceDecimal(0));
  for (const esa of esas) {
    const allocated = annualAllocations.filter(row=>row.sourceId===esa.sourceId).reduce((value,row)=>value.plus(amount(row.amount,'annual ESA allocation')).plus(amount(row.creditAmount,'annual ESA credit')),new SourceDecimal(0));
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
  return { ...selected.inputs, ...selected.cashInputs, 'Provided benefit': selectedQtp.provided,
    'QTP expense allocation': selectedQtp.allocated, 'QTP credit allocation': selectedQtp.credit };
}
