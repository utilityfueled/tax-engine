/** Exact current-only alternatives. Specs: current-charitable-candidates.yaml, current-charitable-public-property.yaml and current-public-other-cash.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import {
  calculateCharitableContributionWorksheet,
  type CharitableContributionWorksheetInput,
  type CharitableContributionWorksheetResult,
} from './charitable-contribution-worksheet.js';
import {
  validateCharitableCarryoverSources,
  type CharitableCarryoverBalance,
} from './charitable-carryover-source-validation.js';
import { eligibleCurrentCharitableDonations } from './charitable-current-sources.js';
import { resolveCharitableRecipient } from '@/utils/charitable-recipient.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, min, sum, zeroFloor } from '@/utils/decimal.js';

export interface CurrentCharitableCandidates {
  method: '2026_current_public_cash_dual' | '2026_current_public_cash_and_property_dual' | '2026_current_public_and_other_cash_dual';
  currentCashPaid: Decimal;
  currentPropertyValue: Decimal;
  currentOtherCashPaid?: Decimal;
  itemized: CharitableContributionWorksheetResult;
  nonitemizedCarryforwards: CharitableCarryoverBalance[];
  lines: CalculatedLine[];
}

/** Both results are calculated internally; no caller-supplied deduction or carry. */
export function calculateCurrentCharitableCandidates(input: TaxYearInput, context: {
  contributionBase: Decimal;
  current: CharitableContributionWorksheetInput['amounts'];
}): CurrentCharitableCandidates {
  if (input.taxpayer.taxYear !== 2026) throw new Error('Current charitable candidates require actual 2026 sources');
  const records = validateCharitableCarryoverSources(input);
  if (records.length !== 0 || input.charitableCarryoverSources?.vintages?.length !== 0) {
    throw new Error('Current charitable candidates require an actual empty prior history; prior floor attribution remains separate');
  }
  if (input.netOperatingLoss || input.form172 || input.form982NolSources || !d(input.priorYear?.nolCarryforward).isZero()) {
    throw new Error('Current charitable candidates with NOL sources require the separate loss method');
  }
  const current = context.current;
  if (!Decimal.isDecimal(context.contributionBase) || !context.contributionBase.isFinite()
    || Object.values(current).some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error('Current charitable amounts must be finite with nonnegative contributions');
  }
  if ([current.capitalGainPublic, current.noncashPrivate, current.capitalGainPrivate].some(value => !value.isZero())
    || (current.noncashPublic.gt(0) && current.cashPrivate.gt(0))) {
    throw new Error('Current dual candidates require public cash with either ordinary public property or other-recipient cash; additional categories remain separate');
  }
  const donations = eligibleCurrentCharitableDonations(input);
  if (donations.some(row => row.type !== 'cash' && resolveCharitableRecipient(row).percentageCategory !== 'fifty-percent')) {
    throw new Error('Current noncash charitable candidates require actual public recipient sources');
  }
  const cash = sum(...donations.filter(row => row.type === 'cash'
    && resolveCharitableRecipient(row).percentageCategory === 'fifty-percent').map(row => d(row.amount)));
  const otherCash = sum(...donations.filter(row => row.type === 'cash'
    && resolveCharitableRecipient(row).percentageCategory === 'other-thirty-percent').map(row => d(row.amount)));
  if (otherCash.gt(0) && donations.some(row => row.type !== 'cash')) {
    throw new Error('Current other-recipient cash with property requires its separate category method');
  }
  const property = sum(...donations.filter(row => row.type !== 'cash').map(row => {
    if (row.isLongTermCapitalGain !== false || row.costBasis === undefined) {
      throw new Error('Current public property requires actual ordinary character and cost basis');
    }
    const basis = d(row.costBasis);
    if (!basis.isFinite() || basis.lt(0)) throw new Error('Current public property basis must be finite and nonnegative');
    return min(d(row.amount), basis);
  }));
  if (!cash.eq(current.cashPublic) || !property.eq(current.noncashPublic) || !otherCash.eq(current.cashPrivate)) {
    throw new Error('Current charitable cash and property must reconcile exactly to actual receipts; other source methods remain separate');
  }
  const itemized = calculateCharitableContributionWorksheet({ taxYear: 2026, contributionBase: context.contributionBase, amounts: current });
  const percentageCapacity = zeroFloor(context.contributionBase).times('0.60');
  const cashExcess = cash.minus(itemized.allowedBeforeFloor.cash_60);
  const propertyExcess = property.minus(itemized.allowedBeforeFloor.noncash_50);
  const otherCashExcess = otherCash.minus(itemized.allowedBeforeFloor.other_30);
  const nonitemizedCarryforwards: CharitableCarryoverBalance[] = [
    ...(cashExcess.gt(0) ? [{ sourceId: 'current-cash_60-cash', taxYear: 2026, category: 'cash_60' as const, medium: 'cash' as const, amount: cashExcess }] : []),
    ...(propertyExcess.gt(0) ? [{ sourceId: 'current-noncash_50-noncash', taxYear: 2026, category: 'noncash_50' as const, medium: 'noncash' as const, amount: propertyExcess }] : []),
    ...(otherCashExcess.gt(0) ? [{ sourceId: 'current-other_30-cash', taxYear: 2026, category: 'other_30' as const, medium: 'cash' as const, amount: otherCashExcess }] : []),
  ];
  if (property.gt(0) || otherCash.gt(0)) itemized.carryforwards = itemized.carryforwards.map(row => ({ ...row,
    medium: row.category === 'noncash_50' ? 'noncash' : 'cash' }));
  const audit = new AuditTrail();
  audit.merge(itemized.lines);
  audit.record('Current Charitable Candidates', 'itemized-carry', 'Current itemized charitable carry candidate', sum(...itemized.carryforwards.map(row => row.amount)),
    'Exact current percentage excess plus eligible itemized floor; confirmed empty actual prior history');
  audit.record('Current Charitable Candidates', 'nonitemized-carry', 'Current nonitemized charitable carry candidate', sum(cashExcess, propertyExcess, otherCashExcess),
    'Current percentage excess only; no itemized floor or section 170(p) cap-created carry',
    { 'Current cash': cash, 'Current ordinary property value': property, 'Cash percentage ceiling': percentageCapacity,
      'Allowed cash before floor': itemized.allowedBeforeFloor.cash_60, 'Allowed property before floor': itemized.allowedBeforeFloor.noncash_50,
      'Current other-recipient cash': otherCash, 'Allowed other-recipient cash before floor': itemized.allowedBeforeFloor.other_30 });
  return { method: otherCash.gt(0) ? '2026_current_public_and_other_cash_dual'
    : property.gt(0) ? '2026_current_public_cash_and_property_dual' : '2026_current_public_cash_dual',
    currentCashPaid: cash, currentPropertyValue: property, ...(otherCash.gt(0) ? { currentOtherCashPaid: otherCash } : {}),
    itemized, nonitemizedCarryforwards, lines: audit.getLines() };
}
