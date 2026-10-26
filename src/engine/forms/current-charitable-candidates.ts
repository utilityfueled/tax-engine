/** Exact current-only alternatives. Spec: current-charitable-candidates.yaml. */
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
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';

export interface CurrentCharitableCandidates {
  method: '2026_current_public_cash_dual';
  currentCashPaid: Decimal;
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
  if ([current.noncashPublic, current.capitalGainPublic, current.cashPrivate, current.noncashPrivate, current.capitalGainPrivate].some(value => !value.isZero())) {
    throw new Error('Current dual candidates require only ordinary public cash sources');
  }
  const donations = eligibleCurrentCharitableDonations(input);
  if (donations.some(row => row.type !== 'cash' || row.isPrivateFoundation !== false)
    || !sum(...donations.map(row => d(row.amount))).eq(current.cashPublic)) {
    throw new Error('Current charitable cash must reconcile exactly to actual receipts; other source methods remain separate');
  }
  const itemized = calculateCharitableContributionWorksheet({ taxYear: 2026, contributionBase: context.contributionBase, amounts: current });
  const percentageCapacity = zeroFloor(context.contributionBase).times('0.60');
  const currentExcess = zeroFloor(current.cashPublic.minus(percentageCapacity));
  const nonitemizedCarryforwards: CharitableCarryoverBalance[] = currentExcess.gt(0)
    ? [{ sourceId: 'current-cash_60-cash', taxYear: 2026, category: 'cash_60', medium: 'cash', amount: currentExcess }] : [];
  const audit = new AuditTrail();
  audit.merge(itemized.lines);
  audit.record('Current Charitable Candidates', 'itemized-carry', 'Current itemized charitable carry candidate', sum(...itemized.carryforwards.map(row => row.amount)),
    'Exact current percentage excess plus eligible itemized floor; confirmed empty actual prior history');
  audit.record('Current Charitable Candidates', 'nonitemized-carry', 'Current nonitemized charitable carry candidate', currentExcess,
    'Current percentage excess only; no itemized floor or section 170(p) cap-created carry',
    { 'Current cash': current.cashPublic, 'Percentage capacity': percentageCapacity });
  return { method: '2026_current_public_cash_dual', currentCashPaid: current.cashPublic, itemized, nonitemizedCarryforwards, lines: audit.getLines() };
}
