import Decimal from "decimal.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CharitableCategory, CharitableContributionWorksheetInput } from "@/engine/forms/charitable-contribution-worksheet.js";
import { d, roundDollar } from "./decimal.js";
import { eligibleCurrentCharitableDonations } from "@/engine/forms/charitable-current-sources.js";
import { readCurrentCharitableReceiptAmounts } from "./charitable-current-receipts.js";
import { charitableSourceDigest } from "./charitable-source-digest.js";

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
export interface CharitableNolContributionLimit {
  category?: CharitableCategory;
  medium?: "cash" | "noncash";
  amount: Decimal;
  sourceDigest: string;
  ledger: "regular" | "alternative";
}
const sourceKinds: Record<AmountKey, readonly [CharitableCategory, "cash" | "noncash"]> = {
  cashPublic: ["cash_60", "cash"], noncashPublic: ["noncash_50", "noncash"],
  capitalGainPublic: ["capital_gain_30", "noncash"], cashPrivate: ["other_30", "cash"],
  noncashPrivate: ["other_30", "noncash"], capitalGainPrivate: ["capital_gain_20", "noncash"],
};

/** One actual current category/medium; spec charitable-single-category-nol.yaml. */
export function readCurrentCharitableSourceForNol(input: TaxYearInput): CurrentCharitableNolSource {
  const taxYear = input.taxpayer.taxYear;
  if (![2025, 2026].includes(taxYear)) throw new Error("Charitable NOL carry supports actual2025 or2026 contributions");
  if (!d(input.priorYear?.charitableCarryforward).isZero()
    || input.priorYear?.charitableCarryforwardByYear.some(row => !d(row.amount).isZero())
    || input.charitableCarryoverSources?.vintages?.some(row => !d(row.openingCarryforward).isZero())) {
    throw new Error("Prior charitable carry requires its separate category and NOL coordination history");
  }
  if (input.scheduleK1.some(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20].some(value => !d(value).isZero()))
    || input.k1CharitableSources !== undefined || (input.cryptoIncome?.donations.length ?? 0) > 0) {
    throw new Error("Mixed charitable source categories require their separate NOL carry allocation");
  }
  for (const row of eligibleCurrentCharitableDonations(input)) {
    if (!row.organization.trim()) throw new Error("Charitable carry requires an actual qualified recipient");
  }
  const amounts = readCurrentCharitableReceiptAmounts(input, { capitalStockOnly: true });
  const keys = (Object.keys(amounts) as AmountKey[]).filter(key => amounts[key].gt(0));
  if (keys.length > 1) throw new Error("Mixed charitable categories or contribution media require their separate NOL carry allocation");
  const amountKey = keys[0];
  const [category, medium] = amountKey === undefined ? [undefined, undefined] : sourceKinds[amountKey];
  const history = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if ((category !== undefined && category !== "cash_60") || history !== undefined) {
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

export function validateCharitableNolContributionLimit(input: TaxYearInput, limit: CharitableNolContributionLimit): CurrentCharitableNolSource {
  const source = readCurrentCharitableSourceForNol(input);
  if (!limit || !Decimal.isDecimal(limit.amount) || !limit.amount.isFinite() || limit.amount.lt(0)
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
