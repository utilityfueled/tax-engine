/** Source-bound percentage use before deduction choice. Specs: nonitemized-charitable-categories.yaml, charitable-determined-floor.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableCategory, CharitableContributionWorksheetInput } from './charitable-contribution-worksheet.js';
import type { CharitableCarryoverDetail } from './charitable-carryover.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { validateCharitableCarryoverSources, type CharitableCarryoverBalance } from './charitable-carryover-source-validation.js';
import { allocateCharitablePrivateMedia } from './charitable-private-media.js';
import { calculateCryptoDonations } from './crypto-lot-matching.js';
import { readCurrentCharitableReceiptAmounts } from '@/utils/charitable-current-receipts.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';

export interface CharitableCategoryUseResult {
  contributionBase: Decimal;
  currentCashPaid: Decimal;
  currentReceiptAmounts: CharitableContributionWorksheetInput['amounts'];
  currentWithinPercentageLimit: Record<CharitableCategory, Decimal>;
  priorTreatedAsPaid: Decimal;
  detail: CharitableCarryoverDetail[];
  carryforwards: CharitableCarryoverBalance[];
  expired: Decimal;
  lines: CalculatedLine[];
}

/** Only canonical actual amounts are accepted; no external calculated carry override. */
export function calculateCharitableCategoryUse(input: TaxYearInput, context: {
  contributionBase: Decimal; current: CharitableContributionWorksheetInput['amounts'];
}): CharitableCategoryUseResult {
  if (input.taxpayer.taxYear !== 2026) throw new Error('Charitable category use requires actual 2026 sources');
  if (input.netOperatingLoss || input.form172 || input.form982NolSources || !d(input.priorYear?.nolCarryforward).isZero()) {
    throw new Error('Charitable category use with NOL sources requires its separate loss method');
  }
  if (!Decimal.isDecimal(context.contributionBase) || !context.contributionBase.isFinite()
    || Object.values(context.current).some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error('Nonitemized charitable amounts must be finite with nonnegative contributions');
  }
  if (!input.k1CharitableSources && input.scheduleK1.some(source => [source.charitableCash, source.charitableCapitalGain30, source.charitableCapitalGain20]
    .some(value => !d(value).isZero()))) {
    throw new Error('Nonitemized K-1 charitable sources require their actual attached-statement and basis method');
  }
  const raw = readCurrentCharitableReceiptAmounts(input, { capitalStockOnly: true, includeK1: true });
  if (input.cryptoIncome?.donations.length) {
    const crypto = calculateCryptoDonations(input.cryptoIncome.donations, input.taxpayer.taxYear);
    if (!crypto.sourceFactsVerified) throw new Error('Nonitemized category carry requires verified original crypto sources');
    for (const key of Object.keys(raw) as (keyof typeof raw)[]) raw[key] = raw[key].plus(crypto.contributionAmounts[key]);
  }
  if (Object.entries(raw).some(([key, value]) => !value.eq(context.current[key as keyof typeof raw]))) {
    throw new Error('Nonitemized categories must reconcile exactly to actual receipts; other source methods remain separate');
  }
  const zero = d('0'), taxYear = input.taxpayer.taxYear;
  const records = validateCharitableCarryoverSources(input).map(row => ({ ...row, treatedAsPaid: zero }));
  const base = zeroFloor(context.contributionBase), fifty = base.times('0.50'), thirty = base.times('0.30');
  const consume = (category: CharitableCategory, capacity: Decimal): Decimal => {
    let remaining = zeroFloor(capacity), used = zero;
    const eligible = records.filter(row => row.category === category && row.taxYear + 5 >= taxYear);
    for (const year of new Set(eligible.map(row => row.taxYear))) {
      const group = eligible.filter(row => row.taxYear === year);
      const groupUse = Decimal.min(sum(...group.map(row => row.amount)), remaining);
      const media = allocateCharitablePrivateMedia(sum(...group.filter(row => row.medium === 'cash').map(row => row.amount)),
        sum(...group.filter(row => row.medium === 'noncash').map(row => row.amount)), groupUse);
      for (const row of group) row.treatedAsPaid = media[row.medium];
      remaining = remaining.minus(groupUse); used = used.plus(groupUse);
    }
    return used;
  };

  const g = Decimal.min(raw.cashPublic, base.times('0.60'));
  const priorG = consume('cash_60', base.times('0.60').minus(g)), allG = g.plus(priorG);
  const a = Decimal.min(raw.noncashPublic, zeroFloor(fifty.minus(allG)));
  const currentCReservation = Decimal.min(raw.capitalGainPublic, thirty);
  const priorA = consume('noncash_50', fifty.minus(allG).minus(a).minus(currentCReservation)), allA = a.plus(priorA);
  const priorC = consume('capital_gain_30', Decimal.min(thirty.minus(currentCReservation),
    fifty.minus(allG).minus(allA).minus(currentCReservation)));
  // B uses A without C's30% restriction, with the actual amended G offset.
  const currentCWithoutSpecialCap = Decimal.min(raw.capitalGainPublic, zeroFloor(fifty.minus(allG).minus(allA)));
  const cashOffset = Decimal.min(allG, base.times('0.10'));
  const bCapacity = Decimal.min(thirty, zeroFloor(fifty.minus(allG).minus(allA)
    .minus(currentCWithoutSpecialCap).minus(priorC).plus(cashOffset)));
  const b = Decimal.min(raw.cashPrivate.plus(raw.noncashPrivate), bCapacity);
  const priorB = consume('other_30', bCapacity.minus(b)), allB = b.plus(priorB);
  const finalCCapacity = Decimal.min(thirty, zeroFloor(fifty.minus(allG).minus(allA).minus(allB)));
  const reservedCurrentC = Decimal.min(raw.capitalGainPublic, zeroFloor(thirty.minus(priorC)),
    zeroFloor(fifty.minus(allG).minus(allA).minus(priorC)));
  if (priorC.gt(0) && priorC.plus(reservedCurrentC).gt(finalCCapacity)) {
    throw new Error('Prior capital carry and the amended B offset require their separate treated-paid attribution method');
  }
  const c = Decimal.min(raw.capitalGainPublic, zeroFloor(finalCCapacity.minus(priorC))), allC = c.plus(priorC);
  const remainingOtherCapacity = zeroFloor(bCapacity.minus(allB));
  const dCapacity = Decimal.min(remainingOtherCapacity, base.times('0.20'), zeroFloor(thirty.minus(allC)), zeroFloor(thirty.minus(allB)),
    zeroFloor(fifty.minus(allG).minus(allA).minus(allB).minus(allC).plus(cashOffset)));
  const capitalOther = Decimal.min(raw.capitalGainPrivate, dCapacity);
  consume('capital_gain_20', dCapacity.minus(capitalOther));
  const privateMedia = allocateCharitablePrivateMedia(raw.cashPrivate, raw.noncashPrivate, b);
  const currentWithinPercentageLimit = { cash_60:g, noncash_50:a, capital_gain_30:c, other_30:b, capital_gain_20:capitalOther };
  const detail = records.map(row => {
    const remainder = row.amount.minus(row.treatedAsPaid), expires = row.taxYear + 5 <= taxYear;
    return { sourceId:row.sourceId, taxYear:row.taxYear, category:row.category, medium:row.medium,
      amountAvailable:row.amount, treatedAsPaid:row.treatedAsPaid, amountUsed:zero,
      amountExpired:expires ? remainder : zero, amountRemaining:expires ? zero : remainder };
  });
  const carryforwards: CharitableCarryoverBalance[] = detail.filter(row => row.amountRemaining.gt(0)).map(row => ({
    sourceId:row.sourceId, taxYear:row.taxYear, category:row.category, medium:row.medium, amount:row.amountRemaining,
  }));
  const newAmounts: [CharitableCategory, 'cash' | 'noncash', Decimal][] = [
    ['cash_60','cash',raw.cashPublic.minus(g)], ['noncash_50','noncash',raw.noncashPublic.minus(a)],
    ['capital_gain_30','noncash',raw.capitalGainPublic.minus(c)], ['other_30','cash',raw.cashPrivate.minus(privateMedia.cash)],
    ['other_30','noncash',raw.noncashPrivate.minus(privateMedia.noncash)], ['capital_gain_20','noncash',raw.capitalGainPrivate.minus(capitalOther)],
  ];
  for (const [category,medium,value] of newAmounts) if (value.gt(0)) carryforwards.push({
    sourceId:`current-${category}-${medium}`, taxYear, category, medium, amount:value,
  });
  const audit = new AuditTrail();
  audit.record('Charitable Category Use','base','Actual nonnegative contribution base',base,
    'Percentage limits retain exact source values before the actual floor and deduction choice');
  audit.record('Charitable Category Use','other-capacity','Shared current and prior other-gift capacity',bCapacity,
    'Amended B ceiling: A without C special limit plus aggregate G, reduced by min(G,10% base)',
    { 'Current C before special cap':currentCWithoutSpecialCap, 'Prior C treated as paid':priorC, 'G offset':cashOffset, 'Prior B treated as paid':priorB });
  const offered: Record<CharitableCategory,Decimal> = { cash_60:raw.cashPublic, noncash_50:raw.noncashPublic,
    capital_gain_30:raw.capitalGainPublic, other_30:raw.cashPrivate.plus(raw.noncashPrivate), capital_gain_20:raw.capitalGainPrivate };
  for (const category of Object.keys(offered) as CharitableCategory[]) audit.record('Charitable Category Use',category,
    'Current contribution within the percentage limit',currentWithinPercentageLimit[category],
    'Current-source allowance separate from actual prior use and the section170(p) deduction',
    { 'Actual current amount':offered[category], 'Current percentage excess':offered[category].minus(currentWithinPercentageLimit[category]),
      ...(category === 'capital_gain_20' ? { 'Shared other ceiling':bCapacity, 'Current and prior B allowed first':allB, 'Remaining other ceiling':remainingOtherCapacity } : {}) });
  detail.forEach((row,index) => audit.record('Charitable Category Use',`prior-${index+1}`,'Actual prior source treated as paid',row.treatedAsPaid,
    'Current-before-prior and oldest eligible original vintage; treated-paid use before deduction choice',
    { 'Contribution year':String(row.taxYear), 'Category':row.category, 'Medium':row.medium, 'Opening':row.amountAvailable,
      'Expired':row.amountExpired, 'Remaining':row.amountRemaining }));
  const priorTreatedAsPaid = sum(...detail.map(row => row.treatedAsPaid)), expired = sum(...detail.map(row => row.amountExpired));
  audit.record('Charitable Category Use','remaining','Actual succeeding-year charitable carry',sum(...carryforwards.map(row => row.amount)),
    'Surviving original balances plus exact current percentage excess, preserving category and medium');
  return { contributionBase:base,
    currentCashPaid:raw.cashPublic, currentReceiptAmounts:raw, currentWithinPercentageLimit,
    priorTreatedAsPaid, detail, carryforwards, expired, lines:audit.getLines() };
}
