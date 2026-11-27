import type Decimal from "decimal.js";
import type { Section45WPriorYearWorkpaper } from "@/models/section45w-current-credit.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";

/** Allocate unused ordinary credit between consecutive calendar years under §39(b). */
export function allocateOrdinarySection39Carryback(unusedCurrentCredit: Decimal, priorYear: Section45WPriorYearWorkpaper) {
  // The validated consecutive-year source confirms there are no earlier-source-year carrybacks.
  const priorYearSection39Capacity = zeroFloor(d(priorYear.section38Limitation).minus(priorYear.section38CarryforwardAndCurrentCredits));
  const carryback = min(unusedCurrentCredit, priorYearSection39Capacity);
  return { priorYearSection39Capacity, carryback, potentialCarryforward: unusedCurrentCredit.minus(carryback) };
}
