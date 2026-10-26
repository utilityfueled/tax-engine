/** Exact current-only alternatives. Specs include current-charitable-receipt-categories.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import {
  calculateCharitableContributionWorksheet,
  type CharitableCategory,
  type CharitableContributionWorksheetInput,
  type CharitableContributionWorksheetResult,
} from './charitable-contribution-worksheet.js';
import {
  validateCharitableCarryoverSources,
  type CharitableCarryoverBalance,
} from './charitable-carryover-source-validation.js';
import { allocateCharitablePrivateMedia } from './charitable-private-media.js';
import { calculateCryptoDonations } from './crypto-lot-matching.js';
import { calculateForm172CharitableSources } from './form-172-charitable-sources.js';
import { readCurrentCharitableReceiptAmounts } from '@/utils/charitable-current-receipts.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';

export interface CurrentCharitableCandidates {
  method: '2026_current_public_cash_dual' | '2026_current_public_cash_and_property_dual' | '2026_current_public_and_other_cash_dual' | '2026_current_ordinary_receipts_dual';
  currentCashPaid: Decimal;
  currentPropertyValue: Decimal;
  currentOtherCashPaid?: Decimal;
  currentReceiptAmounts: CharitableContributionWorksheetInput['amounts'];
  itemized: CharitableContributionWorksheetResult;
  nonitemizedCarryforwards: CharitableCarryoverBalance[];
  lines: CalculatedLine[];
}

/** Both results are calculated internally; no caller-supplied deduction or carry. */
export function calculateCurrentCharitableCandidates(input: TaxYearInput, context: {
  contributionBase: Decimal;
  current: CharitableContributionWorksheetInput['amounts'];
  /** Internal original-source proof, never a TaxYearInput deduction override. */
  originSourceDigest?: string;
}): CurrentCharitableCandidates {
  if (input.taxpayer.taxYear !== 2026) throw new Error('Current charitable candidates require actual 2026 sources');
  const records = validateCharitableCarryoverSources(input);
  if (records.length !== 0 || input.charitableCarryoverSources?.vintages?.length !== 0) {
    throw new Error('Current charitable candidates require an actual empty prior history; prior floor attribution remains separate');
  }
  const origin = context.originSourceDigest === undefined ? undefined : calculateForm172CharitableSources(input);
  const currentOrigin = input.form172?.sourceTaxYear === input.taxpayer.taxYear && input.form172.sourceFactsConfirmed === true
    && input.form172.allCurrentYearSourcesIncluded === true && origin?.sourceKind === 'current'
    && origin.sourceDigest === context.originSourceDigest && input.netOperatingLoss?.vintages?.length === 0
    && input.netOperatingLoss.alternativeTax?.vintages?.length === 0 && !input.form982NolSources && d(input.priorYear?.nolCarryforward).isZero();
  if ((context.originSourceDigest !== undefined && !currentOrigin)
    || (!currentOrigin && (input.netOperatingLoss || input.form172 || input.form982NolSources || !d(input.priorYear?.nolCarryforward).isZero()))) {
    throw new Error('Current charitable candidates with NOL sources require the separate loss method');
  }
  const current = context.current;
  if (!Decimal.isDecimal(context.contributionBase) || !context.contributionBase.isFinite()
    || Object.values(current).some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error('Current charitable amounts must be finite with nonnegative contributions');
  }
  const actual = readCurrentCharitableReceiptAmounts(input, { capitalStockOnly: true, includeK1: true });
  if (input.cryptoIncome?.donations.length) {
    const crypto = calculateCryptoDonations(input.cryptoIncome.donations, input.taxpayer.taxYear);
    if (!crypto.sourceFactsVerified) throw new Error('Current charitable candidates require verified original crypto donation sources');
    for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
      actual[key] = actual[key].plus(crypto.contributionAmounts[key]);
    }
  }
  if (Object.entries(actual).some(([key, value]) => !value.eq(current[key as keyof typeof current]))) {
    throw new Error('Current charitable category amounts must reconcile exactly to actual receipts; other source methods remain separate');
  }
  const { cashPublic: cash, noncashPublic: property, cashPrivate: otherCash } = actual;
  const itemized = calculateCharitableContributionWorksheet({ taxYear: 2026, contributionBase: context.contributionBase, amounts: current });
  const percentageCapacity = zeroFloor(context.contributionBase).times('0.60');
  const offered: Record<CharitableCategory, Decimal> = { cash_60: cash, noncash_50: property,
    capital_gain_30: actual.capitalGainPublic, other_30: otherCash.plus(actual.noncashPrivate), capital_gain_20: actual.capitalGainPrivate };
  const nonitemizedCarryforwards = (Object.keys(offered) as CharitableCategory[]).flatMap<CharitableCarryoverBalance>(category => {
    const excess = offered[category].minus(itemized.allowedBeforeFloor[category]);
    if (category === 'other_30') {
      const carry = allocateCharitablePrivateMedia(otherCash, actual.noncashPrivate, excess);
      return (['cash', 'noncash'] as const).flatMap(medium => carry[medium].gt(0)
        ? [{ sourceId: `current-${category}-${medium}`, taxYear: 2026, category, medium, amount: carry[medium] }] : []);
    }
    const medium = category === 'cash_60' ? 'cash' : 'noncash';
    return excess.gt(0) ? [{ sourceId: `current-${category}-${medium}`, taxYear: 2026, category, medium, amount: excess }] : [];
  });
  itemized.carryforwards = itemized.carryforwards.map(row => ({ ...row,
    medium: row.medium ?? (row.category === 'cash_60' ? 'cash' : 'noncash') }));
  const audit = new AuditTrail();
  audit.merge(itemized.lines);
  audit.record('Current Charitable Candidates', 'itemized-carry', 'Current itemized charitable carry candidate', sum(...itemized.carryforwards.map(row => row.amount)),
    'Exact current percentage excess plus eligible itemized floor; confirmed empty actual prior history');
  audit.record('Current Charitable Candidates', 'nonitemized-carry', 'Current nonitemized charitable carry candidate', sum(...nonitemizedCarryforwards.map(row => row.amount)),
    'Current percentage excess only; no itemized floor or section 170(p) cap-created carry',
    { 'Current cash': cash, 'Current ordinary property value': property, 'Cash percentage ceiling': percentageCapacity,
      'Allowed cash before floor': itemized.allowedBeforeFloor.cash_60, 'Allowed property before floor': itemized.allowedBeforeFloor.noncash_50,
      'Current other-recipient cash': otherCash, 'Current other-recipient ordinary property': actual.noncashPrivate,
      'Current public capital-gain property': actual.capitalGainPublic, 'Current other-recipient capital-gain property': actual.capitalGainPrivate,
      'Allowed other-recipient ordinary gifts before floor': itemized.allowedBeforeFloor.other_30,
      'Allowed public capital-gain property before floor': itemized.allowedBeforeFloor.capital_gain_30,
      'Allowed other-recipient capital-gain property before floor': itemized.allowedBeforeFloor.capital_gain_20 });
  const expandedCategories = actual.capitalGainPublic.gt(0) || actual.noncashPrivate.gt(0) || actual.capitalGainPrivate.gt(0)
    || (property.gt(0) && otherCash.gt(0));
  return { method: expandedCategories ? '2026_current_ordinary_receipts_dual' : otherCash.gt(0) ? '2026_current_public_and_other_cash_dual'
    : property.gt(0) ? '2026_current_public_cash_and_property_dual' : '2026_current_public_cash_dual',
    currentCashPaid: cash, currentPropertyValue: property, ...(otherCash.gt(0) ? { currentOtherCashPaid: otherCash } : {}),
    currentReceiptAmounts: actual, itemized, nonitemizedCarryforwards, lines: audit.getLines() };
}
