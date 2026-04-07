/**
 * Form 3903 — Moving Expenses (Armed Forces only, 2018–2025)
 * Spec: spec/federal/form-3903.yaml
 *
 * Computes the deductible moving expenses for active-duty Armed Forces
 * members moving pursuant to a military order for a permanent change of
 * station. IRC §217(k) preserves this deduction during the TCJA
 * suspension period (2018–2025).
 *
 * Multiple moves in a tax year are aggregated into one deduction on
 * Schedule 1 Line 14.
 */

import Decimal from "decimal.js";
import type { Form3903Input, Form3903Move } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface Form3903MoveResult {
  line1: Decimal; // Transportation and storage
  line2: Decimal; // Travel and lodging
  line3: Decimal; // Total expenses (Line 1 + Line 2)
  line4: Decimal; // Reimbursements excluded from income
  line5: Decimal; // Deductible moving expenses (max(0, Line 3 - Line 4))
}

export interface Form3903Result {
  /** Per-move results (one Form 3903 per move) */
  moveResults: Form3903MoveResult[];
  /** Combined deductible amount → Schedule 1 Line 14 */
  totalDeductible: Decimal;
  lines: CalculatedLine[];
}

function calculateMove(move: Form3903Move): Form3903MoveResult {
  const line1 = Decimal.max(ZERO, d(move.transportationAndStorage));
  const line2 = Decimal.max(ZERO, d(move.travelAndLodging));
  const line3 = line1.plus(line2);
  const line4 = Decimal.max(ZERO, d(move.reimbursementsExcludedFromIncome));
  const line5 = Decimal.max(ZERO, line3.minus(line4));

  return { line1, line2, line3, line4, line5 };
}

export function calculateForm3903(input: Form3903Input): Form3903Result {
  const audit = new AuditTrail();
  const moveResults = input.moves.map((move) => calculateMove(move));

  for (const [i, mr] of moveResults.entries()) {
    const label = moveResults.length === 1 ? "" : ` (Move ${i + 1})`;

    audit.record("Form 3903", `1${label}`,
      "Transportation and storage of household goods and personal effects",
      mr.line1, "Qualified transportation and storage costs");

    audit.record("Form 3903", `2${label}`,
      "Travel and lodging from old home to new home",
      mr.line2, "Qualified travel and lodging (meals not deductible post-2017)");

    audit.record("Form 3903", `3${label}`,
      "Total moving expenses",
      mr.line3, "Line 1 + Line 2", {
        "Line 1": mr.line1,
        "Line 2": mr.line2,
      });

    audit.record("Form 3903", `4${label}`,
      "Reimbursements excluded from income",
      mr.line4, "Employer/government reimbursements not included in W-2 wages (e.g., W-2 Box 12 Code P)");

    audit.record("Form 3903", `5${label}`,
      "Deductible moving expenses",
      mr.line5, "max(0, Line 3 - Line 4)", {
        "Line 3": mr.line3,
        "Line 4": mr.line4,
      });
  }

  const totalDeductible = moveResults.reduce(
    (acc, mr) => acc.plus(mr.line5),
    ZERO
  );

  if (moveResults.length > 1) {
    audit.record("Form 3903", "total",
      "Combined deductible moving expenses from all moves → Schedule 1 Line 14",
      totalDeductible,
      `Sum of deductible amounts from ${moveResults.length} moves`);
  }

  return {
    moveResults,
    totalDeductible,
    lines: audit.getLines(),
  };
}
