/** 2026 selected public-cash ledger. Spec: nonitemized-charitable-carryover.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableContributionWorksheetInput } from './charitable-contribution-worksheet.js';
import type { CharitableCarryoverResult } from './charitable-carryover.js';
import { validateCharitableCarryoverSources, type CharitableCarryoverBalance } from './charitable-carryover-source-validation.js';
import { eligibleCurrentCharitableDonations } from './charitable-current-sources.js';
import { resolveCharitableRecipient } from '@/utils/charitable-recipient.js';
import { calculateK1CharitableReturnSources } from './k1-charitable-return-sources.js';
import { calculateCharitableDeterminedFloor } from './charitable-determined-floor.js';
import { charitableFilingUnitAmount } from '@/utils/charitable-filing-unit-ratios.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';

export interface NonitemizedCharitableCarryoverResult extends CharitableCarryoverResult {
  method: '2026_nonitemized_public_cash';
  deductionMethod: 'standard' | 'nonitemized';
  contributionBase: Decimal;
  currentCashPaid: Decimal;
  percentageCapacity: Decimal;
  currentWithinPercentageLimit: Decimal;
  currentExcess: Decimal;
}

/** Internal canonical current amounts; no taxpayer-supplied calculated carry. */
export function calculateNonitemizedCharitableCarryover(input: TaxYearInput, context: {
  contributionBase: Decimal; current: CharitableContributionWorksheetInput['amounts'];
}): NonitemizedCharitableCarryoverResult {
  if (input.taxpayer.taxYear !== 2026) throw new Error('Nonitemized public-cash carry requires actual2026 sources');
  if (input.deductionElection !== 'standard' && input.deductionElection !== 'nonitemized') {
    throw new Error('Nonitemized public-cash carry requires an explicit standard or nonitemized selection');
  }
  if (input.netOperatingLoss || input.form172 || input.form982NolSources || !d(input.priorYear?.nolCarryforward).isZero()) {
    throw new Error('Nonitemized public-cash carry with NOL sources requires its separate loss method');
  }
  const current = context.current;
  if (!Decimal.isDecimal(context.contributionBase) || !context.contributionBase.isFinite()
    || [current.cashPublic, current.noncashPublic, current.capitalGainPublic, current.cashPrivate, current.noncashPrivate, current.capitalGainPrivate]
      .some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error('Nonitemized charitable amounts must be finite with nonnegative current contributions');
  }
  if ([current.noncashPublic, current.capitalGainPublic, current.cashPrivate, current.noncashPrivate, current.capitalGainPrivate].some(value => !value.isZero())) {
    throw new Error('Nonitemized carry currently requires only the actual public cash category');
  }
  const actualDonations = eligibleCurrentCharitableDonations(input);
  const k1Cash=calculateK1CharitableReturnSources(input)?.amounts.cashPublic ?? d(0);
  if (actualDonations.some(row => row.type !== 'cash' || resolveCharitableRecipient(row).percentageCategory !== 'fifty-percent')
    || !sum(...actualDonations.map(row => d(row.amount))).plus(k1Cash).eq(current.cashPublic)) {
    throw new Error('Nonitemized public cash must reconcile to actual current receipts; pass-through and other categories require their separate source method');
  }
  const records = validateCharitableCarryoverSources(input);
  if (records.some(row => row.category !== 'cash_60' || row.medium !== 'cash')) {
    throw new Error('Nonitemized carry currently requires actual cash_60 prior history');
  }
  const zero = d('0'), taxYear = input.taxpayer.taxYear;
  const contributionBase = zeroFloor(context.contributionBase), currentCashPaid = current.cashPublic;
  const percentageCapacity = contributionBase.times('0.60');
  const currentWithinPercentageLimit = Decimal.min(currentCashPaid, percentageCapacity);
  const currentExcess = currentCashPaid.minus(currentWithinPercentageLimit);
  let capacity = zeroFloor(percentageCapacity.minus(currentCashPaid));
  const audit = new AuditTrail();
  for (const row of records) for (const source of row.filingUnitSources ?? []) audit.record('Charitable Filing History', source.sourceId,
    'Original filed ownership history available to this return', charitableFilingUnitAmount([source.openingBalance]),
    'Original category and ownership retained through nonitemized treated-paid use', {
      'Contribution year': String(source.contributionYear), 'Exact opening ratio': `${source.openingBalance.numerator}/${source.openingBalance.denominator}`,
      'Excluded ownership ratio': `${source.excludedBalance.numerator}/${source.excludedBalance.denominator}`,
    });
  audit.record('Nonitemized Charitable Carry', 'current', 'Actual current public cash', currentCashPaid,
    'Current qualified cash receipts, separate from actual prior vintages');
  audit.record('Nonitemized Charitable Carry', 'percentage-capacity', 'Current public-cash percentage limit', percentageCapacity,
    '60% of actual nonnegative contribution base; no intermediate dollar rounding', { 'Contribution base': contributionBase });
  audit.record('Nonitemized Charitable Carry', 'current-excess', 'New percentage-limit cash carryover', currentExcess,
    'Current cash less current percentage allowance; section170(p) cap does not create carry; eligible floor is added separately to otherwise-allowable carry',
    { 'Current cash': currentCashPaid, 'Current percentage allowance': currentWithinPercentageLimit });
  const detail = records.map((row, index) => {
    const treatedAsPaid = row.taxYear + 5 < taxYear ? zero : Decimal.min(row.amount, capacity);
    capacity = capacity.minus(treatedAsPaid);
    const remainder = row.amount.minus(treatedAsPaid), expires = row.taxYear + 5 <= taxYear;
    const amountExpired = expires ? remainder : zero, amountRemaining = expires ? zero : remainder;
    audit.record('Nonitemized Charitable Carry', `prior-${index + 1}`, 'Actual prior cash treated as paid', treatedAsPaid,
      'Current cash precedes oldest eligible prior vintage; use through original fifth year without a current deduction',
      { 'Contribution year': String(row.taxYear), 'Opening': row.amount, 'Expired': amountExpired, 'Remaining': amountRemaining });
    return { sourceId: row.sourceId, taxYear: row.taxYear, category: row.category, medium: row.medium,
      ...(row.filingUnitSources ? { filingUnitSources: row.filingUnitSources } : {}),
      amountAvailable: row.amount, treatedAsPaid, amountUsed: zero, amountExpired, amountRemaining };
  });
  const allowable = calculateCharitableDeterminedFloor(input, context);
  const carryforwards: CharitableCarryoverBalance[] = allowable.carryforwards.map(row => ({ ...row }));
  audit.merge(allowable.lines);
  const priorTreatedAsPaid = sum(...detail.map(row => row.treatedAsPaid)), expired = sum(...detail.map(row => row.amountExpired));
  audit.record('Nonitemized Charitable Carry', 'remaining', 'Actual succeeding-year charitable carry', sum(...carryforwards.map(row => row.amount)),
    'Original surviving vintages plus exact current percentage excess and eligible current floor; no fabricated current deduction');
  audit.record('Nonitemized Charitable Carry', 'expired', 'Expired actual charitable carry', expired, 'Original fifth-year remainder and older unused sources');
  return { method: '2026_nonitemized_public_cash', deductionMethod: input.deductionElection, contributionBase, currentCashPaid,
    percentageCapacity, currentWithinPercentageLimit, currentExcess,
    currentCash: zero, currentNoncash: zero, priorDeduction: zero, priorCashDeduction: zero, priorNoncashDeduction: zero,
    priorTreatedAsPaid, totalDeduction: zero, detail, carryforwards, expired, lines: audit.getLines() };
}
