/** Reg1.199A-3(b)(1)(iv), one actual activity and one suspending provision.
 * Spec: spec/federal/qbi-loss-character.yaml. Loss amounts are positive here.
 * Calculated allowances are engine context, never taxpayer-entered overrides.
 */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";

export type QbiLossLimitation = "704(d)" | "1366(d)" | "465" | "469" | "461(l)";
export interface QbiLossVintageSource {
  taxYear: number;
  originalLoss: string;
  qualifiedOriginalLoss: string;
  remainingLoss: string;
  qualifiedRemainingLoss: string;
  materiallyParticipatedInCurrentYear?: boolean;
}
export interface QbiLossHistorySource {
  sourceTaxYear: number;
  sourceReference: string;
  sourceFactsConfirmed?: boolean;
  vintages: QbiLossVintageSource[];
}
export interface QbiLossCharacterInput {
  taxYear: number;
  activitySourceId: string;
  limitation: QbiLossLimitation;
  /** Original current loss and its otherwise-qualified share, before this limit. */
  currentLoss: Decimal;
  currentQualifiedLoss: Decimal;
  /** Actual regular opening balance bound by the canonical source resolver. */
  priorLoss: Decimal;
  /** Result of the canonical loss limitation, including current and prior loss. */
  calculatedAllowedLoss: Decimal;
  history: QbiLossHistorySource;
}
export interface QbiLossCharacterVintage {
  taxYear: number;
  originalLoss: Decimal;
  qualifiedOriginalLoss: Decimal;
  remainingLoss: Decimal;
  qualifiedRemainingLoss: Decimal;
}
export interface QbiLossCharacterResult {
  taxYear: number;
  activitySourceId: string;
  limitation: QbiLossLimitation;
  sourceCurrentLoss: Decimal;
  sourceCurrentQualifiedLoss: Decimal;
  currentAllowedLoss: Decimal;
  currentQualifiedLossAllowed: Decimal;
  priorLossAllowed: Decimal;
  priorQualifiedLossAllowed: Decimal;
  priorActiveQualifiedLossAllowed?: Decimal;
  allowedPriorVintages: Array<{
    taxYear: number;
    lossAllowed: Decimal;
    qualifiedLossAllowed: Decimal;
    materiallyParticipatedInCurrentYear?: boolean;
  }>;
  remainingVintages: QbiLossCharacterVintage[];
  lines: CalculatedLine[];
}

export function calculateQbiLossCharacter(input: QbiLossCharacterInput): QbiLossCharacterResult {
  if (!Number.isInteger(input.taxYear) || input.taxYear < 2018 || input.taxYear > 2026
    || typeof input.activitySourceId !== "string" || !input.activitySourceId.trim()
    || !["704(d)", "1366(d)", "465", "469", "461(l)"].includes(input.limitation)) {
    throw new Error("QBI loss character requires an actual activity, supported year and suspending Code provision.");
  }
  for (const amount of [input.currentLoss, input.currentQualifiedLoss, input.priorLoss, input.calculatedAllowedLoss]) {
    if (!(amount instanceof Decimal) || !amount.isFinite() || amount.lt(0)) {
      throw new Error("QBI loss character amounts must be finite and nonnegative.");
    }
  }
  if (input.currentQualifiedLoss.gt(input.currentLoss)) throw new Error("Current qualified loss exceeds its actual total loss.");
  if (!input.priorLoss.isInteger()) throw new Error("QBI opening history requires a filed whole-dollar balance.");
  const currentLoss = roundDollar(input.currentLoss);
  const allowedLoss = roundDollar(input.calculatedAllowedLoss);
  if (allowedLoss.gt(currentLoss.plus(input.priorLoss))) throw new Error("Calculated loss allowance exceeds actual current and prior loss.");
  const history = input.history;
  if (!history || history.sourceTaxYear !== input.taxYear - 1 || history.sourceFactsConfirmed !== true
    || typeof history.sourceReference !== "string" || !history.sourceReference.trim() || !Array.isArray(history.vintages)) {
    throw new Error("QBI loss history requires a confirmed preceding-year source and explicit vintage list, including none.");
  }
  const whole = (value: string): Decimal => {
    if (typeof value !== "string" || !value.trim()) throw new Error("QBI loss history requires actual source amounts.");
    let amount: Decimal;
    try { amount = d(value); } catch { throw new Error("QBI loss history requires finite nonnegative whole-dollar balances."); }
    if (!amount.isFinite() || amount.lt(0) || !amount.isInteger()) throw new Error("QBI loss history requires finite nonnegative whole-dollar balances.");
    return amount;
  };
  const vintages = history.vintages.map(row => {
    if (!Number.isInteger(row.taxYear) || row.taxYear < 1 || row.taxYear >= input.taxYear) {
      throw new Error("QBI loss history requires an actual earlier origin year.");
    }
    const originalLoss = whole(row.originalLoss);
    const qualifiedOriginalLoss = whole(row.qualifiedOriginalLoss);
    const remainingLoss = whole(row.remainingLoss);
    const qualifiedRemainingLoss = whole(row.qualifiedRemainingLoss);
    if (qualifiedOriginalLoss.gt(originalLoss) || qualifiedRemainingLoss.gt(remainingLoss)
      || remainingLoss.gt(originalLoss) || qualifiedRemainingLoss.gt(qualifiedOriginalLoss)
      || remainingLoss.minus(qualifiedRemainingLoss).gt(originalLoss.minus(qualifiedOriginalLoss))) {
      throw new Error("QBI loss history must conserve original and remaining qualified and nonqualified balances.");
    }
    if (row.taxYear < 2018 && (qualifiedOriginalLoss.gt(0) || qualifiedRemainingLoss.gt(0))) {
      throw new Error("Pre-2018 losses cannot carry qualified loss character.");
    }
    if (row.materiallyParticipatedInCurrentYear !== undefined && typeof row.materiallyParticipatedInCurrentYear !== "boolean") {
      throw new Error("QBI loss history participation must be an actual boolean or unknown.");
    }
    return { ...row, originalLoss, qualifiedOriginalLoss, remainingLoss, qualifiedRemainingLoss };
  }).sort((a, b) => a.taxYear - b.taxYear);
  if (new Set(vintages.map(row => row.taxYear)).size !== vintages.length) throw new Error("QBI loss history requires unique origin years for each Code provision.");
  if (!sum(...vintages.map(row => row.remainingLoss)).eq(input.priorLoss)) throw new Error("QBI history must reconcile with its actual opening loss balance.");

  const audit = new AuditTrail();
  const identity = { "Code provision": input.limitation, "Activity source": input.activitySourceId };
  const remainingVintages: QbiLossCharacterVintage[] = [];
  const allowedPriorVintages: QbiLossCharacterResult["allowedPriorVintages"] = [];
  let availableAllowed = allowedLoss;
  let priorLossAllowed = d("0");
  let priorQualifiedLossAllowed = d("0");
  let priorActiveQualifiedLossAllowed: Decimal | undefined = d("0");
  for (const row of vintages) {
    const lossAllowed = Decimal.min(row.remainingLoss, availableAllowed);
    const qualifiedLossAllowed = lossAllowed.eq(row.remainingLoss) ? row.qualifiedRemainingLoss
      : Decimal.min(row.qualifiedRemainingLoss, row.originalLoss.isZero() ? d("0")
        : roundDollar(lossAllowed.times(row.qualifiedOriginalLoss).div(row.originalLoss)));
    const remainingLoss = row.remainingLoss.minus(lossAllowed);
    const qualifiedRemainingLoss = row.qualifiedRemainingLoss.minus(qualifiedLossAllowed);
    if (qualifiedRemainingLoss.gt(remainingLoss)) throw new Error("Filed qualified loss remainder requires actual utilization reconciliation.");
    availableAllowed = availableAllowed.minus(lossAllowed);
    priorLossAllowed = priorLossAllowed.plus(lossAllowed);
    priorQualifiedLossAllowed = priorQualifiedLossAllowed.plus(qualifiedLossAllowed);
    if (qualifiedLossAllowed.gt(0)) {
      if (row.materiallyParticipatedInCurrentYear === undefined) priorActiveQualifiedLossAllowed = undefined;
      else if (row.materiallyParticipatedInCurrentYear && priorActiveQualifiedLossAllowed !== undefined) {
        priorActiveQualifiedLossAllowed = priorActiveQualifiedLossAllowed.plus(qualifiedLossAllowed);
      }
    }
    if (lossAllowed.gt(0)) allowedPriorVintages.push({ taxYear: row.taxYear, lossAllowed, qualifiedLossAllowed,
      materiallyParticipatedInCurrentYear: row.materiallyParticipatedInCurrentYear });
    if (remainingLoss.gt(0)) remainingVintages.push({ taxYear: row.taxYear, originalLoss: row.originalLoss,
      qualifiedOriginalLoss: row.qualifiedOriginalLoss, remainingLoss, qualifiedRemainingLoss });
    audit.record("QBI Loss Character", `${input.activitySourceId}:${input.limitation}:${row.taxYear}`, "Prior qualified loss allowed", qualifiedLossAllowed,
      "FIFO; actual original qualified fraction; full utilization consumes actual filed qualified remainder",
      { ...identity, "Original loss": row.originalLoss, "Original qualified loss": row.qualifiedOriginalLoss,
        "Opening loss": row.remainingLoss, "Opening qualified loss": row.qualifiedRemainingLoss,
        "Allowed loss": lossAllowed, "Closing loss": remainingLoss, "Closing qualified loss": qualifiedRemainingLoss });
  }
  const currentAllowedLoss = Decimal.min(currentLoss, availableAllowed);
  const remainingCurrent = currentLoss.minus(currentAllowedLoss);
  const currentQualifiedLossAllowed = currentAllowedLoss.eq(currentLoss) ? roundDollar(input.currentQualifiedLoss)
    : input.currentLoss.isZero() ? d("0") : roundDollar(currentAllowedLoss.times(input.currentQualifiedLoss).div(input.currentLoss));
  const sourceRemainingCurrent = remainingCurrent.isZero() ? d("0") : input.currentLoss.minus(currentAllowedLoss);
  const remainingQualifiedCurrent = sourceRemainingCurrent.isZero() ? d("0")
    : roundDollar(sourceRemainingCurrent.times(input.currentQualifiedLoss).div(input.currentLoss));
  if (remainingCurrent.gt(0)) remainingVintages.push({ taxYear: input.taxYear, originalLoss: remainingCurrent,
    qualifiedOriginalLoss: remainingQualifiedCurrent, remainingLoss: remainingCurrent, qualifiedRemainingLoss: remainingQualifiedCurrent });
  audit.record("QBI Loss Character", `${input.activitySourceId}:${input.limitation}:current`, "Current qualified loss allowed", currentQualifiedLossAllowed,
    "Current allowance after FIFO prior use times exact current qualified/total source fraction; whole-dollar transfer",
    { ...identity, "Current source loss": input.currentLoss, "Current source qualified loss": input.currentQualifiedLoss,
      "Current allowed loss": currentAllowedLoss, "Current suspended loss": remainingCurrent,
      "Current suspended qualified loss": remainingQualifiedCurrent, "Prior qualified loss allowed": priorQualifiedLossAllowed });
  return { taxYear: input.taxYear, activitySourceId: input.activitySourceId, limitation: input.limitation,
    sourceCurrentLoss: input.currentLoss, sourceCurrentQualifiedLoss: input.currentQualifiedLoss,
    currentAllowedLoss, currentQualifiedLossAllowed, priorLossAllowed, priorQualifiedLossAllowed,
    priorActiveQualifiedLossAllowed, allowedPriorVintages, remainingVintages, lines: audit.getLines() };
}
