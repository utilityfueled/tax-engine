/**
 * Form 3903 — Moving expenses and taxable reimbursements.
 * Specs: spec/federal/form-3903.yaml and spec/federal/form-3903-2026.yaml.
 */

import Decimal from "decimal.js";
import { Form3903Schema, type Form3903Input, type Form3903Move } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const JULY_2026 = "2026-07-01";
const MOVING_MILEAGE_BEFORE_JULY = new Decimal("0.205");
const MOVING_MILEAGE_FROM_JULY = new Decimal("0.235");

type AnnualMove = Extract<Form3903Input, { taxYear: 2026 }>["moves"][number];

export interface Form3903MoveResult {
  line1: Decimal; // Transportation and storage
  line2: Decimal; // Travel and lodging
  line3: Decimal; // Total expenses (Line 1 + Line 2)
  line4: Decimal; // Qualifying reimbursements absent from W-2 Box 1
  line5: Decimal; // Deductible moving expenses (max(0, Line 3 - Line 4))
  /** Excess on Form 1040 Line 1h, unavailable for an unconfirmed positive difference. */
  taxableReimbursement?: Decimal;
}

export interface Form3903Result {
  /** Per-move results (one Form 3903 per move) */
  moveResults: Form3903MoveResult[];
  /** Combined deductible amount → Schedule 1 Line 14 */
  totalDeductible: Decimal;
  /** Unavailable if a positive difference needs confirmation from the original sources. */
  totalTaxableReimbursement?: Decimal;
  lines: CalculatedLine[];
}

function calculateMove(move: Form3903Move, travel?: Decimal): Form3903MoveResult {
  const line1 = Decimal.max(ZERO, d(move.transportationAndStorage));
  const line2 = travel ?? Decimal.max(ZERO, d(move.travelAndLodging));
  const line3 = line1.plus(line2);
  const line4 = Decimal.max(ZERO, d(move.reimbursementsExcludedFromIncome));
  const line5 = Decimal.max(ZERO, line3.minus(line4));

  const excess = Decimal.max(ZERO, line4.minus(line3));
  const complete = move.lineAmountsConfirmed === true
    && [move.transportationAndStorage, travel ?? move.travelAndLodging, move.reimbursementsExcludedFromIncome]
      .every(value => value !== undefined && d(value).isFinite() && d(value).gte(0));
  const taxableReimbursement = excess.isZero() || complete ? excess : undefined;
  return { line1, line2, line3, line4, line5, taxableReimbursement };
}

function calculateTravel({ transportationAndLodging, vehicle }: AnnualMove["travel"]): {
  total: Decimal;
  inputs: Record<string, Decimal>;
} {
  const otherTravel = d(transportationAndLodging);
  if (vehicle.method === "none") return { total: otherTravel, inputs: { otherTravel } };
  const parkingAndTolls = d(vehicle.parkingAndTolls);
  if (vehicle.method === "actual") {
    const gasAndOil = d(vehicle.gasAndOil);
    return { total: otherTravel.plus(parkingAndTolls).plus(gasAndOil), inputs: { otherTravel, parkingAndTolls, gasAndOil } };
  }
  let milesBeforeJuly = ZERO;
  let milesFromJuly = ZERO;
  for (const entry of vehicle.entries) {
    if (entry.date < JULY_2026) milesBeforeJuly = milesBeforeJuly.plus(entry.miles);
    else milesFromJuly = milesFromJuly.plus(entry.miles);
  }
  const mileageBeforeJuly = milesBeforeJuly.times(MOVING_MILEAGE_BEFORE_JULY);
  const mileageFromJuly = milesFromJuly.times(MOVING_MILEAGE_FROM_JULY);
  return {
    total: otherTravel.plus(parkingAndTolls).plus(mileageBeforeJuly).plus(mileageFromJuly),
    inputs: { otherTravel, parkingAndTolls, milesBeforeJuly, milesFromJuly, mileageBeforeJuly, mileageFromJuly },
  };
}

export function calculateForm3903(input: Form3903Input, taxYear: number = input.taxYear ?? 2025): Form3903Result {
  if (input.taxYear !== undefined && input.taxYear !== taxYear) throw new Error("Form 3903 source year differs from the return year.");
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Form 3903 calculation is unavailable for this return year.");
  if (taxYear === 2026 && input.taxYear !== 2026) throw new Error("2026 moving expenses require confirmed Form 3903 sources.");
  const sources = Form3903Schema.parse(input);
  const audit = new AuditTrail();
  const annualMoves = sources.taxYear === 2026 ? sources.moves : undefined;
  const travel = annualMoves?.map(move => calculateTravel(move.travel));
  const moveResults = sources.moves.map((move, index) => calculateMove(move, travel?.[index]?.total));
  let totalTaxableReimbursement: Decimal | undefined = ZERO;

  for (const [i, mr] of moveResults.entries()) {
    const label = moveResults.length === 1 ? "" : ` (Move ${i + 1})`;

    audit.record("Form 3903", `1${label}`,
      "Transportation and storage of household goods and personal effects",
      mr.line1, "Qualified transportation and storage costs");

    const annualMove = annualMoves?.[i];
    if (annualMove?.omittedTaxableExcess !== undefined && !d(annualMove.omittedTaxableExcess).eq(mr.taxableReimbursement ?? ZERO)) {
      if ((mr.taxableReimbursement?.decimalPlaces() ?? 0) > 2) {
        throw new Error("Form 3903 mileage leaves a fraction of a cent. The documented taxable moving excess needs a separate method to reconcile payroll cents.");
      }
      throw new Error("The documented taxable moving excess must reconcile to Form 3903 Lines 3 and 4.");
    }
    if (annualMove) audit.record("Form 3903", `eligibility${label}`, "Confirmed moving eligibility",
      new Decimal(1), annualMove.eligibility.kind, { moveDate: annualMove.date });
    audit.record("Form 3903", `2${label}`,
      "Travel and lodging from old home to new home",
      mr.line2, annualMove ? `Confirmed travel, vehicle method: ${annualMove.travel.vehicle.method}` : "Qualified travel and lodging (meals not deductible post-2017)",
      travel?.[i]?.inputs);

    audit.record("Form 3903", `3${label}`,
      "Total moving expenses",
      mr.line3, "Line 1 + Line 2", {
        "Line 1": mr.line1,
        "Line 2": mr.line2,
      });

    audit.record("Form 3903", `4${label}`,
      "Qualifying reimbursements absent from W-2 wages",
      mr.line4, "Employer/government reimbursements not included in W-2 wages (e.g., W-2 Box 12 Code P)");

    audit.record("Form 3903", `5${label}`,
      "Deductible moving expenses",
      mr.line5, "max(0, Line 3 - Line 4)", {
        "Line 3": mr.line3,
        "Line 4": mr.line4,
      });
    if (mr.taxableReimbursement === undefined) {
      totalTaxableReimbursement = undefined;
    } else if (mr.taxableReimbursement.gt(0)) {
      totalTaxableReimbursement = totalTaxableReimbursement?.plus(mr.taxableReimbursement);
      audit.record("Form 3903", `excess${label}`, "Taxable reimbursement → Form 1040 Line 1h",
        mr.taxableReimbursement, "max(0, Line 4 - Line 3)", { "Line 4": mr.line4, "Line 3": mr.line3 });
    }
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
    totalTaxableReimbursement,
    lines: audit.getLines(),
  };
}
