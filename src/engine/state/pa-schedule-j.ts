/**
 * Pennsylvania Schedule J — Income from Estates or Trusts
 * Spec: spec/state/pa-schedule-j.yaml
 *
 * Reports a resident beneficiary's income from estates or trusts that flows to
 * PA-40 Line 7. Negative statement amounts are disregarded because PA Schedule
 * J reports positive income amounts only.
 */

import Decimal from "decimal.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { PAScheduleJStatement } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";

const SUPPORTED_TAX_YEARS = new Set([2024, 2025, 2026]);

export interface ScheduleJInput {
  taxYear: number;
  statements?: readonly PAScheduleJStatement[];
}

export interface ScheduleJStatementResult extends PAScheduleJStatement {
  taxableIncome: Decimal;
  creditableNonresidentTaxWithheld: Decimal;
}

export interface ScheduleJResult {
  statements: ScheduleJStatementResult[];
  totalEstateTrustIncome: Decimal;
  totalNonresidentTaxWithheld: Decimal;
  lines: CalculatedLine[];
}

export function calculateScheduleJ(input: ScheduleJInput): ScheduleJResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`PA Schedule J constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const statements = (input.statements ?? []).map((statement, index) => {
    const taxableIncome = zeroFloor(d(statement.incomeAmount));
    const creditableNonresidentTaxWithheld =
      statement.sourceDocument === "pa_nrk_1"
        ? zeroFloor(d(statement.nonresidentTaxWithheld))
        : new Decimal(0);

    audit.record(
      "PA-Schedule-J",
      `c-${index + 1}`,
      `Income from ${statement.estateOrTrustName}`,
      taxableIncome,
      `Positive beneficiary income from ${statement.sourceDocument}`,
    );

    audit.record(
      "PA-Schedule-J",
      `withholding-${index + 1}`,
      `Nonresident withholding from ${statement.estateOrTrustName}`,
      creditableNonresidentTaxWithheld,
      statement.sourceDocument === "pa_nrk_1"
        ? "Positive PA-41 Schedule NRK-1 Line 2 withholding"
        : "Only PA-41 Schedule NRK-1 statements contribute withholding to PA-40 Line 17",
    );

    return {
      ...statement,
      taxableIncome,
      creditableNonresidentTaxWithheld,
    };
  });

  const totalEstateTrustIncome = sum(...statements.map((statement) => statement.taxableIncome));
  audit.record(
    "PA-Schedule-J",
    "total",
    "Total estate or trust income (PA-40 Line 7)",
    totalEstateTrustIncome,
    "Sum of positive Schedule J statement amounts",
  );

  const totalNonresidentTaxWithheld = sum(
    ...statements.map((statement) => statement.creditableNonresidentTaxWithheld),
  );
  audit.record(
    "PA-Schedule-J",
    "withholding-total",
    "Total nonresident withholding for PA-40 Line 17",
    totalNonresidentTaxWithheld,
    "Sum of positive PA-41 Schedule NRK-1 withholding amounts",
  );

  return {
    statements,
    totalEstateTrustIncome,
    totalNonresidentTaxWithheld,
    lines: audit.getLines(),
  };
}
