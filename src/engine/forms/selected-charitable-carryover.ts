/** Actual selected-year treatment, distinct from the ScheduleA candidate. */
import Decimal from "decimal.js";
import type { ScheduleAResult, CharitableCarryforwardEntry, CharitableCarryforwardYearDetail } from "@/engine/schedules/schedule-a.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";
export interface SelectedCharitableCarryover {
  deductionMethod: "standard" | "itemized";
  deduction: Decimal;
  priorDeduction: Decimal;
  priorTreatedAsPaid: Decimal;
  detail: CharitableCarryforwardYearDetail[];
  carryforwards: CharitableCarryforwardEntry[];
  lines: CalculatedLine[];
}
export function calculateSelectedCharitableCarryover(input: {
  taxYear: number; deductionMethod: "standard" | "itemized"; scheduleA: ScheduleAResult;
}): SelectedCharitableCarryover {
  if (input.taxYear !== 2025) throw new Error("Selected charitable history requires its separate2026 floor and nonitemizer method");
  const detail = input.scheduleA.charitableCarryforwardDetail.map(row => {
    if (!row.medium || !row.category || row.treatedAsPaid === undefined || !row.treatedAsPaid.isFinite()
      || row.treatedAsPaid.lt(0) || !row.amountAvailable.eq(row.treatedAsPaid.plus(row.amountRemaining).plus(row.amountExpired))) {
      throw new Error("Selected charitable treatment requires complete actual source reconciliation");
    }
    return { ...row, amountUsed: input.deductionMethod === "itemized" ? row.treatedAsPaid : d("0") };
  });
  const deduction = input.deductionMethod === "itemized" ? input.scheduleA.charitableTotal : d("0");
  const priorDeduction = sum(...detail.map(row => row.amountUsed));
  const priorTreatedAsPaid = sum(...detail.map(row => row.treatedAsPaid ?? d("0")));
  const audit = new AuditTrail();
  audit.record("Charitable Carryover", "selected-deduction", "Charity under the final deduction method", deduction,
    input.deductionMethod === "itemized" ? "Selected itemized deduction retains actual prior use" : "Standard2025: no charitable deduction, but prior carry capacity is treated as paid",
    { "Actual prior deduction": priorDeduction, "Prior treated as paid": priorTreatedAsPaid });
  return { deductionMethod: input.deductionMethod, deduction, priorDeduction, priorTreatedAsPaid, detail,
    carryforwards: input.scheduleA.charitableCarryforwardByYear.map(row => ({ ...row })), lines: audit.getLines() };
}
