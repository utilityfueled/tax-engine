/** Actual income ownership, not a final Form8815 exclusion allocation. */
import Decimal from "decimal.js";
import type { SavingsBondRedemption } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import type { BondSourceRatio } from "./savings-bond-reissue-sources.js";
import { displaySavingsBondRatio, sumSavingsBondRatios } from "@/utils/savings-bond-ratios.js";

interface SavingsBondIncomeOwnershipResult {
  principal: Decimal;
  currentInterest: Decimal;
  primaryInterest: Decimal;
  spouseInterest: Decimal;
  /** Exact source values; finite quotients above are display values only. */
  primaryInterestRatio: BondSourceRatio;
  spouseInterestRatio: BondSourceRatio;
  lines: CalculatedLine[];
}
export function calculateSavingsBondIncomeOwnership(bond: SavingsBondRedemption): SavingsBondIncomeOwnershipResult {
  const raw = [bond.faceValue, bond.proceeds, bond.priorYearInterestReported,
    bond.incomeOwnership?.taxpayerPurchaseFunds, bond.incomeOwnership?.spousePurchaseFunds,
    bond.incomeOwnership?.taxpayerPriorYearInterestReported, bond.incomeOwnership?.spousePriorYearInterestReported];
  const digits = Math.max(1, ...raw.map(value => value?.replace(/\D/g, "").length ?? 0));
  const D = Decimal.clone({ precision: Math.max(80, digits * 8 + 32) });
  const amount = (value: string | undefined, label: string): Decimal => {
    if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`Bond income ownership requires actual nonnegative ${label}.`);
    const result = new D(value);
    if (!result.isFinite() || result.lt(0)) throw new Error(`Bond income ownership requires finite nonnegative ${label}.`);
    return result;
  };
  const ratio = (numerator: Decimal, denominator: Decimal = new D(1)): BondSourceRatio => ({ numerator, denominator });
  if (bond.sourceFactsComplete !== true || bond.ownershipConfirmed !== true) throw new Error("Bond income ownership requires complete actual source ownership.");
  if (bond.bondType !== "paper_ee" && bond.bondType !== "electronic_ee" && bond.bondType !== "series_i") throw new Error("Bond income ownership needs actual series EE or I source classification.");
  const face = amount(bond.faceValue, "face value"), proceeds = amount(bond.proceeds, "redemption proceeds");
  const prior = amount(bond.priorYearInterestReported, "previously reported interest");
  const principal = bond.bondType === "paper_ee" ? face.times("0.5") : face;
  const lifetime = proceeds.minus(principal), currentInterest = lifetime.minus(prior);
  if (principal.lte(0) || lifetime.lt(0) || currentInterest.lt(0)) throw new Error("Bond income ownership source principal or prior interest does not reconcile.");
  let primaryInterestRatio = ratio(new D(0)), spouseInterestRatio = ratio(new D(0));
  if (bond.registeredOwner === "taxpayer" || bond.registeredOwner === "spouse") {
    if (bond.incomeOwnership) throw new Error("Joint purchase-fund ownership facts conflict with sole bond registration.");
    if (bond.registeredOwner === "taxpayer") primaryInterestRatio = ratio(currentInterest);
    else spouseInterestRatio = ratio(currentInterest);
  } else if (bond.registeredOwner === "taxpayer_and_spouse") {
    const facts = bond.incomeOwnership;
    if (!facts || facts.sourceFactsConfirmed !== true || !facts.sourceReference?.trim()) throw new Error("Bond joint income ownership has an unresolved allocation without actual confirmed purchase and reporting source records.");
    if (facts.communityProperty === undefined) throw new Error("Bond income ownership requires actual community-property status.");
    if (facts.ownershipUnchangedSinceIssueConfirmed !== true) throw new Error("Bond income ownership needs unchanged ownership history; transfer or reissue allocation remains unresolved.");
    const primaryPrior = amount(facts.taxpayerPriorYearInterestReported, "taxpayer prior reported interest"), spousePrior = amount(facts.spousePriorYearInterestReported, "spouse prior reported interest");
    if (!primaryPrior.plus(spousePrior).eq(prior)) throw new Error("Bond actual per-owner prior interest must equal total previously reported interest.");
    let primaryLifetime: BondSourceRatio, spouseLifetime: BondSourceRatio;
    if (facts.communityProperty) {
      if (facts.communityPropertyThroughoutAccrualConfirmed !== true) throw new Error("Bond community-property income needs confirmed history throughout interest accrual.");
      // Pub550 Table1-2: unchanged community-property interest belongs half
      // to each spouse, regardless of which spouse supplied the purchase funds.
      if (facts.taxpayerPurchaseFunds !== undefined || facts.spousePurchaseFunds !== undefined) {
        const primaryFunds = amount(facts.taxpayerPurchaseFunds, "taxpayer purchase funds"), spouseFunds = amount(facts.spousePurchaseFunds, "spouse purchase funds");
        if (!primaryFunds.plus(spouseFunds).eq(principal)) throw new Error("Bond actual purchase funds must equal source principal.");
      }
      primaryLifetime = ratio(lifetime, new D(2)); spouseLifetime = ratio(lifetime, new D(2));
    } else {
      if (facts.communityPropertyThroughoutAccrualConfirmed === true) throw new Error("Bond community-property history conflicts with actual noncommunity status.");
      const primaryFunds = amount(facts.taxpayerPurchaseFunds, "taxpayer purchase funds"), spouseFunds = amount(facts.spousePurchaseFunds, "spouse purchase funds");
      if (!primaryFunds.plus(spouseFunds).eq(principal)) throw new Error("Bond actual purchase funds must equal source principal.");
      primaryLifetime = ratio(lifetime.times(primaryFunds), principal);
      spouseLifetime = ratio(lifetime.times(spouseFunds), principal);
    }
    primaryInterestRatio = sumSavingsBondRatios([primaryLifetime, ratio(primaryPrior.negated())]);
    spouseInterestRatio = sumSavingsBondRatios([spouseLifetime, ratio(spousePrior.negated())]);
    if (primaryInterestRatio.numerator.lt(0) || spouseInterestRatio.numerator.lt(0)) throw new Error("Bond actual owner prior interest exceeds that owner's lifetime interest.");
  } else throw new Error("Bond income ownership requires an actual taxpayer or spouse registration.");
  if (!sumSavingsBondRatios([primaryInterestRatio, spouseInterestRatio, ratio(currentInterest.negated())]).numerator.isZero()) throw new Error("Bond source interest does not reconcile to actual income ownership.");
  const primaryInterest = primaryInterestRatio.numerator.div(primaryInterestRatio.denominator);
  const spouseInterest = spouseInterestRatio.numerator.div(spouseInterestRatio.denominator);
  const audit = new AuditTrail();
  audit.record("Savings bond income ownership", "primary", "Taxpayer current bond interest", primaryInterest, "Actual registration, purchase funds or unchanged community income, less actual owner prior reporting", { "Exact owner interest": displaySavingsBondRatio(primaryInterestRatio) });
  audit.record("Savings bond income ownership", "spouse", "Spouse current bond interest", spouseInterest, "Actual registration, purchase funds or unchanged community income, less actual owner prior reporting", { "Exact owner interest": displaySavingsBondRatio(spouseInterestRatio) });
  return { principal, currentInterest, primaryInterest, spouseInterest, primaryInterestRatio, spouseInterestRatio, lines: audit.getLines() };
}
