/** Actual charitable sources for Form172; spec/federal/form-172-charitable-closure.yaml. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { eligibleCurrentCharitableDonations } from './charitable-current-sources.js';
import { validateCharitableCarryoverSources } from './charitable-carryover-source-validation.js';
import { readCurrentCharitableReceiptAmounts } from '@/utils/charitable-current-receipts.js';
import { charitableSourceDigest } from '@/utils/charitable-source-digest.js';
import { hasPriorCharitableNolSources, readPriorCharitableNolSources } from '@/utils/charitable-prior-nol-source.js';
import { calculateK1CharitableReturnSources } from './k1-charitable-return-sources.js';
import { calculateCryptoDonations } from './crypto-lot-matching.js';
import { calculateForm172K1Sources } from './form-172-operating-k1.js';
import { d, sum } from '@/utils/decimal.js';
import { readCharitableNolOrigins, usesCurrentOriginCharitableHistories } from '@/utils/charitable-nol-origins.js';

export interface Form172CharitableSourcesResult {
  sourceKind: 'current' | 'prior' | 'complete_histories';
  qualifiedValue: Decimal;
  alternativeQualifiedValue: Decimal;
  sourceDigest: string;
}

/** No AGI, allowance or loss is collected here. Complete current/prior charity
 * histories retain the old-carry comparison separately from the new current
 * origin. Existing source and unresolved allocation guards still apply. */
export function calculateForm172CharitableSources(input: TaxYearInput): Form172CharitableSourcesResult | undefined {
  const hasCurrent = input.donations.length > 0 || input.k1CharitableSources !== undefined
    || (input.cryptoIncome?.donations.length ?? 0) > 0;
  const complete = usesCurrentOriginCharitableHistories(input) ? readCharitableNolOrigins(input) : undefined;
  const completeResult = complete ? { sourceKind: 'complete_histories' as const,
    qualifiedValue: sum(...Object.values(complete.current), ...complete.regular.map(row => row.amount)),
    alternativeQualifiedValue: sum(...Object.values(complete.current), ...complete.alternative.map(row => row.amount)),
    sourceDigest: complete.sourceDigest } : undefined;
  const operatingK1 = calculateForm172K1Sources(input);
  if (!hasCurrent) {
    if (completeResult && ((input.scheduleK1.length && !operatingK1) || input.cryptoIncome)) {
      throw new Error('Form172 complete prior charity histories require separate original classification for other K1 or crypto sources');
    }
    if (completeResult) return completeResult;
    if (!hasPriorCharitableNolSources(input)) return undefined;
    const prior = readPriorCharitableNolSources(input);
    return { sourceKind: 'prior', qualifiedValue: sum(...prior.regular.map(row => row.amount)),
      alternativeQualifiedValue: sum(...prior.alternative.map(row => row.amount)), sourceDigest: prior.sourceDigest };
  }
  for (const gift of eligibleCurrentCharitableDonations(input)) {
    if (!gift.organization.trim()) throw new Error('Form172 charitable source requires the actual qualified recipient');
  }
  const amounts = readCurrentCharitableReceiptAmounts(input, { capitalStockOnly: true });
  if (input.scheduleK1.length) {
    const k1 = calculateK1CharitableReturnSources(input);
    if (!operatingK1 && (!k1 || k1.statements.length !== input.scheduleK1.length)) {
      throw new Error('Form172 charity-only K1 requires every actual original statement and attached source packet');
    }
    const otherAmounts = ['ordinaryIncome', 'netRentalIncome', 'otherNetRentalIncome', 'guaranteedPayments', 'interestIncome',
      'ordinaryDividends', 'qualifiedDividends', 'royalties', 'netShortTermCapitalGain', 'netLongTermCapitalGain',
      'unrecapturedSection1250Gain', 'collectiblesGain', 'section1231Gain', 'otherIncome', 'section179Deduction', 'otherDeductions',
      'investmentInterestExpense', 'excessBusinessInterest', 'selfEmploymentEarnings', 'selfEmploymentNetEarningsAfterAdjustments',
      'foreignTaxPaid', 'foreignSourceIncome', 'amtDepreciationAdjustment', 'amtAdjustedGainOrLoss', 'amtDepletion', 'amtOtherItems',
      'taxExemptInterest', 'otherTaxExemptIncome', 'investmentIncome', 'investmentExpenses', 'excessTaxableIncome', 'excessBusinessInterestIncome',
      'section199AQBI', 'section199AW2Wages', 'section199AUBIA', 'section199AQualifiedReitDividends', 'section199AQualifiedPTPIncome',
      'section199APTPW2Wages', 'section199APTPUBIA', 'lowIncomeHousingCredit42j5', 'lowIncomeHousingCreditOther',
      'qualifiedRehabilitationExpenditures', 'otherRentalRealEstateCredits', 'otherRentalCredits', 'otherCredits', 'ptpDispositionGainOrLoss'] as const;
    for (const [index, original] of input.scheduleK1.entries()) {
      if (operatingK1?.rows.some(row => row.k1Index === index)) continue;
      const actual = k1?.statements.find(row => row.k1Index === index);
      if (original.taxYear !== input.taxpayer.taxYear || otherAmounts.some(key => !d(original[key]).isFinite() || !d(original[key]).isZero())
        || original.isPassiveActivity || original.isPubliclyTradedPartnership || original.ptpFullyDisposedInTaxableTransaction
        || original.isForeignPartnership || actual?.distributionGain?.gain.gt(0)
        || (input.taxpayer.taxYear !== 2025 && actual?.basis.charitableSources?.records.some(row => !row.current))
        || input.qbiLossSources?.activities?.some(row => row.k1SourceId === `scheduleK1:${index}`)) {
        throw new Error('Form172 charity-only K1 requires the separate current origin method for other activity, income, prior loss or gain sources');
      }
    }
    if (k1) for (const key of Object.keys(amounts) as (keyof typeof amounts)[]) amounts[key] = amounts[key].plus(k1.amounts[key]);
  }
  if (input.cryptoIncome) {
    const crypto = input.cryptoIncome;
    if (crypto.isMiningBusiness || crypto.isStakingBusiness || ['miningIncome', 'stakingIncome', 'airdropIncome', 'tokenSwaps',
      'lpPositions', 'yieldRewards', 'nftTransactions', 'lendingIncome', 'liquidations', 'lots'].some(key =>
      (crypto[key as keyof typeof crypto] as unknown[])?.length > 0)) {
      throw new Error('Form172 donation-only crypto requires the separate current origin classification for trading or business sources');
    }
    const donations = calculateCryptoDonations(crypto.donations, input.taxpayer.taxYear);
    if (!donations.sourceFactsVerified) throw new Error('Form172 crypto charity requires confirmed original donation sources');
    for (const key of Object.keys(amounts) as (keyof typeof amounts)[]) amounts[key] = amounts[key].plus(donations.contributionAmounts[key]);
  }
  if (completeResult) return completeResult;
  const history = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (history?.sourceTaxYear !== input.taxpayer.taxYear - 1 || !history.sourceReference?.trim()
    || history.sourceFactsConfirmed !== true || history.allCarryoversIncluded !== true
    || !Array.isArray(history.priorRegularCarryovers) || !Array.isArray(history.priorAlternativeCarryovers)) {
    throw new Error('Form172 charitable origin requires complete independent regular and alternative charitable histories');
  }
  if (history.priorRegularCarryovers.length || history.priorAlternativeCarryovers.length) {
    throw new Error('Form172 prior charitable origin coordination requires its separate original-vintage method');
  }
  if (input.charitableCarryoverSources && validateCharitableCarryoverSources(input).length) {
    throw new Error('Form172 current charitable source method requires an actual empty regular history');
  }
  if (history.alternativeCarryoverSources && validateCharitableCarryoverSources({ ...input,
    priorYear: undefined, charitableCarryoverSources: history.alternativeCarryoverSources }).length) {
    throw new Error('Form172 current charitable source method requires an actual empty alternative history');
  }
  const qualifiedValue = sum(...Object.values(amounts));
  return { sourceKind: 'current', qualifiedValue, alternativeQualifiedValue: qualifiedValue, sourceDigest: bytesToHex(sha256(new TextEncoder().encode(JSON.stringify({
    current: charitableSourceDigest(input), history,
  })))) };
}
