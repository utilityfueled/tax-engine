/** Actual vehicle financing allocation; spec/federal/vehicle-refinancing.yaml. */
import Decimal from "decimal.js";
import type { Schedule1AInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";
import { VehicleRefinancingSourcesSchema } from "@/models/vehicle-refinancing-sources.js";
type Loan = Schedule1AInput["vehicleLoans"][number];
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error(`Vehicle refinancing requires actual nonnegative ${label}`);
  return d(value);
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Vehicle refinancing requires actual ${label}`);
  return value.trim();
}
function flag(value: boolean | undefined, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Vehicle refinancing ${label} is unknown`);
  return value;
}
function date(value: string | undefined): string {
  const raw = text(value, "loan date"), parsed = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new Error("Vehicle refinancing needs an actual valid loan date");
  return raw;
}
export function calculateVehicleRefinancing(loan: Loan, taxYear: number, auditId = "1"): { eligibleInterest: Decimal; lines: CalculatedLine[] } {
  if (![2025, 2026].includes(taxYear) || loan.refinanced !== true) throw new Error("Vehicle refinancing requires a supported actual return year and refinance source");
  if (!loan.refinancingSources) throw new Error("Vehicle refinancing requires actual original and refinance source records");
  const sources = VehicleRefinancingSourcesSchema.parse(loan.refinancingSources);
  if (sources.sourceTaxYear !== taxYear || loan.sourceTaxYear !== taxYear || sources.vin !== loan.vin
    || sources.sourceFactsConfirmed !== true || sources.allLoansIncluded !== true) throw new Error("Vehicle refinancing requires confirmed complete actual year and vehicle sources");
  text(sources.sourceReference, "source reference");
  if (sources.ordinaryPrincipalMethodConfirmed !== true || sources.sameOriginalBorrowerConfirmed !== true) throw new Error("Vehicle refinancing needs actual unchanged borrower and ordinary pro-rata principal history; further advances, capitalized additions and successor borrowers need their separate method");
  const original = sources.originalLoan, refinancings = sources.refinancings;
  if (!original || !refinancings?.length) throw new Error("Vehicle refinancing requires its original loan and every refinancing source");
  const originalPrincipal = amount(original.principal, "original principal");
  const purchase = amount(original.qualifiedPurchaseCosts, "qualified purchase costs"), other = amount(original.otherPurchaseCosts, "other purchase costs"), down = amount(original.downPayment, "down payment");
  if (!originalPrincipal.gt(0) || !purchase.plus(other).minus(down).eq(originalPrincipal)) throw new Error("Vehicle refinancing original principal must reconcile to purchase costs and down payment");
  const audit = new AuditTrail(), rows = [original, ...refinancings];
  const ids = new Set<string>();
  let principal = originalPrincipal, qualifyingPrincipal = Decimal.min(originalPrincipal, purchase);
  let previousId = "", previousDate = "", totalInterest = d("0"), totalElsewhere = d("0"), totalOtherExcluded = d("0");
  const eligibleAmounts: Decimal[] = [];
  const yearStart = `${taxYear}-01-01`, yearEnd = `${taxYear}-12-31`;
  for (const [index, row] of rows.entries()) {
    const id = text(row.sourceId, "loan source identity"), currentDate = date(row.originationDate);
    text(row.sourceReference, "loan source reference"); text(row.lenderName, "lender"); text(row.loanAccountReference, "loan account reference");
    if (ids.has(id)) throw new Error("Duplicate vehicle refinancing source identity");
    ids.add(id);
    if (currentDate > yearEnd || currentDate < "2025-01-01" || (previousDate && currentDate < previousDate)) throw new Error("Vehicle refinancing loan dates must follow the actual original loan within the return year or its supported history");
    if (index === 0 && currentDate !== loan.loanOriginationDate) throw new Error("Vehicle refinancing original loan date conflicts with the purchase-loan source");
    const firstLien = flag(row.firstLien, "first lien"), relatedParty = flag(row.relatedParty, "related lender");
    if (index > 0) {
      const refinance = refinancings[index - 1];
      if (!refinance || text(refinance.previousLoanSourceId, "previous loan identity") !== previousId) throw new Error("Vehicle refinancing must link each actual preceding loan exactly once");
      const balance = amount(refinance.previousOutstandingPrincipal, "previous outstanding principal"), newPrincipal = amount(row.principal, "new principal");
      if (!newPrincipal.gt(0) || !balance.gt(0) || balance.gt(principal)) throw new Error("Vehicle refinancing balance conflicts with ordinary principal history");
      const outstandingQualified = balance.times(qualifyingPrincipal).div(principal);
      qualifyingPrincipal = Decimal.min(newPrincipal, outstandingQualified);
      principal = newPrincipal;
      if (!firstLien || relatedParty) qualifyingPrincipal = d("0");
      audit.record("Vehicle Refinancing", `${auditId}-refinance-${index}`, "Qualifying balance after refinancing", qualifyingPrincipal,
        "if first lien and unrelated lender, min(new principal, actual prior balance * prior qualifying principal / prior principal); otherwise zero", { priorBalance: balance, outstandingQualified, newPrincipal });
    }
    if (!firstLien || relatedParty) qualifyingPrincipal = d("0");
    const paid = amount(row.interestPaid, "current-year interest"), elsewhere = amount(row.interestDeductedElsewhere, "qualifying interest deducted elsewhere"), excluded = amount(row.otherExcludedInterest, "other excluded qualifying interest");
    const next = rows[index + 1];
    if (next && date(next.originationDate) < yearStart && !paid.isZero()) throw new Error("A loan paid off before the return year cannot supply current-year interest in this ordinary method");
    const qualifyingInterest = paid.times(qualifyingPrincipal).div(principal);
    if (elsewhere.plus(excluded).gt(qualifyingInterest)) throw new Error("Vehicle refinancing exclusions exceed that loan's qualifying interest portion");
    const allowed = qualifyingInterest.minus(elsewhere).minus(excluded);
    totalInterest = totalInterest.plus(paid); totalElsewhere = totalElsewhere.plus(elsewhere); totalOtherExcluded = totalOtherExcluded.plus(excluded);
    eligibleAmounts.push(allowed);
    audit.record("Vehicle Refinancing", `${auditId}-loan-${index + 1}`, "Interest from actual loan portion", allowed,
      "paid interest * qualifying principal / principal - actual qualifying portion deducted elsewhere - other excluded qualifying interest",
      { principal, qualifyingPrincipal, paid, elsewhere, excluded });
    previousId = id; previousDate = currentDate;
  }
  const last = refinancings.at(-1);
  if (!last || text(last.lenderName, "latest lender") !== text(loan.lenderName, "selected lender")
    || text(last.loanAccountReference, "latest loan account") !== text(loan.loanAccountReference, "selected loan account")
    || last.firstLien !== loan.firstLien || last.relatedParty !== loan.relatedParty) throw new Error("Vehicle refinancing latest loan facts conflict with the selected source");
  if (!totalInterest.eq(loan.interestPaid) || !totalElsewhere.eq(loan.businessInterestDeducted) || !totalOtherExcluded.eq(loan.nonqualifyingInterest)) throw new Error("Vehicle refinancing actual interest and exclusion sources must reconcile to the original totals");
  return { eligibleInterest: sum(...eligibleAmounts), lines: audit.getLines() };
}
