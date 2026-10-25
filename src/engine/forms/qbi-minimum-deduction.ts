/** Section 199A(i). Spec: spec/federal/qbi-minimum-deduction.yaml. */
import Decimal from "decimal.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
export interface QBIMinimumInput {
  taxYear: number;
  ordinaryDeduction: Decimal;
  sources: { qbi: Decimal; materiallyParticipated?: boolean }[];
  priorYearQBILoss?: Decimal;
  priorYearActiveQBILoss?: Decimal;
}
export function calculateQBIMinimumDeduction(input: QBIMinimumInput): { deduction: Decimal; activeQBI?: Decimal; lines: CalculatedLine[] } {
  if (input.taxYear !== 2025 && input.taxYear !== 2026) throw new Error("Unsupported QBI minimum tax year");
  const audit = new AuditTrail();
  const { minimumDeduction, minimumActiveIncome } = FEDERAL_2026_CONSTANTS.qbi;
  if (input.taxYear === 2025 || input.ordinaryDeduction.gte(minimumDeduction)) return { deduction: input.ordinaryDeduction, lines: [] };
  let maximumPossibleActiveIncome = new Decimal(0);
  for (const source of input.sources) {
    if (!source.qbi.isFinite()) throw new Error("QBI source must be finite");
    maximumPossibleActiveIncome = maximumPossibleActiveIncome.plus(Decimal.max(0, source.qbi));
  }
  // If even all positive sources were active, the minimum could not apply.
  // Preserve a loss-only return without inventing historical participation.
  if (maximumPossibleActiveIncome.lt(minimumActiveIncome)) return { deduction: input.ordinaryDeduction, lines: [] };
  const priorLoss = input.priorYearQBILoss ?? new Decimal(0);
  if (!priorLoss.isFinite() || priorLoss.lt(0)) throw new Error("QBI loss carryover must be finite and nonnegative");
  if (priorLoss.gt(0) && input.priorYearActiveQBILoss === undefined) throw new Error("Active QBI carryover loss is unknown");
  const activePriorLoss = input.priorYearActiveQBILoss ?? new Decimal(0);
  if (!activePriorLoss.isFinite() || activePriorLoss.lt(0) || activePriorLoss.gt(priorLoss)) throw new Error("Active QBI carryover loss must be within total loss");
  let activeQBI = activePriorLoss.negated();
  for (const source of input.sources) {
    if (!source.qbi.isFinite()) throw new Error("QBI source must be finite");
    if (source.qbi.isZero()) continue;
    if (source.materiallyParticipated === undefined) throw new Error("QBI material participation is unknown");
    if (source.materiallyParticipated) activeQBI = activeQBI.plus(source.qbi);
  }
  const deduction = activeQBI.gte(minimumActiveIncome) ? Decimal.max(input.ordinaryDeduction, minimumDeduction) : input.ordinaryDeduction;
  audit.record("QBI Minimum WS", "active-income", "Aggregate active qualified business income", activeQBI, "Known materially participating qualified sources less known active loss carryover; no pre-threshold rounding");
  audit.record("QBI Minimum WS", "deduction", "Section 199A(i) minimum deduction", deduction, "If active QBI >= $1,000, max(ordinary subsection (a) deduction, $400); otherwise ordinary deduction");
  return { deduction, activeQBI, lines: audit.getLines() };
}
