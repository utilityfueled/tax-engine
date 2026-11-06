/** Pub974 P/7206 stop. Spec: spec/federal/marketplace-nonspecified-stop.yaml. */
import type { MarketplaceHealthPremiumGroup } from "./marketplace-health-premiums.js";
import { sumSourceMoney } from "@/utils/sum-source-money.js";
import { sumSourceMoneyRatios } from "@/utils/sum-source-money-ratios.js";

/** Only completed canonical business sources can determine this stopping rule. */
export function calculateMarketplaceNonspecifiedStop(groups: MarketplaceHealthPremiumGroup[]): boolean {
  const seen = new Set<string>();
  for (const group of groups) {
    if (!group.businessSourceId || seen.has(group.businessSourceId)
      || !["primary", "spouse"].includes(group.accountHolder)
      || !group.remainingEarnedIncome.isFinite()
      || !group.specifiedPremiums.isFinite() || group.specifiedPremiums.lt(0)
      || !group.nonspecifiedDeduction.isFinite() || group.nonspecifiedDeduction.lt(0)
      || !sumSourceMoneyRatios(group.months.flatMap(month => month.specifiedPremiumSources ?? [{ amount: month.specifiedPremium }])).eq(group.specifiedPremiums)) {
      throw new Error("Pub974 nonspecified stopping rule requires complete unique actual business sources.");
    }
    seen.add(group.businessSourceId);
  }
  const specified = groups.filter(group => group.months.length > 0 && group.includedInEarnedIncomeLimit !== false);
  return specified.some(group => group.specifiedPremiums.gt(0))
    && sumSourceMoney(...groups.map(group => group.nonspecifiedDeduction)).gt(0)
    && specified.every(group => group.remainingEarnedIncome.lte(0));
}
