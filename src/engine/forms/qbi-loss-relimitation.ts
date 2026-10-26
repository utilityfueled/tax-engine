/** One unambiguously identified loss pool limited again by canonical Form461.
 * Spec: spec/federal/qbi-loss-relimitation.yaml.
 * Both arguments are calculated engine results; neither is an intake override.
 */
import Decimal from "decimal.js";
import type { Form461Result } from "@/engine/forms/form-461.js";
import type { QbiLossCharacterResult, QbiLossCharacterVintage } from "@/engine/forms/qbi-loss-character.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";

export interface QbiLossRelimitationContext {
  taxYear: number;
  form461: Pick<Form461Result, "taxYear" | "sourceFactsVerified" | "line14NetBusinessAmount"
    | "line15Threshold" | "line16NetAfterThreshold" | "line16ExcessBusinessLoss">;
  /** Complete calculated business amounts; all loss magnitudes are positive. */
  positiveBusinessIncome: Decimal;
  lossPools: Array<{ activitySourceId: string; loss: Decimal }>;
}
export interface QbiLossRelimitationResult {
  currentQualifiedLossAllowed: Decimal;
  priorQualifiedLossAllowed: Decimal;
  priorActiveQualifiedLossAllowed?: Decimal;
  excessBusinessLoss: Decimal;
  qualifiedExcessBusinessLoss: Decimal;
  /** QBI character only. It does not independently create an ordinary or AMT NOL. */
  excessBusinessLossVintage?: QbiLossCharacterVintage & { limitation: "461(l)"; activitySourceId: string };
  lines: CalculatedLine[];
}

export function calculateQbiLossRelimitation(source: QbiLossCharacterResult,
  context: QbiLossRelimitationContext): QbiLossRelimitationResult {
  const form = context.form461;
  if (source.taxYear !== context.taxYear || form.taxYear !== context.taxYear || ![2025, 2026].includes(context.taxYear)) {
    throw new Error("QBI re-suspension requires the same actual source and Form461 year.");
  }
  const amounts = [context.positiveBusinessIncome, form.line15Threshold, form.line16ExcessBusinessLoss,
    source.currentAllowedLoss, source.priorLossAllowed, source.currentQualifiedLossAllowed, source.priorQualifiedLossAllowed,
    ...context.lossPools.map(row => row.loss)];
  if (amounts.some(value => !(value instanceof Decimal) || !value.isFinite() || value.lt(0) || !value.isInteger())
    || !form.line14NetBusinessAmount.isFinite() || !form.line16NetAfterThreshold.isFinite()) {
    throw new Error("QBI re-suspension requires finite nonnegative calculated whole-dollar amounts.");
  }
  if (context.lossPools.some(row => !row.activitySourceId?.trim())
    || new Set(context.lossPools.map(row => row.activitySourceId)).size !== context.lossPools.length) {
    throw new Error("QBI re-suspension requires unique actual loss source identities.");
  }
  const lossPools = context.lossPools.filter(row => row.loss.gt(0));
  const net = context.positiveBusinessIncome.minus(sum(...lossPools.map(row => row.loss)));
  const expectedSigned = net.plus(form.line15Threshold);
  const ebl = form.line16ExcessBusinessLoss;
  if (!net.eq(form.line14NetBusinessAmount) || !expectedSigned.eq(form.line16NetAfterThreshold)
    || !ebl.eq(Decimal.max(0, expectedSigned.negated()))) {
    throw new Error("QBI calculated source pools must reconcile with actual Form461 lines14-16.");
  }
  const totalBefore = source.currentAllowedLoss.plus(source.priorLossAllowed);
  const pool = lossPools.find(row => row.activitySourceId === source.activitySourceId);
  if ((totalBefore.gt(0) && !pool) || (pool && !pool.loss.eq(totalBefore))) {
    throw new Error("QBI re-suspension requires the exact calculated loss source allowance.");
  }
  if (source.currentQualifiedLossAllowed.gt(source.currentAllowedLoss) || source.priorQualifiedLossAllowed.gt(source.priorLossAllowed)
    || !sum(...source.allowedPriorVintages.map(row => row.lossAllowed)).eq(source.priorLossAllowed)
    || !sum(...source.allowedPriorVintages.map(row => row.qualifiedLossAllowed)).eq(source.priorQualifiedLossAllowed)) {
    throw new Error("QBI calculated prior/current source character does not reconcile.");
  }
  if (ebl.isZero()) return { currentQualifiedLossAllowed: source.currentQualifiedLossAllowed,
    priorQualifiedLossAllowed: source.priorQualifiedLossAllowed,
    priorActiveQualifiedLossAllowed: source.priorActiveQualifiedLossAllowed,
    excessBusinessLoss: d("0"), qualifiedExcessBusinessLoss: d("0"), lines: [] };
  if (form.sourceFactsVerified !== true) throw new Error("Positive QBI re-suspension requires verified actual Form461 sources.");
  if (lossPools.length !== 1 || source.currentAllowedLoss.gt(0) && source.priorLossAllowed.gt(0)
    || source.allowedPriorVintages.filter(row => row.lossAllowed.gt(0)).length > 1) {
    throw new Error("Multiple loss pools or mixed current/prior origin EBL require their separate allocation method.");
  }
  if (ebl.gt(totalBefore)) throw new Error("QBI re-suspension exceeds its calculated loss source.");
  const audit = new AuditTrail();
  let currentQualifiedLossAllowed = source.currentQualifiedLossAllowed;
  let priorQualifiedLossAllowed = source.priorQualifiedLossAllowed;
  let priorActiveQualifiedLossAllowed = source.priorActiveQualifiedLossAllowed;
  let qualifiedExcessBusinessLoss: Decimal;
  const common = { "Activity source": source.activitySourceId, "Loss before EBL": totalBefore,
    "Form461 disallowed loss": ebl, "Form461 business net": form.line14NetBusinessAmount };
  if (source.currentAllowedLoss.gt(0)) {
    if (!source.sourceCurrentLoss.isFinite() || source.sourceCurrentLoss.lte(0)
      || !source.sourceCurrentQualifiedLoss.isFinite() || source.sourceCurrentQualifiedLoss.lt(0)
      || source.sourceCurrentQualifiedLoss.gt(source.sourceCurrentLoss)) throw new Error("Current QBI source loss must reconcile before EBL.");
    const finalAllowed = source.currentAllowedLoss.minus(ebl);
    currentQualifiedLossAllowed = roundDollar(finalAllowed.times(source.sourceCurrentQualifiedLoss).div(source.sourceCurrentLoss));
    qualifiedExcessBusinessLoss = source.currentQualifiedLossAllowed.minus(currentQualifiedLossAllowed);
    audit.record("QBI EBL Character", `${source.activitySourceId}:current`, "Current qualified loss after EBL", currentQualifiedLossAllowed,
      "Final calculated current allowance times exact original qualified fraction; re-suspended share conserves preceding qualified transfer",
      { ...common, "Original current loss": source.sourceCurrentLoss, "Original current qualified loss": source.sourceCurrentQualifiedLoss,
        "Final current loss allowed": finalAllowed, "Qualified EBL": qualifiedExcessBusinessLoss });
  } else {
    const row = source.allowedPriorVintages.find(row => row.lossAllowed.gt(0));
    if (!row) throw new Error("Prior QBI re-suspension requires its actual released origin.");
    qualifiedExcessBusinessLoss = roundDollar(ebl.times(row.qualifiedLossAllowed).div(row.lossAllowed));
    priorQualifiedLossAllowed = row.qualifiedLossAllowed.minus(qualifiedExcessBusinessLoss);
    priorActiveQualifiedLossAllowed = priorQualifiedLossAllowed.isZero() || row.materiallyParticipatedInCurrentYear === false ? d("0")
      : row.materiallyParticipatedInCurrentYear === true ? priorQualifiedLossAllowed : undefined;
    audit.record("QBI EBL Character", `${source.activitySourceId}:prior`, "Prior qualified loss after EBL", priorQualifiedLossAllowed,
      "Form8995 row3: re-suspended loss times released qualified/(released qualified+nonqualified); remove once from row4",
      { ...common, "Original loss year": String(row.taxYear), "Released qualified loss": row.qualifiedLossAllowed,
        "Qualified EBL": qualifiedExcessBusinessLoss });
  }
  if (qualifiedExcessBusinessLoss.lt(0) || qualifiedExcessBusinessLoss.gt(ebl)) throw new Error("Qualified EBL source character does not conserve its loss.");
  return { currentQualifiedLossAllowed, priorQualifiedLossAllowed, priorActiveQualifiedLossAllowed,
    excessBusinessLoss: ebl, qualifiedExcessBusinessLoss,
    excessBusinessLossVintage: { activitySourceId: source.activitySourceId, limitation: "461(l)", taxYear: context.taxYear,
      originalLoss: ebl, qualifiedOriginalLoss: qualifiedExcessBusinessLoss, remainingLoss: ebl,
      qualifiedRemainingLoss: qualifiedExcessBusinessLoss }, lines: audit.getLines() };
}
