/** Binds section 112 source amounts before the federal Schedule 8812 calculation. */
import type { TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

export function resolveForm8812CombatPay(input: TaxYearInput) {
  const { w2s, taxpayer } = input;
  const legacyAmount = d(input.childTaxCredit?.nonTaxableCombatPayElection);
  const combatPayReported = legacyAmount.gt(0) || w2s.some(w2 =>
    d(w2.box12CodeQ).gt(0) || w2.militaryService?.combatOrHazardousDutyPay === true,
  );
  if (!combatPayReported && (w2s.length === 0 || w2s.some(w2 => w2.box12CodeQ === undefined))) return undefined;
  const joint = taxpayer.filingStatus === "married_filing_jointly";
  let total = d(0);
  for (const w2 of w2s) {
    if (w2.box12CodeQ === undefined) {
      throw new Error("Confirm actual combat pay or the absence of Code Q on every W-2");
    }
    const amount = d(w2.box12CodeQ);
    if (amount.gt(0) && (w2.taxYear !== taxpayer.taxYear ||
      (w2.accountHolder !== "primary" && !(joint && w2.accountHolder === "spouse")))) {
      throw new Error("Schedule 8812 requires the matching original W-2 year and owner for Code Q");
    }
    total = total.plus(amount);
  }
  if (legacyAmount.gt(0) && !total.eq(legacyAmount)) {
    throw new Error("The saved combat pay amount must match the sum of original W-2 Code Q amounts or be corrected");
  }
  return total;
}
