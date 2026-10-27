/** Actual annual ordinary cash sources; spec/federal/form-1099-q-annual-cash.yaml. */
import Decimal from 'decimal.js';
import type { Form1099Q, QualifiedEducationExpenseSummary } from '@/models/inputs.js';
import type { RoomBoardPeriodResults } from './education-room-board-periods.js';
import { readAnnualEducationCategorySources } from './education-annual-category-sources.js';

type Facts = NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;
/** Calculated exact ratios, never user-entered source or penny allocations. */
export interface AnnualCashReportingAmounts {
  denominator: Decimal;
  taxableNumerator: Decimal;
  excludedNumerator: Decimal;
  creditExceptionNumerator: Decimal;
  penaltyExceptionNumerator: Decimal;
}
export interface AnnualCashQtpSource {
  sourceId: string;
  beneficiaryId: string;
  gross: Decimal;
  qualifiedExpenses: Decimal;
  originalAllocatedExpenses: Decimal;
  calculatedExpenseShare: Decimal;
  calculatedCreditShare: Decimal;
  exactExcludedEarnings: Decimal;
  exactTaxableEarnings: Decimal;
  excludedEarnings: Decimal;
  taxableEarnings: Decimal;
  creditException: Decimal;
  reporting: AnnualCashReportingAmounts;
  exceptionEarningsFactor: Decimal;
  inputs: Record<string, Decimal | string>;
}
export interface AnnualCashQtpPool {
  beneficiaryId: string;
  sourceIds: string[];
  qualifiedExpenses: Decimal;
  categoryCosts?: { k12: Decimal; loans: ReadonlyMap<string, Decimal> };
}

/** Add exact ratios before rounding a printed line, including repeating fractions. */
export function roundEducationSourceAmounts(values: readonly { amount: Decimal; numerator?: Decimal; denominator?: Decimal }[]): Decimal {
  const inputs = values.flatMap(value => [value.numerator ?? value.amount, value.denominator ?? new Decimal(1)]);
  if (inputs.some(value => !value.isFinite()) || values.some(value => value.denominator?.lte(0)))
    throw new Error('Annual cash reporting requires finite source amounts and positive denominators');
  const digits = Math.max(1, ...inputs.map(value => value.precision(true) + value.decimalPlaces()));
  const D = Decimal.clone({ precision: Math.max(50, digits * (2 * values.length + 2) + 8) });
  let numerator = new D(0), denominator = new D(1);
  for (const value of values) {
    const nextDenominator = new D(value.denominator ?? 1);
    numerator = numerator.times(nextDenominator).plus(new D(value.numerator ?? value.amount).times(denominator));
    denominator = denominator.times(nextDenominator);
  }
  const absolute = numerator.abs(), whole = absolute.divToInt(denominator);
  const rounded = absolute.minus(whole.times(denominator)).times(2).gte(denominator) ? whole.plus(1) : whole;
  return new Decimal((numerator.lt(0) ? rounded.negated() : rounded).toFixed());
}

/** Source records stay unchanged; computed shares are not expense allocations. */
export function calculateAnnualCashQtpPools(forms: readonly Form1099Q[], facts: Facts,
  roomBoard: RoomBoardPeriodResults, taxYear: number): { sources: Map<string, AnnualCashQtpSource>; pools: AnnualCashQtpPool[] } {
  const result = { sources: new Map<string, AnnualCashQtpSource>(), pools: [] as AnnualCashQtpPool[] };
  const sourceNumbers: Decimal[] = [];
  const scan = (value: unknown): void => {
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) sourceNumbers.push(new Decimal(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(scan);
  };
  scan([forms, facts]);
  const integers = Math.max(1, ...sourceNumbers.map(v => v.precision(true) - v.decimalPlaces()));
  const fractions = Math.max(0, ...sourceNumbers.map(v => v.decimalPlaces()));
  const D = Decimal.clone({ precision: Math.max(50, 4 * (integers + fractions) + String(sourceNumbers.length).length + 8) });
  const money = (value: string | undefined, label: string, signed = false): Decimal => {
    if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`Annual cash QTP actual ${label} is missing or invalid`);
    const v = new D(value);
    if (!v.isFinite() || (!signed && v.lt(0))) throw new Error(`Annual cash QTP actual ${label} is invalid`);
    return v;
  };
  const total = (values: readonly Decimal[]) => values.reduce((a, b) => a.plus(b), new D(0));
  const categorySources = readAnnualEducationCategorySources(forms, facts, taxYear);
  for (const beneficiaryId of new Set(forms.map(form => form.beneficiaryId))) {
    const group = forms.filter(form => form.beneficiaryId === beneficiaryId);
    const cash = group.filter(form => form.accountType === '529' && form.distributionMedium === 'cash');
    // The separate original ESA election and ordinary single-source methods
    // remain authoritative. They are not converted into this annual cohort.
    if (cash.length < 2 || group.some(form => form.accountType === 'coverdell_esa')) continue;
    const first = cash[0];
    if (!first || !beneficiaryId || facts.taxYear !== taxYear || facts.sourceFactsConfirmed !== true
      || facts.allDistributionsReconciled !== true || !Array.isArray(facts.expenses) || !Array.isArray(facts.allocations)
      || !Array.isArray(facts.coverdellAccounts) || !Array.isArray(facts.penaltyExceptions)
      || !first.recipientOwner || (first.recipientOwner === 'other' && !first.recipientId?.trim())
      || new Set(group.map(form => form.sourceId)).size !== group.length
      || new Set(group.map(form => form.accountId)).size !== group.length
      || group.some(form => !form.sourceId?.trim() || !form.accountId?.trim() || form.accountType !== '529'
        || !['cash', 'in_kind_prepaid_tuition'].includes(form.distributionMedium ?? '')
        || form.taxYear !== taxYear || form.sourceFactsConfirmed !== true || form.sourceFactsComplete === false
        || form.recipientOwner !== first.recipientOwner || form.recipientId !== first.recipientId
        || typeof form.recipientNotBeneficiary !== 'boolean' || form.recipientNotBeneficiary !== first.recipientNotBeneficiary
        || Object.entries(form).some(([key, value]) => value !== undefined && (key.startsWith('returnedContribution') || key.startsWith('prohibitedTransaction')))
        || form.isTrusteeToTrustee !== false || form.isQtpToRoth !== false || form.transfer?.kind !== 'none'
        || Object.entries(form.transfer ?? {}).some(([key, value]) => key !== 'kind' && value !== undefined)
        || (form.distributionCode !== undefined && form.distributionCode !== '1'))) {
      throw new Error('Annual cash QTP requires complete ordinary same-year beneficiary and recipient originals without transfers or corrections');
    }
    const beneficiaries = facts.beneficiaries?.filter(person => person.id === beneficiaryId) ?? [];
    if (beneficiaries.length !== 1 || !money(beneficiaries[0]?.outsideK12QualifiedDistributions, 'outside-plan qualified distributions').isZero())
      throw new Error('Annual cash QTP known outside-plan distributions require their complete original sources');
    const expenses = facts.expenses.filter(expense => expense.beneficiaryId === beneficiaryId);
    const hasCategorySources = expenses.some(expense => categorySources.has(expense.id));
    if (expenses.some(expense => !expense.category.startsWith('postsecondary_') && !categorySources.has(expense.id))) {
      throw new Error('Annual cash QTP special expense categories require their separate source calculation');
    }
    const prepaidIds = new Set(group.filter(form => form.distributionMedium === 'in_kind_prepaid_tuition').map(form => form.sourceId));
    for (const form of group) {
      const gross = money(form.grossDistribution, 'Box1'), earnings = money(form.earnings, 'Box2', true), basis = money(form.basis, 'Box3');
      if (!gross.eq(earnings.plus(basis))) throw new Error('Annual cash QTP original Box1 must reconcile exactly to Box2 and Box3');
      const original = facts.allocations.filter(row => row.sourceId === form.sourceId);
      if (total(original.map(row => money(row.amount, 'original expense allocation').plus(money(row.creditAmount, 'original credit allocation')))).gt(gross)) {
        throw new Error('Annual cash QTP original expense allocations exceed Box1 capacity');
      }
    }
    let qualified = new D(0), credits = new D(0), k12 = new D(0);
    const loanCosts = new Map<string, Decimal>(), prepaidLoanCosts = new Map<string, Decimal>();
    for (const expense of expenses) {
      if (roomBoard.expenseIds.has(expense.id)) continue;
      if (expense.category === 'postsecondary_room_board') throw new Error('Annual cash QTP room and board requires the actual academic-period packet');
      if (typeof expense.qualificationConfirmed !== 'boolean') throw new Error('Annual cash QTP actual expense qualification is missing');
      if (!new RegExp(`^${taxYear}-\\d{2}-\\d{2}$`).test(expense.paidDate ?? '')) throw new Error('Annual cash QTP actual expense paid year is inconsistent');
      const cost = money(expense.amount, 'expense'), refund = money(expense.refundedAmount, 'refund'), aid = money(expense.taxFreeAssistance, 'assistance');
      const credit = money(expense.educationCreditAmount, 'education credit'), other = money(expense.otherTaxBenefitAmount, 'other benefit');
      const available = cost.minus(refund).minus(aid).minus(credit).minus(other);
      if (available.lt(0)) throw new Error('Annual cash QTP source reductions exceed actual expense');
      const linked = facts.allocations.filter(row => row.expenseId === expense.id);
      if (total(linked.map(row => money(row.amount, 'receipt allocation'))).gt(available)
        || total(linked.map(row => money(row.creditAmount, 'receipt credit allocation'))).gt(credit)) {
        throw new Error('Annual cash QTP original receipt allocation exceeds its source capacity');
      }
      if (!expense.qualificationConfirmed) continue;
      const prepaid = linked.filter(row => prepaidIds.has(row.sourceId));
      const prepaidQualified = total(prepaid.map(row => money(row.amount, 'qualified prepaid expense')));
      const prepaidCredit = total(prepaid.map(row => money(row.creditAmount, 'prepaid credit expense')));
      const category = categorySources.get(expense.id);
      if (category) {
        const remaining = D.max(0, new D(category.qualified).minus(prepaidQualified));
        if (category.k12) k12 = k12.plus(remaining);
        else if (category.borrowerId) {
          loanCosts.set(category.borrowerId, (loanCosts.get(category.borrowerId) ?? new D(0)).plus(remaining));
          prepaidLoanCosts.set(category.borrowerId, (prepaidLoanCosts.get(category.borrowerId) ?? new D(0)).plus(D.min(category.qualified, prepaidQualified)));
        } else qualified = qualified.plus(remaining);
        continue;
      }
      qualified = qualified.plus(available.minus(prepaidQualified));
      credits = credits.plus(credit.minus(prepaidCredit));
    }
    const k12Limit = new D(taxYear === 2026 ? '20000' : '10000');
    const qualifiedK12 = D.min(k12, k12Limit);
    qualified = qualified.plus(qualifiedK12);
    let qualifiedLoans = new D(0);
    const qualifiedLoansByBorrower = new Map<string, Decimal>();
    for (const [borrowerId, cost] of loanCosts) {
      const borrower = facts.loanBorrowers?.find(row => row.id === borrowerId);
      if (!borrower?.owner) throw new Error('Annual cash QTP actual borrower ownership and lifetime history are required');
      const limit = D.max(0, new D(10000).minus(money(borrower.priorQualifiedDistributions, 'prior borrower qualified distributions'))
        .minus(money(borrower.otherCurrentQualifiedDistributions, 'other current borrower qualified distributions')));
      const otherBeneficiaries = (facts.expenses ?? []).filter(expense => expense.borrowerId === borrowerId && expense.beneficiaryId !== beneficiaryId);
      if (otherBeneficiaries.some(expense => !categorySources.has(expense.id))) throw new Error('Annual cash QTP shared borrower requires complete current beneficiary sources');
      const allCost = total([...categorySources].filter(([id, value]) => value.borrowerId === borrowerId
        && facts.expenses?.some(expense => expense.id === id)).map(([, value]) => value.qualified));
      if (otherBeneficiaries.length && allCost.gt(limit)) throw new Error('Annual cash QTP binding cross-beneficiary borrower limit requires its actual allocation method');
      const remaining = D.max(0, limit.minus(prepaidLoanCosts.get(borrowerId) ?? new D(0)));
      const qualifiedLoan = D.min(cost, remaining);
      qualifiedLoansByBorrower.set(borrowerId, qualifiedLoan);
      qualifiedLoans = qualifiedLoans.plus(qualifiedLoan);
    }
    qualified = qualified.plus(qualifiedLoans);
    for (const period of roomBoard.periods.filter(period => period.beneficiaryId === beneficiaryId)) {
      const capacity = period.inputs['Derived period capacity'];
      if (!Decimal.isDecimal(capacity)) throw new Error('Annual cash QTP requires the completed original academic-period capacity');
      const prepaid = total([...period.qualifiedBySource].filter(([id]) => prepaidIds.has(id)).map(([, value]) => value));
      qualified = qualified.plus(D.max(0, new D(capacity).minus(prepaid)));
    }
    const gross = total(cash.map(form => money(form.grossDistribution, 'cash gross')));
    qualified = D.min(gross, qualified);
    const beforeCredit = D.min(gross, qualified.plus(credits));
    const pool: AnnualCashQtpPool = { beneficiaryId, sourceIds: cash.map(form => form.sourceId ?? ''), qualifiedExpenses: qualified,
      ...(hasCategorySources ? { categoryCosts: { k12: qualifiedK12, loans: qualifiedLoansByBorrower } } : {}) };
    result.pools.push(pool);
    for (const form of cash) {
      const sourceId = form.sourceId ?? '', sourceGross = money(form.grossDistribution, 'cash Box1');
      const earnings = D.max(0, money(form.earnings, 'cash Box2', true));
      const exactExcluded = gross.isZero() ? new D(0) : earnings.times(qualified).div(gross);
      const exactTaxable = earnings.minus(exactExcluded);
      const beforeCreditExcluded = gross.isZero() ? new D(0) : earnings.times(beforeCredit).div(gross);
      const denominator = gross.times(sourceGross);
      const reporting: AnnualCashReportingAmounts = denominator.isZero()
        ? { denominator: new D(1), taxableNumerator: new D(0), excludedNumerator: new D(0), creditExceptionNumerator: new D(0), penaltyExceptionNumerator: new D(0) }
        : { denominator, taxableNumerator: earnings.times(gross.minus(qualified)).times(sourceGross),
          excludedNumerator: earnings.times(qualified).times(sourceGross),
          creditExceptionNumerator: earnings.times(beforeCredit.minus(qualified)).times(sourceGross),
          penaltyExceptionNumerator: earnings.times(beforeCredit.minus(qualified)).times(sourceGross) };
      const originalAllocated = total(facts.allocations.filter(row => row.sourceId === sourceId).map(row => money(row.amount, 'original cash receipt allocation')));
      const inputs: Record<string, Decimal | string> = {
        'Annual cash gross': gross, 'Annual qualified cash expenses': qualified,
        'Annual cash education-credit expenses': credits, 'Original cash gross': sourceGross,
        ...(hasCategorySources ? { 'Annual qualified K12 cash costs': qualifiedK12, 'Annual K12 cash limit': k12Limit,
          'Annual qualified principal-only loan costs': qualifiedLoans } : {}),
        'Original cash earnings': money(form.earnings, 'cash Box2', true),
        'Original linked expense amount': originalAllocated,
        'Exact excluded cash earnings': exactExcluded, 'Exact taxable cash earnings': exactTaxable,
        'Original annual statement sources': JSON.stringify(group.slice().sort((a,b)=>(a.sourceId??'').localeCompare(b.sourceId??''))),
        'Original annual expense sources': JSON.stringify(expenses.slice().sort((a,b)=>a.id.localeCompare(b.id))),
        'Original annual allocations': JSON.stringify(facts.allocations.filter(row=>group.some(form=>form.sourceId===row.sourceId)).slice().sort((a,b)=>(a.sourceId+'\0'+a.expenseId).localeCompare(b.sourceId+'\0'+b.expenseId))),
        ...(loanCosts.size ? { 'Original annual borrower sources': JSON.stringify((facts.loanBorrowers ?? []).filter(row => loanCosts.has(row.id)).slice().sort((a,b) => a.id.localeCompare(b.id))) } : {}),
      };
      result.sources.set(sourceId, { sourceId, beneficiaryId, gross, qualifiedExpenses: qualified, originalAllocatedExpenses: originalAllocated,
        calculatedExpenseShare: gross.isZero() ? new D(0) : sourceGross.times(qualified).div(gross),
        calculatedCreditShare: gross.isZero() ? new D(0) : sourceGross.times(beforeCredit.minus(qualified)).div(gross),
        exactExcludedEarnings: exactExcluded, exactTaxableEarnings: exactTaxable,
        excludedEarnings: exactExcluded, taxableEarnings: exactTaxable,
        creditException: beforeCreditExcluded.minus(exactExcluded), reporting,
        exceptionEarningsFactor: earnings.times(gross), inputs });
    }
  }
  return result;
}
