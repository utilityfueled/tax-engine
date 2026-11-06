/** Spec: spec/federal/itemized-deduction-limit.yaml; IRC 68. */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { min, roundDollar, zeroFloor } from "@/utils/decimal.js";
export interface ItemizedDeductionLimitInput {
  taxYear: number;
  itemizedDeductions: Decimal;
  /** Taxable income without section 68, plus otherwise allowable itemized deductions. */
  taxableIncomeBeforeItemized: Decimal;
  topBracketThreshold: Decimal;
}
export interface ItemizedDeductionLimitResult {
  reduction: Decimal;
  allowedDeduction: Decimal;
  lines: CalculatedLine[];
}
export function calculateItemizedDeductionLimit(input: ItemizedDeductionLimitInput): ItemizedDeductionLimitResult {
  if (input.taxYear !== 2025 && input.taxYear !== 2026) throw new Error("Unsupported itemized limitation tax year");
  if (![input.itemizedDeductions, input.taxableIncomeBeforeItemized, input.topBracketThreshold].every(value => value.isFinite()) || input.itemizedDeductions.lt(0) || input.topBracketThreshold.lt(0)) throw new Error("Invalid itemized limitation amounts");
  const audit = new AuditTrail();
  const excess = zeroFloor(input.taxableIncomeBeforeItemized.minus(input.topBracketThreshold));
  const reduction = input.taxYear === 2026 ? roundDollar(min(input.itemizedDeductions, excess).times(2).div(37)) : new Decimal(0);
  const allowedDeduction = zeroFloor(input.itemizedDeductions.minus(reduction));
  audit.record("Itemized Limit WS", "reduction", "Overall itemized deduction reduction", reduction,
    input.taxYear === 2026 ? "2/37 × min(otherwise allowed itemized deductions, income over top bracket threshold)" : "Section 68 suspended for 2025", { itemizedDeductions: input.itemizedDeductions, excess });
  audit.record("Itemized Limit WS", "allowed", "Itemized deductions after overall limit", allowedDeduction, "Otherwise allowed itemized deductions minus section 68 reduction");
  return { reduction, allowedDeduction, lines: audit.getLines() };
}
