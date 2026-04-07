/**
 * Form 6781 — Gains and Losses From Section 1256 Contracts and Straddles
 * Spec: spec/federal/form-6781.yaml
 *
 * Implements the IRC §1256 mark-to-market treatment with the 60/40
 * long-term/short-term capital gain split, plus Part II straddle
 * gain/loss flows under IRC §1092.
 *
 * Section 1256 contracts include regulated futures contracts, foreign
 * currency contracts, nonequity options (e.g., SPX index options),
 * dealer equity options, and dealer securities futures contracts.
 */

import Decimal from "decimal.js";
import type { Form6781Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const SHORT_TERM_RATE = new Decimal("0.40");

export interface Form6781Result {
  // Part I: Section 1256 Contracts Marked to Market
  line3: Decimal;   // Net gain or loss from section 1256 contracts
  line4: Decimal;   // Adjustments
  line5: Decimal;   // Combined (Line 3 + Line 4)
  line6: Decimal;   // Carryback amount
  line7: Decimal;   // Net after carryback (Line 5 + Line 6)
  line8: Decimal;   // Short-term 40% → Schedule D Line 4
  line9: Decimal;   // Long-term 60% → Schedule D Line 11

  // Part II: Straddle gains and losses
  line11a: Decimal;  // Short-term straddle losses (negative)
  line11b: Decimal;  // Long-term straddle losses (negative)
  line13a: Decimal;  // Short-term straddle gains
  line13b: Decimal;  // Long-term straddle gains

  // Totals flowing to Schedule D
  scheduleDShortTerm: Decimal;  // Line 8 + Line 11a + Line 13a
  scheduleDLongTerm: Decimal;   // Line 9 + Line 11b + Line 13b

  lines: CalculatedLine[];
}

export function calculateForm6781(input: Form6781Input): Form6781Result {
  const audit = new AuditTrail();

  // ── Part I: Section 1256 Contracts Marked to Market ──────────

  // Lines 1-2: Sum of gains and losses from section 1256 contracts
  const gains = zeroFloor(d(input.section1256Gains));
  const losses = zeroFloor(d(input.section1256Losses));

  // Line 3: Net gain or loss
  const line3 = gains.minus(losses);
  audit.record("Form 6781", "3", "Net gain or loss from section 1256 contracts",
    line3, "Section 1256 gains minus losses", {
      "Section 1256 gains": gains,
      "Section 1256 losses": losses,
    });

  // Line 4: Adjustments (mixed straddle elections, hedging, etc.)
  const line4 = d(input.adjustments);
  audit.record("Form 6781", "4", "Adjustments to section 1256 contract gain or loss",
    line4, "Mixed straddle election, hedging transaction, or other adjustments");

  // Line 5: Combined
  const line5 = line3.plus(line4);
  audit.record("Form 6781", "5", "Combined section 1256 contracts gain or loss",
    line5, "Line 3 + Line 4", {
      "Line 3": line3,
      "Line 4": line4,
    });

  // Line 6: Carryback election (Box D)
  // Only applies when Line 5 is a net loss and carryback is elected
  let line6 = ZERO;
  if (input.carrybackElection && line5.isNegative()) {
    // Carryback amount is entered as a positive number, capped at the net loss amount
    const requestedCarryback = zeroFloor(d(input.carrybackAmount));
    line6 = Decimal.min(requestedCarryback, line5.abs());
  }
  audit.record("Form 6781", "6", "Net section 1256 contracts loss carryback election amount",
    line6,
    !input.carrybackElection
      ? "No carryback election (Box D not checked)"
      : line5.isNegative()
        ? "Carryback election made; amount carried back to up to 3 prior years"
        : "No carryback available because Line 5 is not a net loss",
    {
      "Line 5": line5,
      "Carryback election": input.carrybackElection ? "Yes" : "No",
      "Requested carryback": zeroFloor(d(input.carrybackAmount)),
    });

  // Line 7: Net after carryback
  const line7 = line5.plus(line6);
  audit.record("Form 6781", "7", "Net section 1256 gain or loss after carryback",
    line7, "Line 5 + Line 6", {
      "Line 5": line5,
      "Line 6": line6,
    });

  // Lines 8-9: 60/40 split
  // IRC §1256(a)(3): 40% short-term, 60% long-term regardless of holding period
  const line8 = line7.times(SHORT_TERM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const line9 = line7.minus(line8); // Ensure no rounding gap: remainder goes to long-term
  audit.record("Form 6781", "8", "Short-term capital gain or loss (40% of Line 7)",
    line8, "Line 7 × 0.40 → Schedule D Line 4", {
      "Line 7": line7,
    });
  audit.record("Form 6781", "9", "Long-term capital gain or loss (60% of Line 7)",
    line9, "Line 7 - Line 8 (remainder after 40% short-term) → Schedule D Line 11", {
      "Line 7": line7,
      "Line 8": line8,
    });

  // ── Part II: Straddle Gains and Losses ───────────────────────

  // Section A: Losses (entered as positive values, reported as negatives)
  const rawShortTermStraddleLosses = zeroFloor(d(input.shortTermStraddleLosses));
  const rawLongTermStraddleLosses = zeroFloor(d(input.longTermStraddleLosses));
  const line11a = rawShortTermStraddleLosses.isZero() ? ZERO : rawShortTermStraddleLosses.negated();
  const line11b = rawLongTermStraddleLosses.isZero() ? ZERO : rawLongTermStraddleLosses.negated();

  audit.record("Form 6781", "11a", "Short-term straddle losses",
    line11a, "Recognized short-term losses from straddle positions → Schedule D Line 4", {
      "Short-term straddle losses (input)": rawShortTermStraddleLosses,
    });
  audit.record("Form 6781", "11b", "Long-term straddle losses",
    line11b, "Recognized long-term losses from straddle positions → Schedule D Line 11", {
      "Long-term straddle losses (input)": rawLongTermStraddleLosses,
    });

  // Section B: Gains
  const line13a = zeroFloor(d(input.shortTermStraddleGains));
  const line13b = zeroFloor(d(input.longTermStraddleGains));

  audit.record("Form 6781", "13a", "Short-term straddle gains",
    line13a, "Short-term gains from straddle positions → Schedule D Line 4");
  audit.record("Form 6781", "13b", "Long-term straddle gains",
    line13b, "Long-term gains from straddle positions → Schedule D Line 11");

  // ── Totals flowing to Schedule D ─────────────────────────────
  const scheduleDShortTerm = line8.plus(line11a).plus(line13a);
  const scheduleDLongTerm = line9.plus(line11b).plus(line13b);

  audit.record("Form 6781", "schedule-d-short-term",
    "Total short-term capital gain or loss from Form 6781 → Schedule D Line 4",
    scheduleDShortTerm, "Line 8 + Line 11a + Line 13a", {
      "Line 8": line8,
      "Line 11a": line11a,
      "Line 13a": line13a,
    });
  audit.record("Form 6781", "schedule-d-long-term",
    "Total long-term capital gain or loss from Form 6781 → Schedule D Line 11",
    scheduleDLongTerm, "Line 9 + Line 11b + Line 13b", {
      "Line 9": line9,
      "Line 11b": line11b,
      "Line 13b": line13b,
    });

  return {
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9,
    line11a,
    line11b,
    line13a,
    line13b,
    scheduleDShortTerm,
    scheduleDLongTerm,
    lines: audit.getLines(),
  };
}
