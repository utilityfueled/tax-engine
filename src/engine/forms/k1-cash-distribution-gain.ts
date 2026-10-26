/** Original investment-only cash distributions; spec/federal/k1-cash-distribution-gain.yaml. */
import Decimal from 'decimal.js';
import type { ScheduleK1 } from '@/models/inputs.js';
import type { K1CharitableBasisSources } from '@/models/k1-charitable-basis-sources.js';
import type { K1CashDistributionSources } from '@/models/k1-cash-distribution-sources.js';
import type { PartnerBasisScheduleResult } from './partner-basis-schedule.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { d } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
export interface K1CashDistributionGain {
  cash: Decimal; basisBeforeDistribution: Decimal; recoveredBasis: Decimal; gain: Decimal;
  acquisitionDate: string; distributionDate: string; holdingPeriod: 'short' | 'long';
  proceeds: Decimal; reportedBasis: Decimal; lines: CalculatedLine[];
}
function date(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new Error(`K1 cash distribution requires an actual ${label}`);
  return value;
}
function confirmed(value: boolean | undefined, label: string): void {
  if (value !== true) throw new Error(`K1 cash distribution requires confirmed ${label}; unknown or other treatment needs its source method`);
}
/** Called only after the actual original K1/basis/owner packet has reconciled.
 * The basis argument is an internal calculation, never a taxpayer override. */
export function calculateK1CashDistributionGain(k1: ScheduleK1, basis: PartnerBasisScheduleResult,
  original: K1CharitableBasisSources, source?: K1CashDistributionSources): K1CashDistributionGain | undefined {
  if (!source) {
    if (basis.excessDistributionGain.gt(0)) throw new Error('K1 charitable excess distribution gain requires original holding-period and distribution-treatment sources');
    return undefined;
  }
  const year = original.sourceTaxYear;
  if (![2025, 2026].includes(year ?? 0) || source.sourceTaxYear !== year || source.sourceFactsConfirmed !== true || !source.sourceReference?.trim())
    throw new Error('K1 cash distribution requires confirmed actual return-year source evidence');
  if (original.statementYearStart !== `${year}-01-01` || original.statementYearEnd !== `${year}-12-31`)
    throw new Error('K1 cash distribution fiscal basis requires its separate timing method');
  if (typeof source.cashAmount !== 'string' || !/^\d+(\.\d+)?$/.test(source.cashAmount) || !d(source.cashAmount).isFinite()
    || !d(source.cashAmount).eq(k1.distributions) || !basis.totalDistributions.eq(source.cashAmount))
    throw new Error('K1 cash distribution amount must match the actual original K1 and computed basis sources');
  const scorp = k1.entityType === 's_corporation';
  if (source.originalBox !== (scorp ? '16' : '19') || source.originalCode !== (scorp ? 'D' : 'A'))
    throw new Error('K1 cash distribution original box and code must reconcile');
  for (const key of ['singleUnchangedBlockConfirmed', 'allAnnualDistributionsIncludedConfirmed', 'cashOnlyConfirmed',
    'nonliquidatingConfirmed', 'noOtherReportingConfirmed', 'noSpecialHoldingOrGainElectionConfirmed', 'usIndividualTaxTreatmentConfirmed'] as const)
    confirmed(source[key], key);
  if (source.acquisitionMethod !== 'cash_purchase' && source.acquisitionMethod !== 'original_cash_contribution')
    throw new Error('K1 cash distribution requires the actual cash acquisition method; tacked or special holding methods are separate');
  const acquisitionDate = date(source.acquisitionDate, 'acquisition date'), distributionDate = date(source.distributionDate, 'distribution date');
  if (acquisitionDate >= `${year}-01-01` || distributionDate < `${year}-01-01` || distributionDate > `${year}-12-31`)
    throw new Error('K1 cash distribution requires its unchanged pre-year holding and actual current-year distribution date');
  if (scorp) {
    for (const key of ['uniformPerShareBasisConfirmed', 'noAccumulatedEarningsAndProfitsConfirmed', 'noRedemptionOrDebtRepaymentConfirmed'] as const)
      confirmed(source[key], key);
  } else {
    if (distributionDate !== `${year}-12-31`) throw new Error('K1 cash distribution interim partnership basis requires its original dated basis method');
    for (const key of ['allIncomePrecedesDistributionConfirmed', 'noHotAssetExchangeConfirmed', 'noDisguisedSaleOrDebtPaymentConfirmed',
      'noRetirementOrSuccessorPaymentConfirmed', 'noMarketableSecuritiesOrLiabilityMoneyConfirmed', 'notApplicablePartnershipInterestConfirmed'] as const)
      confirmed(source[key], key);
  }
  // Capital character alone does not prove the 469/1411 underlying activity.
  if (source.activityCharacter !== 'portfolio_investments_only' || k1.isPassiveActivity !== false)
    throw new Error('K1 cash distribution business or passive allocation requires its separate original activity method');
  confirmed(source.sameSingleAtRiskActivityConfirmed, 'same single at-risk activity');
  if (!source.atRiskSourceReference?.trim() || !source.atRiskGainItemSourceReference?.trim())
    throw new Error('K1 cash distribution requires the actual at-risk activity and gain item statement references');
  for (const key of ['ordinaryIncome', 'netRentalIncome', 'otherNetRentalIncome', 'guaranteedPayments', 'royalties', 'otherIncome',
    'section1231Gain', 'section179Deduction', 'section199AQBI', 'selfEmploymentEarnings', 'selfEmploymentNetEarningsAfterAdjustments'] as const)
    if (!d(k1[key]).isFinite() || !d(k1[key]).isZero()) throw new Error('K1 cash distribution portfolio character conflicts with an actual operating or self-employment source');
  if (k1.beginningBasis === undefined || !basis.beginningBasis.eq(k1.beginningBasis) || !basis.basisBeforeDecreases.eq(basis.beginningBasis.plus(basis.totalIncomeItems)))
    throw new Error('K1 cash distribution requires the original completed basis calculation');
  const cash = d(source.cashAmount), basisBeforeDistribution = basis.basisBeforeDecreases;
  const recoveredBasis = Decimal.min(cash, basisBeforeDistribution), gain = cash.minus(recoveredBasis);
  if (!gain.eq(basis.excessDistributionGain) || !basis.basisAfterDistributions.eq(Decimal.max(0, basisBeforeDistribution.minus(cash))))
    throw new Error('K1 cash distribution and retained basis result do not reconcile');
  // A calendar anniversary, not elapsed365 days; Feb29 remains within the
  // first year through Feb28 of the next nonleap year, becoming long on Mar1.
  const anniversary = `${Number(acquisitionDate.slice(0, 4)) + 1}${acquisitionDate.slice(4)}`;
  const holdingPeriod = distributionDate > anniversary ? 'long' : 'short';
  const proceeds = scorp ? gain : cash, reportedBasis = scorp ? d(0) : recoveredBasis;
  const audit = new AuditTrail();
  audit.record('K1 Cash Distribution', 'gain', 'Original cash distribution above outside or stock basis', gain,
    'max(0,actual cash-basis before distribution); no debt basis or owner gain added to entity income',
    { 'Actual cash': cash, 'Basis before distribution': basisBeforeDistribution, 'Basis recovered': recoveredBasis,
      'Acquisition date': acquisitionDate, 'Distribution date': distributionDate, 'Holding period': holdingPeriod,
      'Form8949 proceeds': proceeds, 'Form8949 basis': reportedBasis });
  return { cash, basisBeforeDistribution, recoveredBasis, gain, acquisitionDate, distributionDate, holdingPeriod, proceeds, reportedBasis, lines: audit.getLines() };
}
