/** Schedule 8812 Credit Limit Worksheets A/B and Forms 8839/5695 limits.
 * Spec: spec/federal/form-1040.yaml, personal-credit-ordering.
 */
import Decimal from "decimal.js";
import { zeroFloor } from "@/utils/decimal.js";

export interface PersonalCreditOrderingInput {
  taxBeforeCredits: Decimal;
  earlierCredits: Decimal;
  ctcBeforeLimitation: Decimal;
  potentialActc: Decimal;
  qualifyingChildren: number;
  filesForm2555: boolean;
  adoptionAvailable: Decimal;
  cleanEnergyAvailable: Decimal;
}

export function calculatePersonalCreditOrdering(input: PersonalCreditOrderingInput) {
  for (const [name, value] of Object.entries(input)) {
    if (Decimal.isDecimal(value) && (!value.isFinite() || value.isNegative())) {
      throw new Error(`${name} must be finite and nonnegative`);
    }
  }
  if (!Number.isInteger(input.qualifyingChildren) || input.qualifyingChildren < 0) {
    throw new Error("Qualifying children must be a nonnegative integer");
  }
  const remainingTax = zeroFloor(input.taxBeforeCredits.minus(input.earlierCredits));
  const usesWorksheetB = input.qualifyingChildren > 0 && !input.filesForm2555
    && (input.adoptionAvailable.gt(0) || input.cleanEnergyAvailable.gt(0));
  // Worksheet B line 14 reserves the CTC that cannot become refundable.
  // Otherwise Forms 8839/5695 subtract the actual nonrefundable CTC first.
  const ctcReservation = usesWorksheetB
    ? zeroFloor(input.ctcBeforeLimitation.minus(input.potentialActc))
    : Decimal.min(input.ctcBeforeLimitation, remainingTax);
  const adoptionTaxLiability = zeroFloor(remainingTax.minus(ctcReservation));
  const adoptionCredit = Decimal.min(input.adoptionAvailable, adoptionTaxLiability);
  const cleanEnergyTaxLiability = zeroFloor(adoptionTaxLiability.minus(adoptionCredit));
  const cleanEnergyCredit = Decimal.min(input.cleanEnergyAvailable, cleanEnergyTaxLiability);
  const ctcTaxLiability = zeroFloor(remainingTax.minus(adoptionCredit).minus(cleanEnergyCredit));
  return { usesWorksheetB, ctcReservation, adoptionTaxLiability, adoptionCredit,
    cleanEnergyTaxLiability, cleanEnergyCredit, ctcTaxLiability };
}
