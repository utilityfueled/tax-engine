/** Actual income ownership, not a final Form8815 exclusion allocation. */
import Decimal from "decimal.js";
import type { SavingsBondRedemption } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

interface SavingsBondIncomeOwnershipResult {
  principal: Decimal;
  currentInterest: Decimal;
  primaryInterest: Decimal;
  spouseInterest: Decimal;
  lines: CalculatedLine[];
}
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`Bond income ownership requires actual nonnegative ${label}.`);
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`Bond income ownership requires finite nonnegative ${label}.`);
  return result;
}

export function calculateSavingsBondIncomeOwnership(bond: SavingsBondRedemption): SavingsBondIncomeOwnershipResult {
  if (bond.sourceFactsComplete !== true || bond.ownershipConfirmed !== true) throw new Error("Bond income ownership requires complete actual source ownership.");
  if (bond.bondType !== "paper_ee" && bond.bondType !== "electronic_ee" && bond.bondType !== "series_i") throw new Error("Bond income ownership needs actual series EE or I source classification.");
  const face = amount(bond.faceValue, "face value"), proceeds = amount(bond.proceeds, "redemption proceeds");
  const prior = amount(bond.priorYearInterestReported, "previously reported interest");
  const principal = bond.bondType === "paper_ee" ? face.times("0.5") : face;
  const lifetime = proceeds.minus(principal), currentInterest = lifetime.minus(prior);
  if (principal.lte(0) || lifetime.lt(0) || currentInterest.lt(0)) throw new Error("Bond income ownership source principal or prior interest does not reconcile.");
  let primaryInterest = d(0), spouseInterest = d(0);
  if (bond.registeredOwner === "taxpayer" || bond.registeredOwner === "spouse") {
    if (bond.incomeOwnership) throw new Error("Joint purchase-fund ownership facts conflict with sole bond registration.");
    if (bond.registeredOwner === "taxpayer") primaryInterest = currentInterest;
    else spouseInterest = currentInterest;
  } else if (bond.registeredOwner === "taxpayer_and_spouse") {
    const facts = bond.incomeOwnership;
    if (!facts || facts.sourceFactsConfirmed !== true || !facts.sourceReference?.trim()) throw new Error("Bond joint income ownership has an unresolved allocation without actual confirmed purchase and reporting source records.");
    if (facts.communityProperty === undefined) throw new Error("Bond income ownership requires actual community-property status.");
    if (facts.ownershipUnchangedSinceIssueConfirmed !== true) throw new Error("Bond income ownership needs unchanged ownership history; transfer or reissue allocation remains unresolved.");
    const primaryPrior = amount(facts.taxpayerPriorYearInterestReported, "taxpayer prior reported interest"), spousePrior = amount(facts.spousePriorYearInterestReported, "spouse prior reported interest");
    if (!primaryPrior.plus(spousePrior).eq(prior)) throw new Error("Bond actual per-owner prior interest must equal total previously reported interest.");
    let primaryLifetime: Decimal, spouseLifetime: Decimal;
    if (facts.communityProperty) {
      if (facts.communityPropertyThroughoutAccrualConfirmed !== true) throw new Error("Bond community-property income needs confirmed history throughout interest accrual.");
      // Pub550 Table1-2: unchanged community-property interest belongs half
      // to each spouse, regardless of which spouse supplied the purchase funds.
      if (facts.taxpayerPurchaseFunds !== undefined || facts.spousePurchaseFunds !== undefined) {
        const primaryFunds = amount(facts.taxpayerPurchaseFunds, "taxpayer purchase funds"), spouseFunds = amount(facts.spousePurchaseFunds, "spouse purchase funds");
        if (!primaryFunds.plus(spouseFunds).eq(principal)) throw new Error("Bond actual purchase funds must equal source principal.");
      }
      primaryLifetime = lifetime.div(2); spouseLifetime = lifetime.div(2);
    } else {
      if (facts.communityPropertyThroughoutAccrualConfirmed === true) throw new Error("Bond community-property history conflicts with actual noncommunity status.");
      const primaryFunds = amount(facts.taxpayerPurchaseFunds, "taxpayer purchase funds"), spouseFunds = amount(facts.spousePurchaseFunds, "spouse purchase funds");
      if (!primaryFunds.plus(spouseFunds).eq(principal)) throw new Error("Bond actual purchase funds must equal source principal.");
      primaryLifetime = lifetime.times(primaryFunds).div(principal); spouseLifetime = lifetime.times(spouseFunds).div(principal);
      // Recurring fractions need a separate source rounding worksheet.
      if (!primaryLifetime.times(principal).eq(lifetime.times(primaryFunds)) || !spouseLifetime.times(principal).eq(lifetime.times(spouseFunds))) throw new Error("Bond income ownership source fractions need an exact reconciled rounding worksheet.");
    }
    if (!primaryLifetime.plus(spouseLifetime).eq(lifetime)) throw new Error("Bond income ownership source fractions need an exact reconciled rounding worksheet.");
    primaryInterest = primaryLifetime.minus(primaryPrior); spouseInterest = spouseLifetime.minus(spousePrior);
    if (primaryInterest.lt(0) || spouseInterest.lt(0)) throw new Error("Bond actual owner prior interest exceeds that owner's lifetime interest.");
  } else throw new Error("Bond income ownership requires an actual taxpayer or spouse registration.");
  if (!primaryInterest.plus(spouseInterest).eq(currentInterest)) throw new Error("Bond source interest does not reconcile to actual income ownership.");
  const audit = new AuditTrail();
  audit.record("Savings bond income ownership", "primary", "Taxpayer current bond interest", primaryInterest, "Actual registration, purchase funds or unchanged community income, less actual owner prior reporting");
  audit.record("Savings bond income ownership", "spouse", "Spouse current bond interest", spouseInterest, "Actual registration, purchase funds or unchanged community income, less actual owner prior reporting");
  return { principal, currentInterest, primaryInterest, spouseInterest, lines: audit.getLines() };
}
