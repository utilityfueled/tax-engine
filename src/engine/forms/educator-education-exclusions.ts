/** Actual source reconciliation for IRC62(d)(2); see the matching spec YAML. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { SavingsBondRedemption, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { Form1099QResult } from "@/engine/forms/form-1099-q.js";
import type { Form8815Result } from "@/engine/forms/form-8815.js";
import { calculateSavingsBondIncomeOwnership } from "@/engine/forms/savings-bond-income-ownership.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";

type Owner = "primary" | "spouse";
export interface EducatorEducationExclusionInput {
  taxYear: number;
  filingStatus: FilingStatus;
  educatorSources?: NonNullable<TaxYearInput["adjustments"]>["educatorExpenseSources"];
  educationDistributions?: Form1099QResult;
  savingsBondResult?: Form8815Result;
  savingsBondRedemptions?: SavingsBondRedemption[];
}
export interface EducatorOwnerExclusions {
  owner: Owner;
  savingsBondInterest: Decimal;
  qtpEarnings: Decimal;
  coverdellEarnings: Decimal;
}
export interface EducatorEducationExclusionResult {
  ownerExclusions: EducatorOwnerExclusions[];
  lines: CalculatedLine[];
}
function amount(value: string | Decimal | undefined, label: string): Decimal {
  if (value === undefined || (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value))) throw new Error(`Educator exclusion requires actual nonnegative ${label}; unknown is not zero.`);
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`Educator exclusion requires finite nonnegative ${label}.`);
  return result;
}
function ownerIsAllowed(owner: Owner, filingStatus: FilingStatus): void {
  if (owner === "spouse" && filingStatus !== "married_filing_jointly") throw new Error("Spouse educator exclusion sources require a joint return.");
}

export function reconcileEducatorEducationExclusions(input: EducatorEducationExclusionInput): EducatorEducationExclusionResult {
  const totals: Record<Owner, EducatorOwnerExclusions> = {
    primary: { owner: "primary", savingsBondInterest: d(0), qtpEarnings: d(0), coverdellEarnings: d(0) },
    spouse: { owner: "spouse", savingsBondInterest: d(0), qtpEarnings: d(0), coverdellEarnings: d(0) },
  };
  const audit = new AuditTrail();
  const output = () => ({ ownerExclusions: [totals.primary, totals.spouse], lines: audit.getLines() });
  if (!input.educatorSources?.length) return output();
  if (input.taxYear !== 2025 && input.taxYear !== 2026) throw new Error("Educator exclusion reconciliation supports only actual2025/2026 sources.");
  const owners = new Set<Owner>();
  for (const source of input.educatorSources) {
    if (!source.accountHolder || owners.has(source.accountHolder)) throw new Error("Educator exclusion requires actual unique owner; duplicate source worksheet.");
    owners.add(source.accountHolder);
    ownerIsAllowed(source.accountHolder, input.filingStatus);
    if (source.taxYear !== input.taxYear) throw new Error("Educator exclusion source year must match the actual return year.");
    if (source.sourceFactsConfirmed !== true) throw new Error("Educator exclusion requires confirmed actual source facts.");
  }

  const education = input.educationDistributions;
  if (education) {
    if (education.sourceFactsVerified !== true) throw new Error("Educator education distributions require verified actual source calculations.");
    if (education.taxYear !== input.taxYear) throw new Error("Educator education distribution year must match the actual return year.");
    const sourceIds = new Set<string>();
    for (const row of education.perDistribution) {
      if (!row.sourceId?.trim() || sourceIds.has(row.sourceId)) throw new Error("Educator education distributions contain a missing or duplicate actual source identity.");
      sourceIds.add(row.sourceId);
      if (row.recipientOwner === "other" || row.treatment === "returned_contribution") continue;
      ownerIsAllowed(row.recipientOwner, input.filingStatus);
      if (row.sourceTaxYear !== input.taxYear || row.incomeTaxYear !== input.taxYear) throw new Error("Educator ordinary education exclusion needs actual current-year source and income facts.");
      const excluded = amount(row.educationExpenseExcludedEarnings, "calculated education-excluded earnings");
      if (row.accountType === "529") {
        if (excluded.gt(0) && row.distributionMedium !== "cash") throw new Error("Educator QTP exclusion requires actual cash medium; unknown or prepaid in-kind treatment remains unresolved.");
        totals[row.recipientOwner].qtpEarnings = totals[row.recipientOwner].qtpEarnings.plus(excluded);
      } else totals[row.recipientOwner].coverdellEarnings = totals[row.recipientOwner].coverdellEarnings.plus(excluded);
    }
  }

  const bonds = input.savingsBondResult;
  if (bonds) {
    if (bonds.sourceFactsVerified !== true) throw new Error("Educator savings-bond exclusions require verified actual source calculations.");
    if (bonds.taxYear !== input.taxYear) throw new Error("Educator savings-bond source year must match the return year.");
    const total = amount(bonds.excludableSavingsBondInterest, "final calculated bond exclusion");
    const redemptions = input.savingsBondRedemptions ?? [];
    const sources = new Map<string, SavingsBondRedemption>();
    for (const source of redemptions) {
      if (!source.sourceId?.trim() || sources.has(source.sourceId)) throw new Error("Educator savings-bond source identity is missing or duplicate.");
      sources.set(source.sourceId, source);
    }
    if (sources.size !== bonds.redemptionResults.length) throw new Error("Educator savings-bond sources do not match the calculated redemptions.");
    const seen = new Set<string>(), eligibleIds = new Set<string>();
    const ownerInterest = { primary: d(0), spouse: d(0) };
    for (const row of bonds.redemptionResults) {
      const source = row.sourceId ? sources.get(row.sourceId) : undefined;
      if (!source || !row.sourceId || seen.has(row.sourceId) || source.sourceFactsComplete !== true || typeof source.ownershipConfirmed !== "boolean" || typeof row.eligible !== "boolean") throw new Error("Educator savings-bond result requires each complete actual source exactly once.");
      seen.add(row.sourceId);
      if (!row.eligible) continue;
      if (!source.ownershipConfirmed || !source.registeredOwner || source.registeredOwner === "other") throw new Error("Educator eligible bond requires actual registered ownership.");
      if (source.registeredOwner !== "taxpayer") ownerIsAllowed("spouse", input.filingStatus);
      eligibleIds.add(row.sourceId);
      if (total.gt(0)) {
        const actual = calculateSavingsBondIncomeOwnership(source);
        if (!actual.currentInterest.eq(amount(row.currentYearInterest, "eligible bond current interest")) || !actual.principal.eq(amount(row.principal, "eligible bond principal")) || !amount(source.proceeds, "source proceeds").eq(row.proceeds)) throw new Error("Educator bond source interest and principal do not match the actual calculated redemption.");
        ownerInterest.primary = ownerInterest.primary.plus(actual.primaryInterest);
        ownerInterest.spouse = ownerInterest.spouse.plus(actual.spouseInterest);
      }
    }
    if (total.gt(0) && eligibleIds.size === 0) throw new Error("Educator positive bond exclusion has no actual eligible source.");
    const soleOwner: Owner | undefined = ownerInterest.primary.gt(0) && ownerInterest.spouse.isZero() ? "primary"
      : ownerInterest.spouse.gt(0) && ownerInterest.primary.isZero() ? "spouse" : undefined;
    const currentInterest = ownerInterest.primary.plus(ownerInterest.spouse);
    if (total.gt(0)) {
      if (!roundDollar(currentInterest).eq(amount(bonds.totalInterest, "calculated Form8815line6 interest"))) throw new Error("Educator bond source interest rounding must reconcile to the actual Form8815 worksheet before owner allocation.");
    }
    if (soleOwner) {
      totals[soleOwner].savingsBondInterest = total;
    } else if (total.gt(0) && bonds.expenseRatio.eq(1) && bonds.modifiedAGI.lte(bonds.phaseOutThreshold) && total.eq(bonds.totalInterest)) {
      if (!currentInterest.eq(total)) throw new Error("Educator fully excluded bond source interest needs exact source rounding reconciliation before owner attribution.");
      totals.primary.savingsBondInterest = ownerInterest.primary;
      totals.spouse.savingsBondInterest = ownerInterest.spouse;
    } else if (total.gt(0)) {
      throw new Error("Educator mixed or joint bond ownership has an unresolved statutory owner-allocation method; a supplied split cannot establish it.");
    }
  } else if (input.savingsBondRedemptions?.length) {
    throw new Error("Educator savings-bond source facts require the complete calculated Form8815 result.");
  }

  for (const source of input.educatorSources) {
    // The owner was narrowed above; keep the runtime boundary explicit.
    const owner = source.accountHolder;
    if (!owner) throw new Error("Educator exclusion requires an actual owner.");
    for (const [field, key, line] of [
      ["excludedSavingsBondInterest", "savingsBondInterest", "bond-exclusion"],
      ["nontaxableQualifiedTuitionProgramAmount", "qtpEarnings", "qtp-exclusion"],
      ["nontaxableCoverdellEarnings", "coverdellEarnings", "coverdell-exclusion"],
    ] as const) {
      const claimed = amount(source[field], field), calculated = totals[owner][key];
      if (!claimed.eq(calculated)) throw new Error(`Reconcile ${owner} educator ${field} with the complete calculated actual source exclusion.`);
      audit.record("Educator education exclusions", `${owner}:${line}`, `Reconciled ${owner} educator ${key}`, calculated,
        "Actual declared reduction equals calculated recipient exclusion; no expense or owner reallocation", { claimed, calculated });
    }
  }
  return output();
}
