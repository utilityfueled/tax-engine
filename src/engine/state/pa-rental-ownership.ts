/** Actual whole-property allocation; spec/state/pa-schedule-e.yaml. */
import type { RentalProperty } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

export function getPARentalOwnershipFraction(property: RentalProperty) {
  if ((property.sourceFactsConfirmed === true || property.paIncomeExpenses !== undefined) &&
    (property.ownershipPercentage === undefined || !["primary", "spouse"].includes(property.accountHolder ?? ""))) {
    throw new Error("PA confirmed rental ownership requires an actual primary/spouse owner and share; joint interests need separate allocations.");
  }
  // Historical unconfirmed preview records retain their prior whole-property
  // interpretation. This fallback does not establish actual source facts.
  const percentage = d(property.ownershipPercentage ?? "100");
  if (!percentage.isFinite() || percentage.lte(0) || percentage.gt(100)) {
    throw new Error("PA rental ownership percentage must be finite, greater than zero and no more than 100.");
  }
  return percentage.dividedBy(100);
}
