/** Exact current-only alternatives. Specs: current-charitable-candidates.yaml and current-charitable-public-property.yaml. */
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
  method: '2026_current_public_cash_dual' | '2026_current_public_cash_and_property_dual';
  currentCashPaid: Decimal;
  currentPropertyValue: Decimal;
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
  if ([current.capitalGainPublic, current.cashPrivate, current.noncashPrivate, current.capitalGainPrivate].some(value => !value.isZero())) {
    throw new Error('Current dual candidates require only ordinary public cash and property sources');
  }
  const donations = eligibleCurrentCharitableDonations(input);
  if (donations.some(row => resolveCharitableRecipient(row).percentageCategory !== 'fifty-percent')) {
    throw new Error('Current charitable candidates require actual public recipient sources');
  }
  const cash = sum(...donations.filter(row => row.type === 'cash').map(row => d(row.amount)));
  const property = sum(...donations.filter(row => row.type !== 'cash').map(row => {
    if (row.isLongTermCapitalGain !== false || row.costBasis === undefined) {
      throw new Error('Current public property requires actual ordinary character and cost basis');
    }
    const basis = d(row.costBasis);
    if (!basis.isFinite() || basis.lt(0)) throw new Error('Current public property basis must be finite and nonnegative');
    return min(d(row.amount), basis);
  }));
  if (!cash.eq(current.cashPublic) || !property.eq(current.noncashPublic)) {
    throw new Error('Current charitable cash and property must reconcile exactly to actual receipts; other source methods remain separate');
  }
  const itemized = calculateCharitableContributionWorksheet({ taxYear: 2026, contributionBase: context.contributionBase, amounts: current });
  const percentageCapacity = zeroFloor(context.contributionBase).times('0.60');
  const cashExcess = cash.minus(itemized.allowedBeforeFloor.cash_60);
  const propertyExcess = property.minus(itemized.allowedBeforeFloor.noncash_50);
  const nonitemizedCarryforwards: CharitableCarryoverBalance[] = [
    ...(cashExcess.gt(0) ? [{ sourceId: 'current-cash_60-cash', taxYear: 2026, category: 'cash_60' as const, medium: 'cash' as const, amount: cashExcess }] : []),
    ...(propertyExcess.gt(0) ? [{ sourceId: 'current-noncash_50-noncash', taxYear: 2026, category: 'noncash_50' as const, medium: 'noncash' as const, amount: propertyExcess }] : []),
  ];
  if (property.gt(0)) itemized.carryforwards = itemized.carryforwards.map(row => ({ ...row,
    medium: row.category === 'cash_60' ? 'cash' : 'noncash' }));
  const audit = new AuditTrail();
  audit.merge(itemized.lines);
  audit.record('Current Charitable Candidates', 'itemized-carry', 'Current itemized charitable carry candidate', sum(...itemized.carryforwards.map(row => row.amount)),
    'Exact current percentage excess plus eligible itemized floor; confirmed empty actual prior history');
  audit.record('Current Charitable Candidates', 'nonitemized-carry', 'Current nonitemized charitable carry candidate', cashExcess.plus(propertyExcess),
    'Current percentage excess only; no itemized floor or section 170(p) cap-created carry',
    { 'Current cash': cash, 'Current ordinary property value': property, 'Cash percentage ceiling': percentageCapacity,
      'Allowed cash before floor': itemized.allowedBeforeFloor.cash_60, 'Allowed property before floor': itemized.allowedBeforeFloor.noncash_50 });
  return { method: property.gt(0) ? '2026_current_public_cash_and_property_dual' : '2026_current_public_cash_dual',
    currentCashPaid: cash, currentPropertyValue: property, itemized, nonitemizedCarryforwards, lines: audit.getLines() };
}
