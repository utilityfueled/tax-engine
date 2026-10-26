/** Category-separated floor with actual prior cash. Spec: prior-cash-current-property.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableContributionWorksheetInput } from './charitable-contribution-worksheet.js';
import type { CharitableCarryoverResult } from './charitable-carryover.js';
import { validateCharitableCarryoverSources, type CharitableCarryoverBalance } from './charitable-carryover-source-validation.js';
import { eligibleCurrentCharitableDonations } from './charitable-current-sources.js';
import { resolveCharitableRecipient } from '@/utils/charitable-recipient.js';
import { calculateK1CharitableReturnSources } from './k1-charitable-return-sources.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, min, sum, zeroFloor } from '@/utils/decimal.js';

export interface PriorCashCurrentPropertyResult extends CharitableCarryoverResult {
  method: '2026_prior_cash_current_property';
  nonitemizedCarryforwards: CharitableCarryoverBalance[];
  currentCashPaid: Decimal;
  currentPropertyValue: Decimal;
  currentPropertyBeforeFloor: Decimal;
  floorDisallowed: Decimal;
}

/** Both candidates are derived from original sources, never entered balances. */
export function calculatePriorCashCurrentProperty(input: TaxYearInput, context: {
  contributionBase: Decimal; current: CharitableContributionWorksheetInput['amounts'];
}): PriorCashCurrentPropertyResult {
  if (input.taxpayer.taxYear !== 2026) throw new Error('Prior cash and current property require actual 2026 sources');
  if (input.netOperatingLoss || input.form172 || input.form982NolSources || !d(input.priorYear?.nolCarryforward).isZero()) {
    throw new Error('Prior cash and current property with NOL sources require their separate loss method');
  }
  const records = validateCharitableCarryoverSources(input);
  if (!records.length || records.some(row => row.category !== 'cash_60' || row.medium !== 'cash')) {
    throw new Error('Prior cash and current property require actual cash_60 prior history only');
  }
  const current = context.current;
  if (!Decimal.isDecimal(context.contributionBase) || !context.contributionBase.isFinite()
    || Object.values(current).some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error('Charitable amounts must be finite with nonnegative current contributions');
  }
  if ([current.capitalGainPublic, current.cashPrivate, current.noncashPrivate, current.capitalGainPrivate].some(value => !value.isZero())) {
    throw new Error('Prior cash and current property require ordinary public current sources only');
  }
  const receipts = eligibleCurrentCharitableDonations(input);
  if (receipts.some(row => resolveCharitableRecipient(row).percentageCategory !== 'fifty-percent')) throw new Error('Actual current public recipient sources are required');
  const currentCashPaid = sum(...receipts.filter(row => row.type === 'cash').map(row => d(row.amount))).plus(calculateK1CharitableReturnSources(input)?.amounts.cashPublic ?? d(0));
  const currentPropertyValue = sum(...receipts.filter(row => row.type !== 'cash').map(row => {
    if (row.isLongTermCapitalGain !== false || row.costBasis === undefined) throw new Error('Current public property requires actual ordinary character and basis');
    const basis = d(row.costBasis);
    if (!basis.isFinite() || basis.lt(0)) throw new Error('Current property basis must be finite and nonnegative');
    return min(d(row.amount), basis);
  }));
  if (!currentCashPaid.eq(current.cashPublic) || !currentPropertyValue.eq(current.noncashPublic)) {
    throw new Error('Current public cash and property must reconcile exactly to actual receipts');
  }
  const zero = d('0'), taxYear = input.taxpayer.taxYear, base = zeroFloor(context.contributionBase);
  const currentCash = min(currentCashPaid, base.times('0.60'));
  let cashCapacity = base.times('0.60').minus(currentCash);
  const detail = records.map(row => {
    const treatedAsPaid = row.taxYear + 5 < taxYear ? zero : min(row.amount, cashCapacity);
    cashCapacity = cashCapacity.minus(treatedAsPaid);
    const remainder = row.amount.minus(treatedAsPaid), expires = row.taxYear + 5 <= taxYear;
    return { sourceId: row.sourceId, taxYear: row.taxYear, category: row.category, medium: row.medium,
      amountAvailable: row.amount, treatedAsPaid, amountUsed: treatedAsPaid,
      amountExpired: expires ? remainder : zero, amountRemaining: expires ? zero : remainder };
  });
  const priorDeduction = sum(...detail.map(row => row.treatedAsPaid));
  const currentPropertyBeforeFloor = min(currentPropertyValue, zeroFloor(base.times('0.50').minus(currentCash).minus(priorDeduction)));
  const floorDisallowed = base.times('0.005');
  if (currentPropertyBeforeFloor.lt(floorDisallowed)) {
    throw new Error('The entire charitable floor must be absorbed by actual current property; attribution within prior cash requires its separate method');
  }
  const currentNoncash = currentPropertyBeforeFloor.minus(floorDisallowed);
  const cashExcess = currentCashPaid.minus(currentCash), propertyExcess = currentPropertyValue.minus(currentPropertyBeforeFloor);
  const hasCurrentPercentageExcess = cashExcess.gt(0) || propertyExcess.gt(0);
  const nonitemizedCarryforwards: CharitableCarryoverBalance[] = detail.filter(row => row.amountRemaining.gt(0))
    .map(row => ({ sourceId: row.sourceId, taxYear: row.taxYear, category: row.category, medium: row.medium, amount: row.amountRemaining }));
  if (cashExcess.gt(0)) nonitemizedCarryforwards.push({ sourceId: 'current-cash_60-cash', taxYear, category: 'cash_60', medium: 'cash', amount: cashExcess });
  if (propertyExcess.gt(0)) nonitemizedCarryforwards.push({ sourceId: 'current-noncash_50-noncash', taxYear, category: 'noncash_50', medium: 'noncash', amount: propertyExcess });
  const carryforwards = nonitemizedCarryforwards.map(row => ({ ...row }));
  if (hasCurrentPercentageExcess && floorDisallowed.gt(0)) {
    const propertyCarry = carryforwards.find(row => row.taxYear === taxYear && row.category === 'noncash_50');
    if (propertyCarry) propertyCarry.amount = propertyCarry.amount.plus(floorDisallowed);
    else carryforwards.push({ sourceId: 'current-noncash_50-noncash', taxYear, category: 'noncash_50', medium: 'noncash', amount: floorDisallowed });
  }
  const audit = new AuditTrail();
  audit.record('Prior Cash Current Property', 'current-cash', 'Actual current public cash allowance', currentCash,
    'Current G precedes actual original prior cash; no itemized floor is assigned to this category', { 'Current cash paid': currentCashPaid });
  detail.forEach((row, index) => audit.record('Prior Cash Current Property', `prior-${index + 1}`, 'Actual prior public cash used before current property', row.treatedAsPaid,
    'Original year and category, FIFO, fifth-year expiration; final nonitemization retains treated-paid use without a deduction',
    { 'Contribution year': String(row.taxYear), 'Opening': row.amountAvailable, 'Expired': row.amountExpired, 'Remaining': row.amountRemaining }));
  audit.record('Prior Cash Current Property', 'current-property', 'Actual current property after its entire floor', currentNoncash,
    'Current A after aggregate G, then the full 0.5% floor; reject any floor reaching G',
    { 'Current property value': currentPropertyValue, 'Before floor': currentPropertyBeforeFloor, 'Floor': floorDisallowed });
  audit.record('Prior Cash Current Property', 'itemized-carry', 'Itemized charitable carry candidate', sum(...carryforwards.map(row => row.amount)),
    'Original surviving cash plus current category percentage excess and eligible current-property floor');
  audit.record('Prior Cash Current Property', 'nonitemized-carry', 'Nonitemized charitable carry candidate', sum(...nonitemizedCarryforwards.map(row => row.amount)),
    'Original surviving cash plus current category percentage excess only');
  return { method: '2026_prior_cash_current_property', currentCashPaid, currentPropertyValue, currentPropertyBeforeFloor, floorDisallowed,
    currentCash, currentNoncash, priorDeduction, priorCashDeduction: priorDeduction, priorNoncashDeduction: zero,
    priorTreatedAsPaid: priorDeduction, totalDeduction: sum(currentCash, currentNoncash, priorDeduction), detail,
    carryforwards, nonitemizedCarryforwards, expired: sum(...detail.map(row => row.amountExpired)), lines: audit.getLines() };
}
