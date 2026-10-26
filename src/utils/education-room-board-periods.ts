/** Original period/receipt sources and determined allocations; no tax-result overrides. */
import Decimal from 'decimal.js';
import type { Form1099Q, QualifiedEducationExpenseSummary } from '@/models/inputs.js';
type Facts = NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;
export interface RoomBoardPeriodResult {
  id: string;
  beneficiaryId: string;
  expenseIds: string[];
  inputs: Record<string, Decimal | string>;
  qualifiedBySource: Map<string, Decimal>;
}
export interface RoomBoardPeriodResults {
  periods: RoomBoardPeriodResult[];
  expenseIds: Set<string>;
  qualifiedBySource: Map<string, Decimal>;
}
export function calculateRoomBoardPeriods(forms: readonly Form1099Q[], facts: Facts, taxYear: number | undefined): RoomBoardPeriodResults {
  const empty: RoomBoardPeriodResults = { periods: [], expenseIds: new Set(), qualifiedBySource: new Map() };
  if (facts.roomBoardPeriods === undefined) {
    if (facts.roomBoardPeriodExpenses !== undefined || facts.roomBoardEsaAllocations !== undefined)
      throw new Error('Room-and-board original period records are missing');
    return empty;
  }
  if ((taxYear !== 2025 && taxYear !== 2026) || facts.taxYear !== taxYear || facts.sourceFactsConfirmed !== true || facts.allDistributionsReconciled !== true)
    throw new Error('Room-and-board actual annual source year and confirmations are required');
  if (!Array.isArray(facts.roomBoardPeriodExpenses) || !Array.isArray(facts.roomBoardEsaAllocations))
    throw new Error('Room-and-board actual receipt and ESA allocation lists are required, including known empty lists');
  const strings: string[] = [];
  const scan = (value: unknown): void => {
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
      strings.push(value);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(scan);
    }
  };
  scan([forms, facts]);
  const originals = strings.map(value => new Decimal(value));
  const integer = Math.max(1, ...originals.map(value => value.precision(true) - value.decimalPlaces()));
  const fraction = Math.max(0, ...originals.map(value => value.decimalPlaces()));
  // Source conservation must not lose a supplied decimal tail. This clone
  // leaves the process-wide Decimal context unchanged.
  const D = Decimal.clone({ precision: Math.max(40, integer + fraction + String(strings.length).length + 4) });
  const money = (value: string | undefined, label: string): Decimal => {
    if (value === undefined) throw new Error(`Room-and-board actual ${label} is missing`);
    const amount = new D(value);
    if (!amount.isFinite() || amount.lt(0)) throw new Error(`Room-and-board actual ${label} is invalid`);
    return amount;
  };
  const bool = (value: boolean | undefined, label: string): boolean => {
    if (typeof value !== 'boolean') throw new Error(`Room-and-board actual ${label} is missing`);
    return value;
  };
  const text = (value: string | undefined, label: string): string => {
    if (!value?.trim()) throw new Error(`Room-and-board actual ${label} is missing`);
    return value.trim();
  };
  const date = (value: string | undefined, label: string): string => {
    const source = text(value, label);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) throw new Error(`Room-and-board invalid ${label}`);
    const parsed = new Date(source + 'T00:00:00.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== source) {
      throw new Error(`Room-and-board invalid ${label}`);
    }
    return source;
  };
  const total = (v: Decimal[]): Decimal => v.reduce((a, b) => a.plus(b), new D(0));
  const expenses = facts.expenses ?? [], links = facts.roomBoardPeriodExpenses, choices = facts.roomBoardEsaAllocations;
  const roomExpenses = expenses.filter(e => e.category === 'postsecondary_room_board');
  const seenPeriods = new Set<string>(), seenExpenses = new Set<string>();
  const periodDates: Array<{
    beneficiary: string;
    start: string;
    end: string;
  }> = [];
  if (new Set(forms.map(f => f.sourceId)).size !== forms.length)
    throw new Error('Room-and-board original distribution sources are duplicated');
  for (const period of facts.roomBoardPeriods) {
    const id = text(period.id, 'period identity'), beneficiaryId = text(period.beneficiaryId, 'period beneficiary');
    if (seenPeriods.has(id))
      throw new Error('Room-and-board duplicate period identity');
    seenPeriods.add(id);
    if (period.sourceTaxYear !== taxYear || period.sourceFactsConfirmed !== true || period.allReceiptsIncludedConfirmed !== true || period.allowanceApplicableConfirmed !== true)
      throw new Error('Room-and-board actual period year and complete source confirmations are required');
    text(period.sourceReference, 'period source reference');
    text(period.institutionId, 'institution identity');
    text(period.institutionName, 'institution name');
    const start = date(period.academicPeriodStart, 'academic period start'), end = date(period.academicPeriodEnd, 'academic period end');
    if (start > end || Number(start.slice(0, 4)) !== taxYear || Number(end.slice(0, 4)) !== taxYear)
      throw new Error('Room-and-board academic period requires actual same-return-year start and end; cross-year usage needs its separate source history');
    if (periodDates.some(p => p.beneficiary === beneficiaryId && p.start <= end && p.end >= start))
      throw new Error('Room-and-board overlapping academic periods require one reconciled actual allowance group');
    periodDates.push({ beneficiary: beneficiaryId, start, end });
    if (!['with_parent', 'off_campus', 'institution_housing'].includes(period.livingArrangement ?? ''))
      throw new Error('Room-and-board actual living arrangement is missing');
    const institution = bool(period.institutionEligible, 'institution eligibility'), halfTime = bool(period.halfTimeStudent, 'half-time enrollment');
    const housing = bool(period.schoolOwnedHousing, 'institution housing fact'), allowance = money(period.roomBoardAllowance, 'period allowance'), invoice = money(period.schoolOwnedHousingCharge, 'institution housing invoice');
    if (housing !== (period.livingArrangement === 'institution_housing') || (!housing && !invoice.isZero()))
      throw new Error('Room-and-board institutional housing invoice contradicts actual residence');
    if (housing)
      text(period.schoolHousingInvoiceReference, 'institution housing invoice reference');
    const rows = links.filter(l => l.periodId === id);
    if (!rows.length)
      throw new Error('Room-and-board period has no actual receipt links');
    const periodExpenses = rows.map(link => {
      const expenseId = text(link.expenseId, 'receipt identity'), matches = expenses.filter(e => e.id === expenseId), expense = matches[0];
      if (seenExpenses.has(expenseId) || matches.length !== 1 || !expense || expense.category !== 'postsecondary_room_board' || expense.beneficiaryId !== beneficiaryId)
        throw new Error('Room-and-board receipt membership is duplicated or contradicts its original beneficiary');
      seenExpenses.add(expenseId);
      if (link.sourceFactsConfirmed !== true)
        throw new Error('Room-and-board actual receipt source confirmation is required');
      text(link.sourceReference, 'receipt source reference');
      const coveredStart = date(link.coveredStart, 'receipt service start'), coveredEnd = date(link.coveredEnd, 'receipt service end');
      if (coveredStart > coveredEnd || coveredStart < start || coveredEnd > end)
        throw new Error('Room-and-board receipt service period conflicts with its actual academic period');
      if (Number(date(expense.paidDate, 'receipt paid date').slice(0, 4)) !== taxYear)
        throw new Error('Room-and-board actual paid year does not match return year');
      const amount = money(expense.amount, 'receipt amount'), refund = money(expense.refundedAmount, 'receipt refunds'), assistance = money(expense.taxFreeAssistance, 'receipt assistance');
      if (!money(expense.educationCreditAmount, 'receipt education credit').isZero() || !money(expense.otherTaxBenefitAmount, 'receipt other benefit').isZero())
        throw new Error('Room-and-board receipt credit/other-benefit source treatment requires its separate method');
      if (refund.plus(assistance).gt(amount))
        throw new Error('Room-and-board receipt reductions exceed original cost');
      const qualifies = bool(expense.qualificationConfirmed, 'receipt qualification');
      if (expense.halfTimeStudent !== undefined && expense.halfTimeStudent !== halfTime)
        throw new Error('Room-and-board receipt enrollment conflicts with period source');
      if ((expense.roomBoardAllowance !== undefined && !money(expense.roomBoardAllowance, 'legacy receipt allowance').eq(allowance)) || (expense.schoolOwnedHousingCharge !== undefined && !money(expense.schoolOwnedHousingCharge, 'legacy housing invoice').eq(invoice)))
        throw new Error('Room-and-board receipt limit conflicts with its one actual period source');
      return { expense, amount, refund, assistance, qualifies };
    });
    const ids = new Set(periodExpenses.map(e => e.expense.id));
    const groupForms = forms.filter(f => f.beneficiaryId === beneficiaryId);
    if (!groupForms.length || groupForms.some(f => !f.sourceId || !f.accountId || f.taxYear !== taxYear || f.sourceFactsConfirmed !== true || f.sourceFactsComplete === false || f.transfer?.kind !== 'none' || f.isTrusteeToTrustee !== false || f.isQtpToRoth !== false || !['1', undefined].includes(f.distributionCode) || !['529', 'coverdell_esa'].includes(f.accountType)))
      throw new Error('Room-and-board period requires complete ordinary original distributions without transfers or special codes');
    const first = groupForms[0];
    if (!first || !first.recipientOwner || groupForms.some(f => f.recipientOwner !== first.recipientOwner || f.recipientId !== first.recipientId))
      throw new Error('Room-and-board original recipient group requires separate actual ownership reconciliation');
    for (const receipt of periodExpenses) {
      const allocations = (facts.allocations ?? []).filter(row => row.expenseId === receipt.expense.id);
      for (const allocation of allocations) {
        if (!groupForms.some(form => form.sourceId === allocation.sourceId))
          throw new Error('Room-and-board receipt allocation has no matching original beneficiary distribution');
        if (!money(allocation.creditAmount, 'receipt allocation credit').isZero())
          throw new Error('Room-and-board receipt allocation cannot claim an education credit');
      }
      const allocated = total(allocations.map(row => money(row.amount, 'receipt allocation amount')));
      if (allocated.gt(receipt.amount.minus(receipt.refund).minus(receipt.assistance)))
        throw new Error('Room-and-board allocation exceeds its original receipt capacity');
    }
    const rawBySource = new Map<string, Decimal>(), originalBySource = new Map<string, Decimal>();
    const benefits = facts.inKindBenefits ?? [];
    const hasEsa = groupForms.some(f => f.accountType === 'coverdell_esa' && money(f.grossDistribution, 'ESA distribution').gt(0));
    for (const form of groupForms) {
      const sourceId = text(form.sourceId, 'original distribution identity');
      if (form.accountType === '529' && !['cash', 'in_kind_prepaid_tuition'].includes(form.distributionMedium ?? ''))
        throw new Error('Room-and-board original distribution medium is missing');
      const all = (facts.allocations ?? []).filter(a => a.sourceId === sourceId);
      if (total(all.map(a => money(a.amount, 'original expense allocation').plus(money(a.creditAmount, 'original credit allocation')))).gt(money(form.grossDistribution, 'original distribution gross')))
        throw new Error('Room-and-board allocations exceed their original distribution capacity');
      const local = all.filter(a => ids.has(a.expenseId));
      if (new Set(local.map(a => a.expenseId)).size !== local.length)
        throw new Error('Room-and-board duplicate original receipt allocation');
      const raw = total(local.map(a => money(a.amount, 'period original allocation')));
      originalBySource.set(sourceId, raw);
      rawBySource.set(sourceId, total(local.filter(a => periodExpenses.some(r => r.expense.id === a.expenseId && r.qualifies)).map(a => money(a.amount, 'eligible original allocation'))));
      if (form.distributionMedium === 'in_kind_prepaid_tuition') {
        for (const row of local) {
          const benefitRows = benefits.filter(b => b.sourceId === sourceId && b.expenseId === row.expenseId);
          if (!benefitRows.length)
            throw new Error('Room-and-board original prepaid benefit receipt is missing');
          for (const benefit of benefitRows) {
            const provided = date(benefit.providedDate, 'benefit provided date');
            if (provided < start || provided > end)
              throw new Error('Room-and-board benefit provided date is outside its actual period');
          }
          const provided = total(benefitRows.map(b => money(b.amount, 'actual provided benefit')));
          const originalAllocation = money(row.amount, 'prepaid original allocation');
          if (originalAllocation.gt(provided))
            throw new Error('Room-and-board original allocation exceeds its actual prepaid benefit');
          const receipt = periodExpenses.find(r => r.expense.id === row.expenseId);
          if (!receipt)
            throw new Error('Room-and-board original receipt is missing');
          const allProvided = total(benefits.filter(b => b.expenseId === row.expenseId).map(b => money(b.amount, 'provided receipt benefits')));
          if (allProvided.gt(receipt.amount))
            throw new Error('Room-and-board provided benefits exceed original receipt');
          if (!hasEsa) {
            const receiptAvailable = receipt.amount.minus(receipt.refund).minus(receipt.assistance);
            const originalPrepaidSources = new Set(benefits.filter(b => b.expenseId === row.expenseId).map(b => b.sourceId));
            if (originalPrepaidSources.size > 1 && allProvided.gt(receiptAvailable))
              throw new Error('Room-and-board multiple prepaid originals require a reconciled source allocation after receipt reductions');
            const expected = originalPrepaidSources.size === 1 ? D.min(provided, receiptAvailable) : provided;
            if (!originalAllocation.eq(expected))
              throw new Error('Room-and-board original prepaid allocation must conserve provided benefit before the category cap');
          }
        }
      }
    }
    const cost = total(periodExpenses.filter(r => r.qualifies).map(r => r.amount.minus(r.refund)));
    const assistance = total(periodExpenses.filter(r => r.qualifies).map(r => r.assistance));
    const limit = D.max(allowance, invoice), capacity = institution && halfTime ? D.max(0, D.min(cost, limit).minus(assistance)) : new D(0);
    const requested = total([...rawBySource.values()]);
    const available = total(periodExpenses.map(r => r.amount.minus(r.refund).minus(r.assistance)));
    if (total([...originalBySource.values()]).gt(available))
      throw new Error('Room-and-board original receipt allocations exceed actual available costs');
    const target = D.min(capacity, requested), qualified = new Map<string, Decimal>();
    const esa = groupForms.filter(f => f.accountType === 'coverdell_esa' && money(f.grossDistribution, 'ESA distribution').gt(0));
    if (esa.length) {
      if (period.esaAllocationConfirmed !== true)
        throw new Error('Room-and-board actual ESA coordination allocation confirmation is required');
      text(period.esaAllocationSourceReference, 'ESA coordination source reference');
      const elected = choices.filter(c => c.periodId === id);
      if (elected.length !== groupForms.length || new Set(elected.map(c => c.sourceId)).size !== elected.length)
        throw new Error('Room-and-board actual ESA allocation requires every original, including actual zero');
      for (const form of groupForms) {
        const sourceId = text(form.sourceId, 'source identity'), matches = elected.filter(c => c.sourceId === sourceId), choice = matches[0];
        if (matches.length !== 1 || !choice)
          throw new Error('Room-and-board actual ESA allocation original source is missing');
        const amount = money(choice.amount, 'ESA coordination allocation');
        if (amount.gt(rawBySource.get(sourceId) ?? new D(0)))
          throw new Error('Room-and-board actual ESA choice exceeds its original receipt allocation');
        qualified.set(sourceId, amount);
      }
      if (!total([...qualified.values()]).eq(target))
        throw new Error('Room-and-board actual ESA allocation must conserve derived period capacity');
      // The existing annual Coverdell worksheet derives the common account ratio
      // from the total actual ESA choice, including other qualified categories.
      // It does not reuse per-original election amounts as computed account results.
    }
    else {
      if (choices.some(c => c.periodId === id) || period.esaAllocationConfirmed !== undefined || period.esaAllocationSourceReference !== undefined)
        throw new Error('Room-and-board ESA allocation has no actual ESA original');
      const active = groupForms.filter(f => (rawBySource.get(f.sourceId ?? '') ?? new D(0)).gt(0));
      if (target.eq(requested) || target.isZero()) {
        for (const form of groupForms)
          qualified.set(form.sourceId ?? '', target.isZero() ? new D(0) : rawBySource.get(form.sourceId ?? '') ?? new D(0));
      }
      else {
        const prepaid = active.filter(f => f.distributionMedium === 'in_kind_prepaid_tuition'), cash = active.filter(f => f.distributionMedium === 'cash');
        const prepaidAmount = total(prepaid.map(f => rawBySource.get(f.sourceId ?? '') ?? new D(0)));
        if (prepaid.length > 1 && prepaidAmount.gt(target))
          throw new Error('Room-and-board multiple prepaid originals share a binding cap; original allocation method remains unresolved without actual ESA coordination');
        const prepaidAllowed = D.min(prepaidAmount, target), cashAllowed = D.max(0, target.minus(prepaidAllowed));
        const cashAmount = total(cash.map(f => rawBySource.get(f.sourceId ?? '') ?? new D(0)));
        if (cash.length > 1 && cashAllowed.gt(0) && cashAllowed.lt(cashAmount))
          throw new Error('Room-and-board multiple cash originals share a reduced residual; original allocation method remains unresolved');
        for (const form of groupForms) {
          const sourceId = form.sourceId ?? '', raw = rawBySource.get(sourceId) ?? new D(0);
          // Only an original with an eligible allocation to this period can
          // receive its determined share. Other same-beneficiary originals
          // may belong to a different period or have no allocated expense.
          const allowed = raw.isZero() ? new D(0)
            : form.distributionMedium === 'in_kind_prepaid_tuition'
              ? (prepaid.length === 1 ? prepaidAllowed : raw)
              : cashAllowed.isZero() ? new D(0) : cash.length === 1 ? cashAllowed : raw;
          qualified.set(sourceId, allowed);
        }
      }
    }
    if ([...qualified].some(([sourceId, amount]) => amount.gt(rawBySource.get(sourceId) ?? new D(0)))
      || !total([...qualified.values()]).eq(target))
      throw new Error('Room-and-board derived allocation must conserve each original source and the one period capacity');
    const inputs: Record<string, Decimal | string> = { 'Actual period costs': cost, 'Applicable institutional allowance': allowance, 'Actual institutional housing invoice': invoice, 'Period assistance': assistance, 'Derived period capacity': capacity, 'Original allocated costs': total([...originalBySource.values()]), 'Eligible allocated costs': requested, 'Half-time enrollment': halfTime ? 'yes' : 'no', 'Institution eligible': institution ? 'yes' : 'no', 'Period start': start, 'Period end': end, 'Living arrangement': period.livingArrangement ?? '' };
    // Retained for source/audit binding, never printed as free-text identifiers.
    inputs['Original period record'] = JSON.stringify(period);
    inputs['Original linked receipts'] = JSON.stringify(periodExpenses.map(row => ({ expense: row.expense, link: rows.find(link => link.expenseId === row.expense.id) })).sort((a, b) => a.expense.id.localeCompare(b.expense.id)));
    inputs['Original period allocations'] = JSON.stringify((facts.allocations ?? []).filter(row => ids.has(row.expenseId)).slice().sort((a, b) => (a.sourceId + '\0' + a.expenseId).localeCompare(b.sourceId + '\0' + b.expenseId)));
    inputs['Actual ESA allocation records'] = JSON.stringify(choices.filter(row => row.periodId === id).slice().sort((a, b) => (a.sourceId ?? '').localeCompare(b.sourceId ?? '')));
    const result = { id, beneficiaryId, expenseIds: [...ids], inputs, qualifiedBySource: qualified };
    empty.periods.push(result);
    ids.forEach(id => empty.expenseIds.add(id));
    for (const [sourceId, amount] of qualified)
      empty.qualifiedBySource.set(sourceId, (empty.qualifiedBySource.get(sourceId) ?? new D(0)).plus(amount));
  }
  if (roomExpenses.some(e => !seenExpenses.has(e.id)) || links.some(l => !seenPeriods.has(l.periodId ?? '')) || choices.some(c => !seenPeriods.has(c.periodId ?? '')))
    throw new Error('Room-and-board complete period/receipt membership contains missing or unused originals');
  return empty;
}
