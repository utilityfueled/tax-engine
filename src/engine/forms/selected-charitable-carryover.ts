/** Actual selected-year treatment, distinct from the ScheduleA candidate. */
import Decimal from "decimal.js";
import type { ScheduleAResult, CharitableCarryforwardEntry, CharitableCarryforwardYearDetail } from "@/engine/schedules/schedule-a.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";
export interface SelectedCharitableCarryover {
  deductionMethod: "standard" | "itemized" | "nonitemized";
  deduction: Decimal;
  priorDeduction: Decimal;
  priorTreatedAsPaid: Decimal;
  detail: CharitableCarryforwardYearDetail[];
  carryforwards: CharitableCarryforwardEntry[];
  lines: CalculatedLine[];
}
export function calculateSelectedCharitableCarryover(input: {
  taxYear: number; deductionMethod: "standard" | "itemized" | "nonitemized"; scheduleA: ScheduleAResult;
}): SelectedCharitableCarryover {
  const nonitemized = input.scheduleA.nonitemizedCharitableCarryover;
  const current = input.scheduleA.currentCharitableCandidates;
  const priorCashProperty = input.scheduleA.priorCashCurrentProperty;
  const separatePriorFloor = input.taxYear === 2026 && priorCashProperty?.method === "2026_prior_cash_current_property";
  const currentOnly = input.taxYear === 2026 && (current?.method === "2026_current_public_cash_dual"
    || current?.method === "2026_current_public_cash_and_property_dual")
    && input.scheduleA.charitableCarryforwardDetail.length === 0;
  if (input.taxYear !== 2025 && !currentOnly && !separatePriorFloor && (input.taxYear !== 2026 || !nonitemized
    || nonitemized.method !== "2026_nonitemized_public_cash" || input.deductionMethod === "itemized"
    || nonitemized.deductionMethod !== input.deductionMethod)) {
    throw new Error("Selected charitable history requires its separate2026 floor and nonitemizer method");
  }
  const detail = input.scheduleA.charitableCarryforwardDetail.map(row => {
    if (!row.medium || !row.category || row.treatedAsPaid === undefined || !row.treatedAsPaid.isFinite()
      || row.treatedAsPaid.lt(0) || !row.amountAvailable.eq(row.treatedAsPaid.plus(row.amountRemaining).plus(row.amountExpired))) {
      throw new Error("Selected charitable treatment requires complete actual source reconciliation");
    }
    return { ...row, amountUsed: input.deductionMethod === "itemized" ? row.treatedAsPaid : d("0") };
  });
  const deduction = input.deductionMethod === "itemized" ? input.scheduleA.charitableTotal
    : input.taxYear === 2026 ? input.scheduleA.nonitemizerCharitableDeduction : d("0");
  const priorDeduction = sum(...detail.map(row => row.amountUsed));
  const priorTreatedAsPaid = sum(...detail.map(row => row.treatedAsPaid ?? d("0")));
  const carryforwards = currentOnly && input.deductionMethod !== "itemized"
    ? current.nonitemizedCarryforwards : separatePriorFloor && input.deductionMethod !== "itemized"
      ? priorCashProperty.nonitemizedCarryforwards : input.scheduleA.charitableCarryforwardByYear;
  const audit = new AuditTrail();
  audit.record("Charitable Carryover", "selected-deduction", "Charity under the final deduction method", deduction,
    input.deductionMethod === "itemized" ? "Selected itemized deduction retains actual prior use"
      : input.taxYear === 2026 ? "Selected2026 nonitemization: current section170(p) deduction only; actual prior cash capacity is treated as paid without a deduction"
      : "Standard2025: no charitable deduction, but prior carry capacity is treated as paid",
    { "Actual prior deduction": priorDeduction, "Prior treated as paid": priorTreatedAsPaid });
  if (currentOnly || separatePriorFloor) audit.record(separatePriorFloor ? "Prior Cash Current Property" : "Current Charitable Candidates", "selected-carry", "Charitable carry under the final deduction method", sum(...carryforwards.map(row => row.amount)),
    input.deductionMethod === "itemized" ? "Actual itemized selection retains the eligible floor carry" : "Actual nonitemized selection uses percentage excess only");
  return { deductionMethod: input.deductionMethod, deduction, priorDeduction, priorTreatedAsPaid, detail,
    carryforwards: carryforwards.map(row => ({ ...row })), lines: audit.getLines() };
}
