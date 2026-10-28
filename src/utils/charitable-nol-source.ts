import Decimal from "decimal.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CharitableCategory, CharitableContributionWorksheetInput } from "@/engine/forms/charitable-contribution-worksheet.js";
import { d, roundDollar } from "./decimal.js";
import { eligibleCurrentCharitableDonations } from "@/engine/forms/charitable-current-sources.js";
import { readCurrentCharitableReceiptAmounts } from "./charitable-current-receipts.js";
import { charitableSourceDigest } from "./charitable-source-digest.js";
import type { PriorCharitableNolLimit } from "./charitable-prior-nol-source.js";
import type { CharitableNolOriginLimit } from "./charitable-nol-origins.js";
import { calculateK1CharitableReturnSources } from "@/engine/forms/k1-charitable-return-sources.js";
import { calculateCryptoDonations } from "@/engine/forms/crypto-lot-matching.js";
import { calculateForm172CharitableSources } from "@/engine/forms/form-172-charitable-sources.js";
import { isNonitemizedPriorPropertySource } from "./k1-nonitemized-prior-property.js";

type AmountKey = keyof CharitableContributionWorksheetInput["amounts"];
export interface CurrentCharitableNolSource {
  /** Undefined only when no positive qualified contribution remains. */
  category?: CharitableCategory;
  medium?: "cash" | "noncash";
  amountKey?: AmountKey;
  amount: Decimal;
  sourceDigest: string;
}
/** Derived internally from original sources; never part of TaxYearInput. */
export interface CurrentCharitableNolContributionLimit {
  method?: undefined;
  category?: CharitableCategory;
  medium?: "cash" | "noncash";
  amount: Decimal;
  sourceDigest: string;
  ledger: "regular" | "alternative";
}
export type CharitableNolContributionLimit = CurrentCharitableNolContributionLimit | PriorCharitableNolLimit | CharitableNolOriginLimit;
const sourceKinds: Record<AmountKey, readonly [CharitableCategory, "cash" | "noncash"]> = {
  cashPublic: ["cash_60", "cash"], noncashPublic: ["noncash_50", "noncash"],
  capitalGainPublic: ["capital_gain_30", "noncash"], cashPrivate: ["other_30", "cash"],
  noncashPrivate: ["other_30", "noncash"], capitalGainPrivate: ["capital_gain_20", "noncash"],
};

/** Presence only; original source validation happens before any NOL benefit test. */
export function hasOriginalCharitableNolSources(input: TaxYearInput): boolean {
  return input.k1CharitableSources !== undefined || (input.cryptoIncome?.donations.length ?? 0) > 0
    || input.scheduleK1.some(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20,
      row.priorSuspendedLosses?.charitable].some(value => !d(value).isZero()));
}

/** One actual current category/medium; specs charitable-single-category-nol.yaml
 * and charitable-original-source-nol.yaml. Original basis is never capped here. */
export function readCurrentCharitableSourceForNol(input: TaxYearInput): CurrentCharitableNolSource {
  const taxYear = input.taxpayer.taxYear;
  if (![2025, 2026].includes(taxYear)) throw new Error("Charitable NOL carry supports actual2025 or2026 contributions");
  if (!d(input.priorYear?.charitableCarryforward).isZero()
    || input.priorYear?.charitableCarryforwardByYear.some(row => !d(row.amount).isZero())
    || input.charitableCarryoverSources?.vintages?.some(row => !d(row.openingCarryforward).isZero())) {
    throw new Error("Prior charitable carry requires its separate category and NOL coordination history");
  }
  for (const row of eligibleCurrentCharitableDonations(input)) {
    if (!row.organization.trim()) throw new Error("Charitable carry requires an actual qualified recipient");
  }
  const amounts = readCurrentCharitableReceiptAmounts(input, { capitalStockOnly: true });
  const originalSources = hasOriginalCharitableNolSources(input);
  if (originalSources && input.form982NolSources) {
    throw new Error("Original charitable sources with COD NOL require their separate source method");
  }
  if (originalSources && input.form172 && calculateForm172CharitableSources(input)?.sourceKind !== "current") {
    throw new Error("Original charitable current origin requires its validated donation-only source classification");
  }
  const k1 = calculateK1CharitableReturnSources(input);
  if (!k1 && input.scheduleK1.some(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20,
    row.priorSuspendedLosses?.charitable].some(value => !d(value).isZero()))) {
    throw new Error("Original K1 charitable NOL sources require their complete attached basis and receipt sources");
  }
  // A validated 2025 basis release is available under section 170 in 2025;
  // the original basis vintage and prior appreciation remain in the K1 ledger.
  // This validates original property availability only. The actual ScheduleA
  // allowable-carry computation separately proves no prior-release floor ambiguity.
  if (taxYear !== 2025 && k1?.statements.some(row => row.basis.charitableSources?.records.some(record => !record.current
    && record.availableAfterBasis.gt(0) && !isNonitemizedPriorPropertySource(taxYear, input.deductionElection, record.category)))) {
    throw new Error("Prior K1 charitable basis releases require their separate NOL contribution-year method");
  }
  if (k1) for (const key of Object.keys(amounts) as AmountKey[]) amounts[key] = amounts[key].plus(k1.amounts[key]);
  if (input.cryptoIncome?.donations.length) {
    for (const row of input.cryptoIncome.donations) {
      if (row.isQualifiedOrganization !== false && (!row.charityName.trim() || !row.asset.trim())) {
        throw new Error("Crypto charitable NOL source requires the actual property and qualified recipient");
      }
    }
    const crypto = calculateCryptoDonations(input.cryptoIncome.donations, taxYear);
    if (!crypto.sourceFactsVerified) throw new Error("Crypto charitable NOL requires confirmed actual original source facts");
    for (const key of Object.keys(amounts) as AmountKey[]) amounts[key] = amounts[key].plus(crypto.contributionAmounts[key]);
  }
  const keys = (Object.keys(amounts) as AmountKey[]).filter(key => amounts[key].gt(0));
  if (keys.length > 1) throw new Error("Mixed charitable categories or contribution media require their separate NOL carry allocation");
  const amountKey = keys[0];
  const [category, medium] = amountKey === undefined ? [undefined, undefined] : sourceKinds[amountKey];
  const history = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (originalSources || (category !== undefined && category !== "cash_60") || history !== undefined) {
    if (history?.sourceTaxYear !== taxYear - 1 || !history.sourceReference?.trim() || history.sourceFactsConfirmed !== true
      || history.allCarryoversIncluded !== true || !Array.isArray(history.priorRegularCarryovers) || !Array.isArray(history.priorAlternativeCarryovers)) {
      throw new Error("Charitable NOL categories require complete independent prior regular and alternative charitable histories");
    }
    if (history.priorRegularCarryovers.length || history.priorAlternativeCarryovers.length) {
      throw new Error("Prior regular or alternative charitable histories require their separate category and vintage coordination method");
    }
  }
  const sourceDigest = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify({
    charitable: charitableSourceDigest(input), history,
  }))));
  return { category, medium, amountKey, amount: amountKey === undefined ? d("0") : amounts[amountKey], sourceDigest };
}

export function validateCharitableNolContributionLimit(input: TaxYearInput, limit: CurrentCharitableNolContributionLimit): CurrentCharitableNolSource {
  const source = readCurrentCharitableSourceForNol(input);
  if (!limit || limit.method !== undefined || !Decimal.isDecimal(limit.amount) || !limit.amount.isFinite() || limit.amount.lt(0)
    || limit.amount.gt(roundDollar(source.amount)) || limit.sourceDigest !== source.sourceDigest
    || limit.category !== source.category || limit.medium !== source.medium
    || !["regular", "alternative"].includes(limit.ledger)) {
    throw new Error("Charitable NOL comparison must reconcile to original source year category medium and value");
  }
  return source;
}

/** Existing public-cash source reader retained for its specific callers. */
export function readCurrentPublicCashForNol(input: TaxYearInput): Decimal {
  const source = readCurrentCharitableSourceForNol(input);
  if (source.category !== undefined && source.category !== "cash_60") throw new Error("Charitable carry requires actual current public-cash contributions");
  return source.amount;
}
