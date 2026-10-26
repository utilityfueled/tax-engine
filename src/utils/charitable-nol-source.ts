import type { TaxYearInput } from "@/models/inputs.js";
import { d, sum } from "./decimal.js";
import { resolveCharitableRecipient } from "./charitable-recipient.js";
import { eligibleCurrentCharitableDonations } from "@/engine/forms/charitable-current-sources.js";

/** Original current public-cash receipts for the bounded Section170/NOL method. */
export function readCurrentPublicCashForNol(input: TaxYearInput) {
  const taxYear = input.taxpayer.taxYear;
  if (![2025, 2026].includes(taxYear)) throw new Error("Charitable NOL carry supports actual2025 or2026 contributions");
  if (d(input.priorYear?.charitableCarryforward).gt(0)
    || input.priorYear?.charitableCarryforwardByYear.some(row => d(row.amount).gt(0))
    || input.charitableCarryoverSources?.vintages?.some(row => !d(row.openingCarryforward).isZero())) {
    throw new Error("Prior charitable carry requires its separate category and NOL coordination history");
  }
  if (input.scheduleK1.some(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20].some(value => !d(value).isZero()))
    || (input.cryptoIncome?.donations.length ?? 0) > 0) {
    throw new Error("Mixed charitable source categories require their separate NOL carry allocation");
  }
  return sum(...eligibleCurrentCharitableDonations(input).map(row => {
    const amount = d(row.amount);
    if (!amount.isFinite() || amount.lt(0)) throw new Error("Charitable carry requires finite nonnegative original gifts");
    if (amount.isZero()) return amount;
    if (row.type !== "cash") throw new Error("Charitable carry currently requires actual current public-cash contributions");
    const date = new Date(`${row.dateOfDonation}T00:00:00Z`);
    if (row.qualifiedOrganization !== true || resolveCharitableRecipient(row).percentageCategory !== "fifty-percent" || !row.organization.trim()
      || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.dateOfDonation
      || date.getUTCFullYear() !== taxYear) {
      throw new Error("Charitable carry requires actual current public qualification, recipient and payment date");
    }
    return amount;
  }));
}
