/**
 * California Behavioral Health Services Tax.
 * Spec: spec/state/ca-behavioral-health-services-tax.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface CABehavioralHealthServicesTaxConstants {
  threshold: Decimal;
  rate: Decimal;
}

export const CA_BEHAVIORAL_HEALTH_SERVICES_TAX_CONSTANTS: Record<number, CABehavioralHealthServicesTaxConstants> = {
  2025: {
    threshold: new Decimal(1000000),
    rate: new Decimal(0.01),
  },
};

export interface CABehavioralHealthServicesTaxInput {
  taxableIncome: Decimal | string | number;
  taxYear: number;
  filingStatus?: FilingStatus;
  returnType?: "resident" | "nonresident";
}

export interface CABehavioralHealthServicesTaxResult {
  taxableIncomeBase: Decimal;
  threshold: Decimal;
  excessTaxableIncome: Decimal;
  rate: Decimal;
  tax: Decimal;
  lines: CalculatedLine[];
}

export function calculateCABehavioralHealthServicesTax(
  input: CABehavioralHealthServicesTaxInput
): CABehavioralHealthServicesTaxResult {
  const constants = CA_BEHAVIORAL_HEALTH_SERVICES_TAX_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`CA Behavioral Health Services Tax constants not available for ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const taxableIncomeBase = zeroFloor(d(input.taxableIncome));
  const returnType = input.returnType ?? "resident";

  audit.record(
    "CA-BHST",
    "1",
    "California taxable income base",
    taxableIncomeBase,
    returnType === "nonresident"
      ? "Form 540NR line 35 California taxable income"
      : "Form 540 line 19 taxable income",
    {
      "Return type": returnType,
      "Source line": returnType === "nonresident" ? "Form 540NR line 35" : "Form 540 line 19",
    }
  );

  audit.record(
    "CA-BHST",
    "2",
    "Behavioral Health Services Tax threshold",
    constants.threshold,
    "$1,000,000 threshold from the 2025 Form 540 and Form 540NR instructions",
    {
      "Filing status": input.filingStatus ?? "not provided",
    }
  );

  const excessTaxableIncome = zeroFloor(taxableIncomeBase.minus(constants.threshold));
  audit.record(
    "CA-BHST",
    "3",
    "Excess taxable income",
    excessTaxableIncome,
    "max(0, Line 1 - Line 2)",
    {
      "Line 1": taxableIncomeBase,
      "Line 2": constants.threshold,
    }
  );

  audit.record(
    "CA-BHST",
    "4",
    "Behavioral Health Services Tax rate",
    constants.rate,
    "1%"
  );

  const tax = roundDollar(excessTaxableIncome.times(constants.rate));
  audit.record(
    "CA-BHST",
    "5",
    "California Behavioral Health Services Tax",
    tax,
    "Line 3 × Line 4, rounded to the nearest whole dollar",
    {
      "Line 3": excessTaxableIncome,
      "Line 4": constants.rate,
      "Return type": returnType,
    }
  );

  return {
    taxableIncomeBase,
    threshold: constants.threshold,
    excessTaxableIncome,
    rate: constants.rate,
    tax,
    lines: audit.getLines(),
  };
}
