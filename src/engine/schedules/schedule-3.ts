/**
 * Schedule 3 — Additional Credits and Payments
 * Spec: spec/federal/schedule-3.yaml
 *
 * Part I: Nonrefundable credits (foreign tax, education, energy)
 * Part II: Other payments and refundable credits (PTC, excess SS)
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, zeroFloor, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Schedule3Input {
  foreignTaxCredit?: Decimal;
  childDependentCareCredit?: Decimal;
  educationCredits?: Decimal;
  retirementSavingsCredit?: Decimal;
  residentialCleanEnergyCredit?: Decimal;
  energyImprovementCredit?: Decimal;
  /** Credit for prior year minimum tax — Form 8801, Schedule 3 Line 6b */
  priorYearMinimumTaxCredit?: Decimal;
  /** General business credit — Form 3800, Schedule 3 Line 6a */
  generalBusinessCredit?: Decimal;
  /** Adoption credit — Form 8839, Schedule 3 Line 6c */
  adoptionCredit?: Decimal;
  /** Credit for the elderly or the disabled — Schedule R, Schedule 3 Line 6d */
  elderlyOrDisabledCredit?: Decimal;
  /** New clean vehicle credit — Form 8936 Part III, Schedule 3 Line 6f */
  newCleanVehicleCredit?: Decimal;
  /** Previously owned clean vehicle credit — Form 8936 Part IV, Schedule 3 Line 6m */
  previouslyOwnedCleanVehicleCredit?: Decimal;
  netPremiumTaxCredit?: Decimal;
  excessSocialSecurityWithholding?: Decimal;
  /** Additional Child Tax Credit (ACTC) from Form 8812 — refundable directly on Form 1040 line 28; excluded from Schedule 3 */
  additionalChildTaxCredit?: Decimal;
  /** AOC refundable portion (40% of AOC credit, max $1,000) — refundable directly on Form 1040 line 29; excluded from Schedule 3 */
  aocRefundablePortion?: Decimal;
}

export interface Schedule3Result {
  foreignTaxCredit: Decimal;
  childDependentCareCredit: Decimal;
  educationCredits: Decimal;
  retirementSavingsCredit: Decimal;
  residentialCleanEnergyCredit: Decimal;
  energyImprovementCredit: Decimal;
  priorYearMinimumTaxCredit: Decimal; // Line 6b
  generalBusinessCredit: Decimal; // Line 6a
  adoptionCredit: Decimal; // Line 6c
  elderlyOrDisabledCredit: Decimal; // Line 6d
  newCleanVehicleCredit: Decimal; // Line 6f
  previouslyOwnedCleanVehicleCredit: Decimal; // Line 6m
  totalNonrefundableCredits: Decimal; // Line 8

  extensionPayment: Decimal;
  netPremiumTaxCredit: Decimal;
  excessSSWithholding: Decimal;
  additionalChildTaxCredit: Decimal; // Form 1040 line 28, retained for API compatibility
  aocRefundablePortion: Decimal;     // Form 1040 line 29, retained for API compatibility
  totalRefundableCredits: Decimal;   // Line 15

  lines: CalculatedLine[];
}

/** Calculate excess SS withholding when multiple employers */
export function calculateExcessSSWithholding(
  w2s: TaxYearInput["w2s"],
  ssWageBase: Decimal,
  ssRate: Decimal
): Decimal {
  // IRS Form 1040 Instructions: max SS withholding = $176,100 × 6.2% = $10,918.20 (exact, not rounded)
  // "You can take a credit for the amount withheld in excess of $10,918.20"
  const maxWithholding = ssWageBase.times(ssRate);
  const totalWithheld = w2s.reduce(
    (acc, w2) => acc.plus(d(w2.socialSecurityWithheld)),
    new Decimal(0)
  );
  return zeroFloor(totalWithheld.minus(maxWithholding));
}

export function calculateSchedule3(
  input: TaxYearInput,
  extra?: Schedule3Input
): Schedule3Result {
  const audit = new AuditTrail();

  // ── Part I: Nonrefundable Credits ─────────────────────

  const foreignTaxCredit = extra?.foreignTaxCredit ?? new Decimal(0);
  audit.record("Sched 3", "1", "Foreign tax credit", foreignTaxCredit, "Form 1116 or direct method");

  const childDependentCareCredit = extra?.childDependentCareCredit ?? new Decimal(0);
  audit.record("Sched 3", "2", "Child/dependent care credit", childDependentCareCredit, "Form 2441");

  const educationCredits = extra?.educationCredits ?? new Decimal(0);
  audit.record("Sched 3", "3", "Education credits", educationCredits, "Form 8863");

  const retirementSavingsCredit = extra?.retirementSavingsCredit ?? new Decimal(0);
  audit.record("Sched 3", "4", "Retirement savings contributions credit", retirementSavingsCredit, "Form 8880");

  const residentialCleanEnergyCredit = extra?.residentialCleanEnergyCredit ?? new Decimal(0);
  audit.record("Sched 3", "5a", "Residential clean energy credit", residentialCleanEnergyCredit, "Form 5695 Part I");

  const energyImprovementCredit = extra?.energyImprovementCredit ?? new Decimal(0);
  audit.record("Sched 3", "5b", "Energy improvement credit", energyImprovementCredit, "Form 5695 Part II");

  const priorYearMinimumTaxCredit = extra?.priorYearMinimumTaxCredit ?? new Decimal(0);
  audit.record("Sched 3", "6b", "Credit for prior year minimum tax", priorYearMinimumTaxCredit, "Form 8801");

  const generalBusinessCredit = extra?.generalBusinessCredit ?? new Decimal(0);
  audit.record("Sched 3", "6a", "General business credit", generalBusinessCredit, "Form 3800");

  const adoptionCredit = extra?.adoptionCredit ?? new Decimal(0);
  audit.record("Sched 3", "6c", "Adoption credit", adoptionCredit, "Form 8839");

  const elderlyOrDisabledCredit = extra?.elderlyOrDisabledCredit ?? new Decimal(0);
  audit.record("Sched 3", "6d", "Credit for the elderly or the disabled", elderlyOrDisabledCredit, "Schedule R");

  const newCleanVehicleCredit = extra?.newCleanVehicleCredit ?? new Decimal(0);
  audit.record("Sched 3", "6f", "New clean vehicle credit", newCleanVehicleCredit, "Form 8936 Part III");

  const previouslyOwnedCleanVehicleCredit = extra?.previouslyOwnedCleanVehicleCredit ?? new Decimal(0);
  audit.record("Sched 3", "6m", "Previously owned clean vehicle credit", previouslyOwnedCleanVehicleCredit, "Form 8936 Part IV");

  const totalNonrefundableCredits = sum(
    foreignTaxCredit,
    childDependentCareCredit,
    educationCredits,
    retirementSavingsCredit,
    residentialCleanEnergyCredit,
    energyImprovementCredit,
    priorYearMinimumTaxCredit,
    generalBusinessCredit,
    adoptionCredit,
    elderlyOrDisabledCredit,
    newCleanVehicleCredit,
    previouslyOwnedCleanVehicleCredit
  );
  const line6Subtotal = sum(priorYearMinimumTaxCredit, generalBusinessCredit, adoptionCredit,
    elderlyOrDisabledCredit, newCleanVehicleCredit, previouslyOwnedCleanVehicleCredit);
  audit.record("Sched 3", "7", "Other nonrefundable credit subtotal", line6Subtotal, "Supported lines 6a through 6m");
  audit.record("Sched 3", "8", "Total nonrefundable credits", totalNonrefundableCredits, "Lines 1 through 5b + line 7 → Form 1040 line 20");

  // ── Part II: Other Payments and Refundable Credits ────

  const netPremiumTaxCredit = extra?.netPremiumTaxCredit ?? new Decimal(0);
  audit.record("Sched 3", "9", "Net premium tax credit", netPremiumTaxCredit, "Form 8962");

  const extensionPayment = sum(...(input.adjustments?.extensionPayments ?? [])
    .filter(payment => payment.type === "federal").map(payment => d(payment.amount)));
  if (!extensionPayment.isFinite() || extensionPayment.lt(0)) throw new Error("Federal extension payment must be finite and nonnegative");
  audit.record("Sched 3", "10", "Amount paid with extension request", extensionPayment, "Actual federal extension payments, excluding fees");
  const excessSSWithholding = extra?.excessSocialSecurityWithholding ?? new Decimal(0);
  audit.record("Sched 3", "11", "Excess SS withholding", excessSSWithholding, "Multiple employer refund");

  const additionalChildTaxCredit = extra?.additionalChildTaxCredit ?? new Decimal(0);


  const aocRefundablePortion = extra?.aocRefundablePortion ?? new Decimal(0);


  const totalRefundableCredits = sum(
    netPremiumTaxCredit,
    extensionPayment,
    excessSSWithholding
  );
  audit.record("Sched 3", "14", "Other payment subtotal", new Decimal(0), "No supported line 13 payment input");
  audit.record("Sched 3", "15", "Total refundable credits", totalRefundableCredits, "Sum Lines 9-14 → 1040 Line 31");

  return {
    foreignTaxCredit,
    childDependentCareCredit,
    educationCredits,
    retirementSavingsCredit,
    residentialCleanEnergyCredit,
    energyImprovementCredit,
    priorYearMinimumTaxCredit,
    generalBusinessCredit,
    adoptionCredit,
    elderlyOrDisabledCredit,
    newCleanVehicleCredit,
    previouslyOwnedCleanVehicleCredit,
    totalNonrefundableCredits,
    extensionPayment,
    netPremiumTaxCredit,
    excessSSWithholding,
    additionalChildTaxCredit,
    aocRefundablePortion,
    totalRefundableCredits,
    lines: audit.getLines(),
  };
}
