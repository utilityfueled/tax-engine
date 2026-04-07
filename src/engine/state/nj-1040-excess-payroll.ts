/**
 * New Jersey NJ-1040 excess payroll contributions credit.
 * Spec: spec/state/nj-1040-excess-payroll.yaml
 *
 * Computes credit for excess UI/WF/SWF, DI, and FLI employee contributions
 * when a taxpayer had multiple NJ employers in the tax year. Each employer
 * withholds independently up to the wage base; the excess is refundable.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

/** Maximum annual employee contributions by category and year */
interface PayrollMaximums {
  /** Maximum combined UI/WF/SWF employee contribution */
  maxUIWFSWF: Decimal;
  /** Maximum DI employee contribution (state plan) */
  maxDI: Decimal;
  /** Maximum FLI employee contribution */
  maxFLI: Decimal;
}

const NJ_PAYROLL_MAXIMUMS: Record<number, PayrollMaximums> = {
  2025: {
    // Form NJ-2450 line 3 / NJ 2025 changes page
    maxUIWFSWF: new Decimal("184.02"),
    // State-plan DI maximum from Form NJ-2450 line 3 column B.
    // Private plan participants may provide a different annual maximum.
    maxDI: new Decimal("380.42"),
    // Form NJ-2450 line 3 column C.
    maxFLI: new Decimal("545.82"),
  },
};

export interface NJ1040ExcessPayrollInput {
  taxYear: number;
  /** Total UI/WF/SWF withheld across all W-2s */
  totalUIWFSWFWithheld?: Decimal | string | number;
  /** Total DI withheld across all W-2s */
  totalDIWithheld?: Decimal | string | number;
  /** Total FLI withheld across all W-2s */
  totalFLIWithheld?: Decimal | string | number;
  /**
   * Override for max DI if taxpayer is in a private plan with a different
   * maximum than the state plan. The NJ-1040 instructions provide the
   * private plan maximum as well.
   */
  privatePlanMaxDI?: Decimal | string | number;
}

export interface NJ1040ExcessPayrollResult {
  excessUIWFSWF: Decimal;
  excessDI: Decimal;
  excessFLI: Decimal;
  totalExcessPayroll: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040ExcessPayroll(
  input: NJ1040ExcessPayrollInput
): NJ1040ExcessPayrollResult {
  const audit = new AuditTrail();
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 excess payroll rules");

  const maximums = NJ_PAYROLL_MAXIMUMS[input.taxYear];
  if (!maximums) {
    throw new Error(`NJ-1040 payroll contribution maximums not available for ${input.taxYear}`);
  }

  // --- UI/WF/SWF ---
  const totalUIWFSWF = d(input.totalUIWFSWFWithheld);
  const excessUIWFSWF = zeroFloor(totalUIWFSWF.minus(maximums.maxUIWFSWF));

  audit.record(
    "NJ-1040",
    "59",
    "UI/WF/SWF credit from Form NJ-2450 line 4",
    excessUIWFSWF,
    "max(0, total withheld - maximum annual contribution)",
    {
      "Total withheld": totalUIWFSWF,
      "Maximum contribution": maximums.maxUIWFSWF,
    }
  );

  // --- DI ---
  const totalDI = d(input.totalDIWithheld);
  const effectiveMaxDI = input.privatePlanMaxDI !== undefined
    ? d(input.privatePlanMaxDI)
    : maximums.maxDI;
  const excessDI = zeroFloor(totalDI.minus(effectiveMaxDI));

  audit.record(
    "NJ-1040",
    "60",
    "Disability insurance credit from Form NJ-2450 line 5",
    excessDI,
    "max(0, total withheld - maximum annual contribution)",
    {
      "Total withheld": totalDI,
      "Maximum contribution": effectiveMaxDI,
      "Plan type": input.privatePlanMaxDI !== undefined ? "private" : "state",
    }
  );

  // --- FLI ---
  const totalFLI = d(input.totalFLIWithheld);
  const excessFLI = zeroFloor(totalFLI.minus(maximums.maxFLI));

  audit.record(
    "NJ-1040",
    "61",
    "Family leave insurance credit from Form NJ-2450 line 6",
    excessFLI,
    "max(0, total withheld - maximum annual contribution)",
    {
      "Total withheld": totalFLI,
      "Maximum contribution": maximums.maxFLI,
    }
  );

  // --- Total ---
  const totalExcessPayroll = sum(excessUIWFSWF, excessDI, excessFLI);

  audit.record(
    "NJ-1040",
    "59-61-total",
    "Total excess NJ payroll contributions credit across lines 59-61",
    totalExcessPayroll,
    "Excess UI/WF/SWF + excess DI + excess FLI",
    {
      "Excess UI/WF/SWF": excessUIWFSWF,
      "Excess DI": excessDI,
      "Excess FLI": excessFLI,
    }
  );

  return {
    excessUIWFSWF,
    excessDI,
    excessFLI,
    totalExcessPayroll,
    lines: audit.getLines(),
  };
}
