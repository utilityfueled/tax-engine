/**
 * Form 8824 — Like-Kind Exchanges (§1031)
 * Spec: spec/federal/form-8824.yaml
 *
 * Computes Part III (Lines 12–25): realized gain, recognized gain
 * (limited by boot), depreciation recapture allocation, deferred gain,
 * and replacement property basis.
 *
 * Post-TCJA (2018+), §1031 applies only to real property.
 * Boot = cash + FMV of non-like-kind property received + net liability
 * relief − exchange expenses, floored at zero.
 *
 * Ref: IRS Form 8824 Instructions (2025); IRC §1031; Pub 544;
 *      Treas. Reg. §1.1031(a)-1 through §1.1031(k)-1.
 */

import Decimal from "decimal.js";
import type { Form8824Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface Form8824Result {
  /** Line 12: FMV of other property given up */
  line12FmvOtherPropertyGivenUp: Decimal;
  /** Line 13: Adjusted basis of other property given up */
  line13AdjustedBasisOtherPropertyGivenUp: Decimal;
  /** Line 14: Gain or (loss) on other property */
  line14GainLossOtherProperty: Decimal;
  /** Line 15: Boot received (cash + non-like-kind received + net liability relief − expenses, floor 0) */
  line15BootReceived: Decimal;
  /** Line 16: FMV of like-kind property received */
  line16FmvLikeKindPropertyReceived: Decimal;
  /** Line 17: Total value received */
  line17TotalValueReceived: Decimal;
  /** Line 18: Adjusted basis of like-kind property given up */
  line18AdjustedBasisLikeKindPropertyGivenUp: Decimal;
  /** Line 19: Realized gain or (loss) */
  line19RealizedGainLoss: Decimal;
  /** Line 20: Boot-limited recognized gain */
  line20RecognizedGain: Decimal;
  /** Line 21: Ordinary income under depreciation recapture */
  line21OrdinaryIncome: Decimal;
  /** Line 22: Capital gain portion of recognized gain */
  line22CapitalGain: Decimal;
  /** Line 23: Total recognized gain on the like-kind exchange (Line 21 + Line 22) */
  line23TotalRecognizedGain: Decimal;
  /** Line 24: Deferred gain or (loss) */
  line24DeferredGainLoss: Decimal;
  /** Line 25: Basis of like-kind property received */
  line25BasisLikeKindPropertyReceived: Decimal;
  /** Federal routing character for the recognized Line 23 gain/loss */
  recognizedGainCharacter: Form8824Input["recognizedGainCharacter"];
  /** Description of the exchange */
  description: string;
  /** Whether this is a related party exchange */
  isRelatedParty: boolean;
  /** Audit trail */
  lines: CalculatedLine[];
}

export interface Form8824AggregateResult {
  /** Individual exchange results */
  exchanges: Form8824Result[];
  /** Total ordinary income across all exchanges (sum of Line 21) */
  totalOrdinaryIncome: Decimal;
  /** Total nonordinary recognized gain/loss (Line 14 + Line 22) routed through Form 4797 Part I */
  totalSection1231RecognizedGainOrLoss: Decimal;
  /** Total nonordinary recognized gain/loss (Line 14 + Line 22) routed directly to Schedule D */
  totalCapitalRecognizedGainOrLoss: Decimal;
  /** Total capital gain across all exchanges (sum of Line 22) */
  totalCapitalGain: Decimal;
  /** Total gain/loss on other property across all exchanges (sum of Line 14) */
  totalOtherPropertyGainLoss: Decimal;
  /** Combined audit trail */
  lines: CalculatedLine[];
}

/**
 * Calculate a single Form 8824 exchange (Part III, Lines 12–25).
 */
export function calculateForm8824(
  input: Form8824Input,
  exchangeIndex?: number
): Form8824Result {
  const audit = new AuditTrail();
  const label = exchangeIndex !== undefined
    ? `Form 8824 #${exchangeIndex + 1}`
    : "Form 8824";

  // ── Line 12: FMV of other (non-like-kind) property given up ──
  const line12 = d(input.fmvOtherPropertyGivenUp);
  audit.record(label, "12", "FMV of other property given up", line12,
    "Input: fmvOtherPropertyGivenUp");

  // ── Line 13: Adjusted basis of other property given up ──
  const line13 = d(input.adjustedBasisOtherPropertyGivenUp);
  audit.record(label, "13", "Adjusted basis of other property given up", line13,
    "Input: adjustedBasisOtherPropertyGivenUp");

  // ── Line 14: Gain or (loss) on other property ──
  // Always recognized — not deferred by §1031
  const line14 = line12.minus(line13);
  audit.record(label, "14", "Gain or (loss) on other property", line14,
    `Line 12 (${line12}) - Line 13 (${line13})`,
    { "FMV other property (Line 12)": line12, "Basis other property (Line 13)": line13 });

  // ── Line 15: Boot received ──
  // cash + FMV non-like-kind received + max(liabilities relinquished - liabilities assumed, 0) - expenses
  // floored at zero
  const cashReceived = d(input.cashReceived);
  const fmvOtherReceived = d(input.fmvOtherPropertyReceived);
  const liabilitiesRelinquished = d(input.liabilitiesRelinquished);
  const liabilitiesAssumed = d(input.liabilitiesAssumed);
  const exchangeExpenses = d(input.exchangeExpenses);
  const netLiabilityRelief = zeroFloor(liabilitiesRelinquished.minus(liabilitiesAssumed));

  const grossBoot = cashReceived.plus(fmvOtherReceived).plus(netLiabilityRelief);
  const line15 = zeroFloor(grossBoot.minus(exchangeExpenses));
  audit.record(label, "15", "Boot received", line15,
    `max(0, cash ${cashReceived} + FMV other received ${fmvOtherReceived} + net liability relief ${netLiabilityRelief} - expenses ${exchangeExpenses})`,
    {
      "Cash received": cashReceived,
      "FMV other property received": fmvOtherReceived,
      "Liabilities relinquished": liabilitiesRelinquished,
      "Liabilities assumed": liabilitiesAssumed,
      "Net liability relief": netLiabilityRelief,
      "Exchange expenses": exchangeExpenses,
    });

  // ── Line 16: FMV of like-kind property received ──
  const line16 = d(input.fmvLikeKindPropertyReceived);
  audit.record(label, "16", "FMV of like-kind property received", line16,
    "Input: fmvLikeKindPropertyReceived");

  // ── Line 17: Total value received ──
  const line17 = line15.plus(line16);
  audit.record(label, "17", "Total value received", line17,
    `Line 15 (${line15}) + Line 16 (${line16})`);

  // ── Line 18: Adjusted basis of like-kind property given up ──
  const line18 = d(input.adjustedBasisLikeKindPropertyGivenUp);
  audit.record(label, "18", "Adjusted basis of like-kind property given up", line18,
    "Input: adjustedBasisLikeKindPropertyGivenUp");

  // ── Line 19: Realized gain or (loss) ──
  const line19 = line17.minus(line18);
  audit.record(label, "19", "Realized gain or (loss)", line19,
    `Line 17 (${line17}) - Line 18 (${line18})`);

  // ── Line 20: Boot-limited recognized gain ──
  // min(boot, max(realized gain, 0))
  const line20 = min(line15, zeroFloor(line19));
  audit.record(label, "20", "Boot-limited recognized gain", line20,
    `min(Line 15 boot ${line15}, max(Line 19 realized ${line19}, 0))`,
    { "Boot (Line 15)": line15, "Realized gain (Line 19)": line19 });

  // ── Line 21: Ordinary income under depreciation recapture ──
  // min(§1250 recapture, boot-limited gain)
  const depreciationRecapture = d(input.depreciationRecapture);
  const line21 = min(depreciationRecapture, line20);
  audit.record(label, "21", "Ordinary income under depreciation recapture", line21,
    `min(recapture ${depreciationRecapture}, Line 20 ${line20})`,
    { "Depreciation recapture": depreciationRecapture, "Boot-limited gain (Line 20)": line20 });

  // ── Line 22: Capital gain portion ──
  const line22 = zeroFloor(line20.minus(line21));
  audit.record(label, "22", "Capital gain portion of recognized gain", line22,
    `max(0, Line 20 (${line20}) - Line 21 (${line21}))`);

  // ── Line 23: Total recognized gain ──
  // Ordinary recapture + remaining recognized exchange gain
  const line23 = line21.plus(line22);
  audit.record(label, "23", "Total recognized gain", line23,
    `Line 21 (${line21}) + Line 22 (${line22})`,
    { "Ordinary income (Line 21)": line21, "Capital gain (Line 22)": line22 });

  // ── Line 24: Deferred gain or (loss) ──
  // Realized gain minus recognized exchange gain
  const line24 = line19.minus(line23);
  audit.record(label, "24", "Deferred gain or (loss)", line24,
    `Line 19 (${line19}) - Line 23 (${line23})`,
    { "Realized (Line 19)": line19, "Recognized exchange gain (Line 23)": line23 });

  // ── Line 25: Basis of like-kind property received ──
  // Old basis + recognized exchange gain - boot received
  // Equivalently: FMV received - deferred gain
  const line25 = line18.plus(line23).minus(line15);
  audit.record(label, "25", "Basis of like-kind property received", line25,
    `Line 18 (${line18}) + Line 23 (${line23}) - Line 15 (${line15})`,
    {
      "Old basis (Line 18)": line18,
      "Recognized exchange gain (Line 23)": line23,
      "Boot received (Line 15)": line15,
    });

  return {
    line12FmvOtherPropertyGivenUp: line12,
    line13AdjustedBasisOtherPropertyGivenUp: line13,
    line14GainLossOtherProperty: line14,
    line15BootReceived: line15,
    line16FmvLikeKindPropertyReceived: line16,
    line17TotalValueReceived: line17,
    line18AdjustedBasisLikeKindPropertyGivenUp: line18,
    line19RealizedGainLoss: line19,
    line20RecognizedGain: line20,
    line21OrdinaryIncome: line21,
    line22CapitalGain: line22,
    line23TotalRecognizedGain: line23,
    line24DeferredGainLoss: line24,
    line25BasisLikeKindPropertyReceived: line25,
    recognizedGainCharacter: input.recognizedGainCharacter,
    description: input.description ?? "Like-kind real property exchange",
    isRelatedParty: input.isRelatedParty ?? false,
    lines: audit.getLines(),
  };
}

/**
 * Calculate multiple Form 8824 exchanges and aggregate totals.
 * Each exchange is computed independently per IRS instructions.
 */
export function calculateForm8824Aggregate(
  inputs: Form8824Input[]
): Form8824AggregateResult {
  const audit = new AuditTrail();

  const exchanges = inputs.map((input, i) => {
    const result = calculateForm8824(input, inputs.length > 1 ? i : undefined);
    audit.merge(result.lines);
    return result;
  });

  const totalOrdinaryIncome = exchanges.reduce(
    (acc, e) => acc.plus(e.line21OrdinaryIncome), ZERO
  );
  const totalSection1231RecognizedGainOrLoss = exchanges.reduce(
    (acc, e) => e.recognizedGainCharacter === "section1231"
      ? acc.plus(e.line14GainLossOtherProperty.plus(e.line22CapitalGain))
      : acc,
    ZERO
  );
  const totalCapitalRecognizedGainOrLoss = exchanges.reduce(
    (acc, e) => e.recognizedGainCharacter === "capital"
      ? acc.plus(e.line14GainLossOtherProperty.plus(e.line22CapitalGain))
      : acc,
    ZERO
  );
  const totalCapitalGain = exchanges.reduce(
    (acc, e) => acc.plus(e.line22CapitalGain), ZERO
  );
  const totalOtherPropertyGainLoss = exchanges.reduce(
    (acc, e) => acc.plus(e.line14GainLossOtherProperty), ZERO
  );

  if (inputs.length > 1) {
    audit.record("Form 8824", "agg-ord", "Total ordinary income from all exchanges",
      totalOrdinaryIncome, `Sum of Line 21 across ${inputs.length} exchanges`);
    audit.record("Form 8824", "agg-cap", "Total capital gain from all exchanges",
      totalCapitalGain, `Sum of Line 22 across ${inputs.length} exchanges`);
    audit.record(
      "Form 8824",
      "agg-route-1231",
      "Total nonordinary recognized Form 8824 gain/loss routed through Form 4797 Part I",
      totalSection1231RecognizedGainOrLoss,
      `Sum of Line 14 plus Line 22 for exchanges marked section1231 across ${inputs.length} exchanges`,
    );
    audit.record(
      "Form 8824",
      "agg-route-cap",
      "Total nonordinary recognized Form 8824 gain/loss routed directly to Schedule D",
      totalCapitalRecognizedGainOrLoss,
      `Sum of Line 14 plus Line 22 for exchanges marked capital across ${inputs.length} exchanges`,
    );
  }

  return {
    exchanges,
    totalOrdinaryIncome,
    totalSection1231RecognizedGainOrLoss,
    totalCapitalRecognizedGainOrLoss,
    totalCapitalGain,
    totalOtherPropertyGainLoss,
    lines: audit.getLines(),
  };
}
