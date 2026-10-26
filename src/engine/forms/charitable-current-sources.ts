/** Current receipt eligibility; spec/federal/charitable-current-sources.yaml. */
import type { TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { resolveCharitableRecipient } from "@/utils/charitable-recipient.js";

export function eligibleCurrentCharitableDonations(input: TaxYearInput): TaxYearInput["donations"] {
  return input.donations.filter(source => {
    const amount = d(source.amount);
    if (!amount.isFinite() || amount.lt(0)) throw new Error("Charitable contribution must be finite and nonnegative");
    if (amount.isZero()) return false;
    const raw = source.dateOfDonation;
    const date = new Date(`${raw}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
      throw new Error("Charitable contribution requires an actual valid payment date");
    }
    if (!raw.startsWith(`${input.taxpayer.taxYear}-`)) throw new Error("Current donation date must belong to the return tax year; prior gifts require actual carry history");
    if (typeof source.qualifiedOrganization !== "boolean") throw new Error("Charitable recipient qualification is unknown");
    if (!source.qualifiedOrganization) return false;
    resolveCharitableRecipient(source);
    return true;
  });
}
