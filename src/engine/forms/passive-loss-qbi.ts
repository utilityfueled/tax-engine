/** Actual rental loss history under Reg1.199A-3(b)(1)(iv).
 * Spec: spec/federal/passive-loss-qbi.yaml. All loss amounts are positive here.
 */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

type Tracking = NonNullable<TaxYearInput["priorYear"]>["suspendedPassiveLosses"][number]["qbiLossTracking"];
export interface PassiveLossQBIVintage {
  taxYear: number;
  originalLoss: Decimal;
  qualifiedOriginalLoss: Decimal;
  remainingLoss: Decimal;
  qualifiedRemainingLoss: Decimal;
}
export interface PassiveLossQBIResult {
  currentYearQbi: Decimal;
  priorQualifiedLoss: Decimal;
  /** Unknown participation stays unknown until material to the 2026 minimum. */
  priorActiveQualifiedLoss?: Decimal;
  remainingVintages: PassiveLossQBIVintage[];
  lines: CalculatedLine[];
}

export function calculatePassiveLossQBI(input: {
  taxYear: number;
  activityName: string;
  currentIncome: Decimal;
  currentLoss: Decimal;
  priorLoss: Decimal;
  totalAllowedLoss: Decimal;
  currentQualifiesForQbi: boolean;
  tracking?: Tracking;
}): PassiveLossQBIResult {
  if (![2025, 2026].includes(input.taxYear) || !input.activityName.trim()) throw new Error("Passive QBI tracking requires an actual activity and supported year");
  if (typeof input.currentQualifiesForQbi !== "boolean") throw new Error("Passive QBI tracking requires actual current qualification");
  for (const amount of [input.currentIncome, input.currentLoss, input.priorLoss, input.totalAllowedLoss]) {
    if (!amount.isFinite() || amount.lt(0)) throw new Error("Passive QBI tracking amounts must be finite and nonnegative");
  }
  const currentIncome = roundDollar(input.currentIncome);
  const currentLoss = roundDollar(input.currentLoss);
  const priorLoss = roundDollar(input.priorLoss);
  const allowedLoss = roundDollar(input.totalAllowedLoss);
  if (currentIncome.gt(0) && currentLoss.gt(0)) throw new Error("Passive QBI tracking requires actual net current rental income or loss");
  if (allowedLoss.gt(currentLoss.plus(priorLoss))) throw new Error("Passive QBI allowed loss exceeds actual current and prior losses");
  const tracking = input.tracking;
  if (priorLoss.gt(0) && !tracking) throw new Error("Actual prior passive QBI loss tracking is required");
  if (tracking && (tracking.sourceTaxYear !== input.taxYear - 1 || tracking.sourceFactsConfirmed !== true || !tracking.sourceReference?.trim())) {
    throw new Error("Passive QBI tracking requires the confirmed actual prior-year source worksheet");
  }
  if (tracking && !Array.isArray(tracking.vintages)) throw new Error("Passive QBI tracking requires actual vintage history, including an explicit empty list when none");
  const whole = (value: string, label: string): Decimal => {
    if (value === undefined) throw new Error(`Passive QBI tracking requires actual ${label}`);
    const amount = d(value);
    if (!amount.isFinite() || amount.lt(0) || !amount.isInteger()) throw new Error(`Passive QBI ${label} must be an actual nonnegative filed whole-dollar balance`);
    return amount;
  };
  const vintages = (tracking?.vintages ?? []).map(row => {
    if (!Number.isInteger(row.taxYear) || row.taxYear < 1 || row.taxYear >= input.taxYear) throw new Error("Passive QBI tracking requires an actual earlier loss year");
    const originalLoss = whole(row.originalLoss, "original loss");
    const qualifiedOriginalLoss = whole(row.qualifiedOriginalLoss, "original qualified loss");
    const remainingLoss = whole(row.remainingLoss, "remaining loss");
    const qualifiedRemainingLoss = whole(row.qualifiedRemainingLoss, "remaining qualified loss");
    if (qualifiedOriginalLoss.gt(originalLoss) || qualifiedRemainingLoss.gt(remainingLoss)
      || remainingLoss.gt(originalLoss) || qualifiedRemainingLoss.gt(qualifiedOriginalLoss)
      || remainingLoss.minus(qualifiedRemainingLoss).gt(originalLoss.minus(qualifiedOriginalLoss))) {
      throw new Error("Passive QBI original and remaining qualified loss balances do not reconcile");
    }
    if (row.taxYear < 2018 && (qualifiedOriginalLoss.gt(0) || qualifiedRemainingLoss.gt(0))) throw new Error("Pre-2018 suspended losses cannot be qualified QBI losses");
    return { ...row, originalLoss, qualifiedOriginalLoss, remainingLoss, qualifiedRemainingLoss };
  }).sort((a, b) => a.taxYear - b.taxYear);
  if (new Set(vintages.map(row => row.taxYear)).size !== vintages.length) throw new Error("Passive QBI tracking requires unique loss-year vintages");
  if (!vintages.reduce((total, row) => total.plus(row.remainingLoss), d("0")).eq(priorLoss)) throw new Error("Passive QBI vintage balances must reconcile with actual Form8582 prior loss");

  const audit = new AuditTrail();
  let availableAllowed = allowedLoss;
  let priorQualifiedLoss = d("0");
  let priorActiveQualifiedLoss: Decimal | undefined = d("0");
  const remainingVintages: PassiveLossQBIVintage[] = [];
  for (const row of vintages) {
    const used = Decimal.min(availableAllowed, row.remainingLoss);
    // The printed fixed percentage is based on the originating loss, never
    // reconstructed from rounded remaining balances. Exhaustion consumes the
    // actual filed qualified remainder so no phantom carry can survive.
    const qualifiedUsed = used.eq(row.remainingLoss) ? row.qualifiedRemainingLoss
      : Decimal.min(row.qualifiedRemainingLoss, row.originalLoss.isZero() ? d("0")
        : roundDollar(used.times(row.qualifiedOriginalLoss).div(row.originalLoss)));
    const remainingLoss = row.remainingLoss.minus(used);
    const qualifiedRemainingLoss = row.qualifiedRemainingLoss.minus(qualifiedUsed);
    if (qualifiedRemainingLoss.gt(remainingLoss)) throw new Error("Passive QBI filed qualified balance requires actual prior-utilization reconciliation");
    availableAllowed = availableAllowed.minus(used);
    priorQualifiedLoss = priorQualifiedLoss.plus(qualifiedUsed);
    if (qualifiedUsed.gt(0)) {
      if (row.materiallyParticipatedInCurrentYear === undefined) priorActiveQualifiedLoss = undefined;
      else if (row.materiallyParticipatedInCurrentYear && priorActiveQualifiedLoss !== undefined) priorActiveQualifiedLoss = priorActiveQualifiedLoss.plus(qualifiedUsed);
    }
    if (remainingLoss.gt(0)) remainingVintages.push({ taxYear: row.taxYear, originalLoss: row.originalLoss,
      qualifiedOriginalLoss: row.qualifiedOriginalLoss, remainingLoss, qualifiedRemainingLoss });
    audit.record("Passive Loss QBI", `${input.activityName}:${row.taxYear}`, `Released prior qualified rental loss: ${input.activityName}`, qualifiedUsed,
      "FIFO actual prior losses; fixed original qualified fraction; pre2018 excluded; full use consumes actual qualified remainder",
      { "Original loss": row.originalLoss, "Original qualified loss": row.qualifiedOriginalLoss,
        "Opening loss": row.remainingLoss, "Opening qualified loss": row.qualifiedRemainingLoss, "Loss allowed": used,
        "Closing loss": remainingLoss, "Closing qualified loss": qualifiedRemainingLoss });
  }
  const currentAllowed = Decimal.min(currentLoss, availableAllowed);
  const currentYearQbi = input.currentQualifiesForQbi ? currentIncome.minus(currentAllowed) : d("0");
  const remainingCurrent = currentLoss.minus(currentAllowed);
  if (remainingCurrent.gt(0)) remainingVintages.push({ taxYear: input.taxYear, originalLoss: remainingCurrent,
    qualifiedOriginalLoss: input.currentQualifiesForQbi ? remainingCurrent : d("0"), remainingLoss: remainingCurrent,
    qualifiedRemainingLoss: input.currentQualifiesForQbi ? remainingCurrent : d("0") });
  audit.record("Passive Loss QBI", `${input.activityName}:current`, `Current rental QBI: ${input.activityName}`, currentYearQbi,
    "Qualified current rental income less current losses allowed after FIFO prior utilization; prior qualified losses transferred separately",
    { "Current income": currentIncome, "Current loss": currentLoss, "Current loss allowed": currentAllowed, "Prior qualified loss": priorQualifiedLoss });
  return { currentYearQbi, priorQualifiedLoss, priorActiveQualifiedLoss, remainingVintages, lines: audit.getLines() };
}
