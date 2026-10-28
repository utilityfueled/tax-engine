/** Determined current-origin floor with original prior use. Spec: charitable-determined-floor.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableCategory, CharitableContributionWorksheetInput } from './charitable-contribution-worksheet.js';
import type { CharitableCarryoverResult } from './charitable-carryover.js';
import type { CharitableCarryoverBalance } from './charitable-carryover-source-validation.js';
import { calculateCharitableCategoryUse, type CharitableCategoryUseResult } from './charitable-category-use.js';
import { calculateK1CharitableReturnSources } from './k1-charitable-return-sources.js';
import { assertPriorPropertyAllowableCarryProof } from '@/utils/k1-nonitemized-prior-property.js';
import { allocateCharitablePrivateMedia } from './charitable-private-media.js';
import { charitableSourceDigest } from '@/utils/charitable-source-digest.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';
import type { CharitableNolOriginLimit } from '@/utils/charitable-nol-origins.js';

export interface CharitableDeterminedFloorResult extends CharitableCarryoverResult, CharitableCategoryUseResult {
  method: '2026_determined_current_category_floor';
  sourceDigest: string;
  currentBeforeFloor: Record<CharitableCategory, Decimal>;
  currentFloorByCategory: Record<CharitableCategory, Decimal>;
  floorDisallowed: Decimal;
  nonitemizedCarryforwards: CharitableCarryoverBalance[];
}

/** Both candidates are internal source-derived results, never an input election about floor attribution. */
export function calculateCharitableDeterminedFloor(input: TaxYearInput, context: {
  contributionBase: Decimal; current: CharitableContributionWorksheetInput['amounts'];
  nolOriginLimit?: CharitableNolOriginLimit;
}): CharitableDeterminedFloorResult {
  const use = calculateCharitableCategoryUse(input, context);
  const zero = d('0'), currentBeforeFloor = use.currentWithinPercentageLimit;
  const currentAfterFloor = { ...currentBeforeFloor };
  const currentFloorByCategory = { cash_60:zero, noncash_50:zero, other_30:zero, capital_gain_30:zero, capital_gain_20:zero };
  let remainingFloor = use.contributionBase.times('0.005');
  const audit = new AuditTrail(); audit.merge(use.lines);
  for (const category of ['capital_gain_20','capital_gain_30','other_30','noncash_50','cash_60'] as const) {
    const prior = sum(...use.detail.filter(row => row.category === category).map(row => row.treatedAsPaid));
    const hit = Decimal.min(remainingFloor, currentBeforeFloor[category].plus(prior));
    if (hit.gt(0) && prior.gt(0)) {
      throw new Error('Charitable floor reaching an allowed prior contribution requires its separate original-vintage attribution method');
    }
    currentFloorByCategory[category] = hit;
    currentAfterFloor[category] = currentBeforeFloor[category].minus(hit);
    remainingFloor = remainingFloor.minus(hit);
    audit.record('Charitable Determined Floor',category,'Current contribution after determined category floor',currentAfterFloor[category],
      'D,C,B,A,G floor order; every positive hit has zero allowed prior contribution in that category',
      { 'Current before floor':currentBeforeFloor[category], 'Prior before floor':prior, 'Current floor disallowed':hit });
  }
  const raw = use.currentReceiptAmounts;
  const privateAllowed = allocateCharitablePrivateMedia(raw.cashPrivate, raw.noncashPrivate, currentAfterFloor.other_30);
  const currentCash = currentAfterFloor.cash_60.plus(privateAllowed.cash);
  const currentNoncash = sum(currentAfterFloor.noncash_50,currentAfterFloor.capital_gain_30,currentAfterFloor.capital_gain_20,privateAllowed.noncash);
  const detail = use.detail.map(row => ({ ...row, amountUsed:row.treatedAsPaid }));
  const priorCashDeduction = sum(...detail.filter(row => row.medium === 'cash').map(row => row.amountUsed));
  const priorNoncashDeduction = sum(...detail.filter(row => row.medium === 'noncash').map(row => row.amountUsed));
  const priorDeduction = priorCashDeduction.plus(priorNoncashDeduction);
  const percentageCarryforwards = use.carryforwards.map(row => ({ ...row }));
  const hasCurrentPercentageExcess = percentageCarryforwards.some(row => row.taxYear === input.taxpayer.taxYear && row.amount.gt(0));
  const carryforwards = percentageCarryforwards.map(row => ({ ...row }));
  const percentageExcessByCategory = Object.fromEntries((Object.keys(currentFloorByCategory) as CharitableCategory[])
    .map(category => [category, sum(...percentageCarryforwards.filter(row => row.taxYear === input.taxpayer.taxYear && row.category === category).map(row => row.amount))])) as Record<CharitableCategory, Decimal>;
  assertPriorPropertyAllowableCarryProof(calculateK1CharitableReturnSources(input), {
    hasCurrentPercentageExcess, percentageExcessByCategory, floorByCategory: currentFloorByCategory,
  });
  if (hasCurrentPercentageExcess) for (const category of Object.keys(currentFloorByCategory) as CharitableCategory[]) {
    const floor = currentFloorByCategory[category];
    if (floor.isZero()) continue;
    const currentRows = carryforwards.filter(row => row.taxYear === input.taxpayer.taxYear && row.category === category);
    const amount = sum(...currentRows.map(row => row.amount)).plus(floor);
    const media = category === 'other_30' ? allocateCharitablePrivateMedia(raw.cashPrivate, raw.noncashPrivate, amount)
      : category === 'cash_60' ? { cash:amount, noncash:zero } : { cash:zero, noncash:amount };
    for (const medium of ['cash','noncash'] as const) {
      const existing = currentRows.find(row => row.medium === medium);
      if (existing) existing.amount = media[medium];
      else if (media[medium].gt(0)) carryforwards.push({ sourceId:`current-${category}-${medium}`,
        taxYear:input.taxpayer.taxYear, category, medium, amount:media[medium] });
    }
  }
  const nonitemizedCarryforwards = carryforwards.map(row => ({ ...row }));
  const floorDisallowed = sum(...Object.values(currentFloorByCategory));
  audit.record('Charitable Determined Floor','itemized-carry','Itemized charitable carry candidate',sum(...carryforwards.map(row => row.amount)),
    'Original surviving balances plus current percentage excess and eligible determined current-year floor');
  audit.record('Charitable Determined Floor','nonitemized-carry','Nonitemized charitable carry candidate',sum(...nonitemizedCarryforwards.map(row => row.amount)),
    'Same otherwise-allowable original balances, current percentage excess and eligible current floor; no standard entitlement is inferred');
  return { ...use, method:'2026_determined_current_category_floor', sourceDigest:charitableSourceDigest(input),
    currentBeforeFloor, currentFloorByCategory, floorDisallowed, currentCash, currentNoncash,
    priorDeduction, priorCashDeduction, priorNoncashDeduction, priorTreatedAsPaid:use.priorTreatedAsPaid,
    totalDeduction:sum(currentCash,currentNoncash,priorDeduction), detail, carryforwards, nonitemizedCarryforwards,
    expired:use.expired, lines:audit.getLines() };
}
