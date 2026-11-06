/** PA source classification; spec/state/pa-rental-classification.yaml. */
import type { RentalProperty } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

export interface PARentalClassificationResult {
  description: string;
  isBusiness: boolean;
  sourceVerified: boolean;
  lines: CalculatedLine[];
}
export function calculatePARentalClassification(property: RentalProperty, taxYear: number): PARentalClassificationResult {
  const facts = property.paClassification;
  const audit = new AuditTrail();
  if (!facts) {
    if (taxYear >= 2026 || property.sourceFactsConfirmed !== undefined) throw new Error("PA rental classification requires actual activity facts.");
    const isBusiness = property.rentalDays > 0 && property.rentalDays < 30;
    audit.record("PA-Rental-Classification", "class", "Unverified historical rental class", d(isBusiness ? 4 : 6), "Historical annual-days preview; actual customer-use and commercial-enterprise facts are unknown");
    return { description: property.description, isBusiness, sourceVerified: false, lines: audit.getLines() };
  }
  if (facts.factsConfirmed !== true || !facts.sourceReference.trim()) throw new Error("PA rental classification requires confirmed actual source records.");
  for (const field of ["offeredToPublic", "forProfit", "regularAndContinuous", "availableDuringBusinessHours", "significantServices", "significantOperatingExpenses", "incidentalToRealEstateSales", "relatedPartyRental", "dealerPropertyHeldForSale"] as const) {
    if (typeof facts[field] !== "boolean") throw new Error(`PA rental classification requires actual ${field}.`);
  }
  if (!facts.forProfit) throw new Error("PA rental classification for an activity without profit intent requires its separate deduction rules.");
  if (facts.averageCustomerUseDays === undefined || facts.averageCustomerUseDays.trim() === "") throw new Error("PA rental classification requires actual average customer use.");
  const average = d(facts.averageCustomerUseDays);
  if (!average.isFinite() || average.isNegative() || (property.rentalDays > 0 && average.isZero())) throw new Error("PA rental classification average customer use is invalid.");
  const commercialCondition = (average.gt(0) && average.lte(30)) || facts.availableDuringBusinessHours || facts.significantServices
    || facts.significantOperatingExpenses || facts.incidentalToRealEstateSales || facts.dealerPropertyHeldForSale;
  const isBusiness = !facts.relatedPartyRental && facts.offeredToPublic && facts.regularAndContinuous && commercialCondition;
  audit.record("PA-Rental-Classification", "average-use", "Actual average customer-use days", average, `Source activity records: ${facts.sourceReference}`);
  audit.record("PA-Rental-Classification", "class", "PA income class", d(isBusiness ? 4 : 6), "Actual public offering, profit intent, continuity, related-party restriction and commercial-enterprise criteria; never annual occupied days");
  return { description: property.description, isBusiness, sourceVerified: true, lines: audit.getLines() };
}
