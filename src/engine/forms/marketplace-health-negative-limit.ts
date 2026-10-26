/** Signed Pub974 W15. Spec: spec/federal/marketplace-health-negative-limit.yaml. */
import type { MarketplaceHealthPremiumGroup } from "./marketplace-health-premiums.js";
import { calculateMarketplaceNonspecifiedStop } from "./marketplace-nonspecified-stop.js";
import { sum } from "@/utils/decimal.js";

/** Derived canonical sources only; never a current deduction or owner override. */
export function calculateMarketplaceNegativeLimit(groups: MarketplaceHealthPremiumGroup[]) {
  // The publication's earlier stop takes precedence over the W/X worksheets.
  if (calculateMarketplaceNonspecifiedStop(groups)) return undefined;
  const specified = groups.filter(group => group.months.length > 0 && group.includedInEarnedIncomeLimit !== false);
  if (!specified.some(group => group.specifiedPremiums.gt(0))) return undefined;
  const specifiedBusinessIncome = sum(...specified.map(group => group.remainingEarnedIncome.plus(group.nonspecifiedDeduction)));
  const nonspecifiedDeduction = sum(...groups.map(group => group.nonspecifiedDeduction));
  const remainingEarnedIncome = specifiedBusinessIncome.minus(nonspecifiedDeduction);
  if (remainingEarnedIncome.gte(0)) return undefined;
  const contributing = groups.filter(group => specified.includes(group) || group.nonspecifiedDeduction.gt(0));
  const owners = new Set(contributing.map(group => group.accountHolder));
  if (owners.size !== 1) throw new Error("Pub974 negative Worksheet W15 with separate contributing owners requires its actual owner method.");
  if (specifiedBusinessIncome.lt(0)) throw new Error("Pub974 negative Worksheet W15 requires a nonnegative combined claim; negative total income needs its separate method.");
  return { accountHolder: contributing[0].accountHolder, specifiedBusinessIncome, nonspecifiedDeduction, remainingEarnedIncome,
    businessSourceIds: contributing.map(group => group.businessSourceId).sort((left, right) => left.localeCompare(right, "en")) };
}
