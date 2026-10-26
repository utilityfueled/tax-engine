/**
 * Tests for Earned Income Credit (EIC) — Schedule EIC / EIC Worksheet.
 * Spec: spec/federal/schedule-eic.yaml
 *
 * Parameters verified against IRS Publication 596 (2025), Rev. Proc. 2024-40 §3.06,
 * and the IRS EITC tables page (irs.gov/credits-deductions/individuals/earned-income-tax-credit).
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateEic } from "@/engine/forms/schedule-eic.js";
import { getConstants } from "@/models/constants.js";

const constants = getConstants(2025);
const d = (n: number | string) => new Decimal(n);

function eic(overrides: {
  filingStatus?: string;
  qualifyingChildren?: number;
  earnedIncome?: number | string;
  agi?: number | string;
  investmentIncome?: number | string;
  primaryAge?: number;
  mfsEicEligible?: boolean;
}) {
  return calculateEic(
    {
      filingStatus: (overrides.filingStatus ?? "single") as "single",
      qualifyingChildren: overrides.qualifyingChildren ?? 0,
      earnedIncome: d(overrides.earnedIncome ?? 15000),
      agi: d(overrides.agi ?? overrides.earnedIncome ?? 15000),
      investmentIncome: d(overrides.investmentIncome ?? 0),
      primaryAge: overrides.primaryAge ?? 35,
      mfsEicEligible: overrides.mfsEicEligible ?? false,
    },
    constants,
  );
}

describe("EIC", () => {
  // ── Maximum credit amounts match IRS tables ────────────────

  it("EIC - maximum credit amounts match IRS tables", () => {
    // Each scenario: earned income at the phase-in ceiling, below phase-out start, no disqualifiers
    const c0 = eic({ earnedIncome: 8490, primaryAge: 35 });
    expect(c0.maxCredit.toNumber()).toBe(649);

    const c1 = eic({ earnedIncome: 12730, qualifyingChildren: 1 });
    expect(c1.maxCredit.toNumber()).toBe(4328);

    const c2 = eic({ earnedIncome: 17880, qualifyingChildren: 2 });
    expect(c2.maxCredit.toNumber()).toBe(7152);

    const c3 = eic({ earnedIncome: 17880, qualifyingChildren: 3 });
    expect(c3.maxCredit.toNumber()).toBe(8046);
  });

  // ── Phase-in: credit grows with earned income ──────────────

  it("EIC - phase-in credit equals rate times earned income", () => {
    // 1 child, earned $5,000 → credit = 34% × $5,000 = $1,700
    const result = eic({ qualifyingChildren: 1, earnedIncome: 5000 });
    expect(result.credit.toNumber()).toBe(1700);
  });

  it("EIC - phase-in credit caps at earned income amount", () => {
    // 1 child, earned $15,000 (above $12,730 ceiling), below phase-out start ($23,350)
    // credit = 34% × $12,730 = $4,328.20, floor = $4,328
    const result = eic({ qualifyingChildren: 1, earnedIncome: 15000 });
    expect(result.credit.toNumber()).toBe(4328);
  });

  it("EIC - zero children phase-in at $4,000 earned income", () => {
    // 7.65% × $4,000 = $306
    const result = eic({ qualifyingChildren: 0, earnedIncome: 4000, primaryAge: 30 });
    expect(result.credit.toNumber()).toBe(306);
  });

  // ── Phase-out: credit decreases above phase-out start ──────

  it("EIC - single with 1 child mid-phase-out gets correct credit", () => {
    // Earned/AGI $35,000, phase-out start $23,350, rate 15.98%
    // phase-in = 34% × $12,730 = $4,328.20
    // phase-out = 15.98% × ($35,000 - $23,350) = 15.98% × $11,650 = $1,861.67
    // credit = floor($4,328.20 - $1,861.67) = floor($2,466.53) = $2,466
    const result = eic({ qualifyingChildren: 1, earnedIncome: 35000 });
    expect(result.credit.toNumber()).toBe(2466);
  });

  it("EIC - single with 2 children mid-phase-out", () => {
    // Earned/AGI $40,000, phase-out start $23,350, rate 21.06%
    // phase-in = 40% × $17,880 = $7,152
    // phase-out = 21.06% × ($40,000 - $23,350) = 21.06% × $16,650 = $3,506.49
    // credit = floor($7,152 - $3,506.49) = floor($3,645.51) = $3,645
    const result = eic({ qualifyingChildren: 2, earnedIncome: 40000 });
    expect(result.credit.toNumber()).toBe(3645);
  });

  // ── Phase-out uses greater of earned income or AGI ─────────

  it("EIC - phase-out uses greater of earned income or AGI", () => {
    // 1 child: earned $20,000, AGI $35,000 (AGI higher due to investment/other income)
    // phase-in = 34% × $12,730 = $4,328.20
    // phase-out = 15.98% × ($35,000 - $23,350) = $1,861.67
    // credit = floor($4,328.20 - $1,861.67) = $2,466
    const result = eic({ qualifyingChildren: 1, earnedIncome: 20000, agi: 35000 });
    expect(result.credit.toNumber()).toBe(2466);
  });

  it("EIC - earned income higher than AGI uses earned income for phase-out", () => {
    // 1 child: earned $35,000, AGI $30,000 (AGI lower due to adjustments)
    // phase-out uses $35,000 (greater)
    // phase-out = 15.98% × ($35,000 - $23,350) = $1,861.67
    // credit = floor($4,328.20 - $1,861.67) = $2,466
    const result = eic({ qualifyingChildren: 1, earnedIncome: 35000, agi: 30000 });
    expect(result.credit.toNumber()).toBe(2466);
  });

  // ── At exact phase-out start: full maximum credit ──────────

  it("EIC - at exact phase-out start gets full maximum credit", () => {
    // 1 child, earned $23,350 (phase-out start for single)
    // phase-in = 34% × $12,730 = $4,328.20, floor = $4,328
    // phase-out = 15.98% × max(0, $23,350 - $23,350) = $0
    // credit = $4,328
    const result = eic({ qualifyingChildren: 1, earnedIncome: 23350 });
    expect(result.credit.toNumber()).toBe(4328);
  });

  // ── At income limit: credit = $0 ──────────────────────────

  it("EIC - 0 children single at $19,104: credit = $0", () => {
    const result = eic({ qualifyingChildren: 0, earnedIncome: 19104, primaryAge: 30 });
    expect(result.credit.toNumber()).toBe(0);
  });

  it("EIC - 1 child single at $50,434: credit = $0", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 50434 });
    expect(result.credit.toNumber()).toBe(0);
  });

  it("EIC - 2 children single at $57,310: credit = $0", () => {
    const result = eic({ qualifyingChildren: 2, earnedIncome: 57310 });
    expect(result.credit.toNumber()).toBe(0);
  });

  it("EIC - 3+ children single at $61,555: credit = $0", () => {
    const result = eic({ qualifyingChildren: 3, earnedIncome: 61555 });
    expect(result.credit.toNumber()).toBe(0);
  });

  it("EIC - 0 children MFJ at $26,214: credit = $0", () => {
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 0,
      earnedIncome: 26214,
      primaryAge: 30,
    });
    expect(result.credit.toNumber()).toBe(0);
  });

  it("EIC - 1 child MFJ at $57,554: credit = $0", () => {
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 1,
      earnedIncome: 57554,
    });
    expect(result.credit.toNumber()).toBe(0);
  });

  it("EIC - 2 children MFJ at $64,430: credit = $0", () => {
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 2,
      earnedIncome: 64430,
    });
    expect(result.credit.toNumber()).toBe(0);
  });

  it("EIC - 3+ children MFJ at $68,675: credit = $0", () => {
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 3,
      earnedIncome: 68675,
    });
    expect(result.credit.toNumber()).toBe(0);
  });

  // ── Just below income limit: small credit ──────────────────

  it("EIC - 1 child single just below income limit gets small credit", () => {
    // At $50,400: phase-out = 15.98% × ($50,400 - $23,350) = 15.98% × $27,050 = $4,322.59
    // credit = floor($4,328.20 - $4,322.59) = floor($5.61) = $5
    const result = eic({ qualifyingChildren: 1, earnedIncome: 50400 });
    expect(result.credit.toNumber()).toBe(5);
  });

  // ── MFJ uses higher phase-out start ────────────────────────

  it("EIC - MFJ 1 child gets higher credit than single at same income due to higher phase-out start", () => {
    // Both at $30,000
    const single = eic({ qualifyingChildren: 1, earnedIncome: 30000 });
    const mfj = eic({ filingStatus: "married_filing_jointly", qualifyingChildren: 1, earnedIncome: 30000 });
    // MFJ phase-out start $30,470 vs single $23,350
    // Single: phase-out = 15.98% × ($30,000 - $23,350) = 15.98% × $6,650 = $1,062.67, credit = floor($4,328.20 - $1,062.67) = $3,265
    // MFJ: $30,000 < $30,470 → no phase-out, credit = $4,328
    expect(single.credit.toNumber()).toBe(3265);
    expect(mfj.credit.toNumber()).toBe(4328);
    expect(mfj.credit.greaterThan(single.credit)).toBe(true);
  });

  // ── HoH uses single/HoH thresholds ────────────────────────

  it("EIC - head of household uses single/HoH phase-out thresholds", () => {
    const single = eic({ filingStatus: "single", qualifyingChildren: 1, earnedIncome: 35000 });
    const hoh = eic({ filingStatus: "head_of_household", qualifyingChildren: 1, earnedIncome: 35000 });
    expect(hoh.credit.toNumber()).toBe(single.credit.toNumber());
  });

  // ── QSS uses nonjoint thresholds ──────────────────────────

  it("EIC - qualifying surviving spouse uses nonjoint thresholds", () => {
    // Pub596 Rule1: one-child nonjoint limit50,434; joint limit57,554.
    const mfj = eic({ filingStatus: "married_filing_jointly", qualifyingChildren: 1, earnedIncome: 55000 });
    const qss = eic({ filingStatus: "qualifying_surviving_spouse", qualifyingChildren: 1, earnedIncome: 55000 });
    const single = eic({ filingStatus: "single", qualifyingChildren: 1, earnedIncome: 55000 });
    expect(single.credit.toNumber()).toBe(0);
    expect(qss.credit.toNumber()).toBe(0);
    // Existing formula: floor(4,328.20−.1598×(55,000−30,470))=408.
    expect(mfj.credit.toNumber()).toBe(408);
  });

  // ── Disqualifications ──────────────────────────────────────

  it("EIC - MFS without exception gets $0", () => {
    const result = eic({ filingStatus: "married_filing_separately", qualifyingChildren: 1, earnedIncome: 20000 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
  });

  it("EIC - MFS with separated-spouse exception can claim credit", () => {
    const result = eic({
      filingStatus: "married_filing_separately",
      qualifyingChildren: 1,
      earnedIncome: 20000,
      mfsEicEligible: true,
    });
    // Uses single/HoH thresholds: below phase-out start, should get max credit
    expect(result.credit.toNumber()).toBe(4328);
    expect(result.disqualified).toBe(false);
  });

  it("EIC - investment income over limit disqualifies", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 20000, investmentIncome: 12000 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
    expect(result.disqualificationReason).toContain("11950");
  });

  it("EIC - investment income at exactly the limit is allowed", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 20000, investmentIncome: 11950 });
    expect(result.credit.toNumber()).toBe(4328);
    expect(result.disqualified).toBe(false);
  });

  it("EIC - zero earned income disqualifies", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 0 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
  });

  it("EIC - negative earned income disqualifies", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: -500 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
  });

  // ── Age requirements for childless filers ──────────────────

  it("EIC - childless filer age 24 disqualified", () => {
    const result = eic({ qualifyingChildren: 0, earnedIncome: 8000, primaryAge: 24 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
    expect(result.disqualificationReason).toContain("age");
  });

  it("EIC - childless filer age 25 qualifies", () => {
    const result = eic({ qualifyingChildren: 0, earnedIncome: 8000, primaryAge: 25 });
    expect(result.credit.toNumber()).toBeGreaterThan(0);
    expect(result.disqualified).toBe(false);
  });

  it("EIC - childless filer age 64 qualifies", () => {
    const result = eic({ qualifyingChildren: 0, earnedIncome: 8000, primaryAge: 64 });
    expect(result.credit.toNumber()).toBeGreaterThan(0);
    expect(result.disqualified).toBe(false);
  });

  it("EIC - childless filer age 65 disqualified", () => {
    const result = eic({ qualifyingChildren: 0, earnedIncome: 8000, primaryAge: 65 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
    expect(result.disqualificationReason).toContain("age");
  });

  it("EIC - age requirement does not apply when there are qualifying children", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 10000, primaryAge: 20 });
    expect(result.credit.toNumber()).toBeGreaterThan(0);
    expect(result.disqualified).toBe(false);
  });

  // ── Credit is floored (rounded down) ──────────────────────

  it("EIC - credit is floored to nearest dollar", () => {
    // 0 children, earned $4,123, age 35
    // phase-in = 7.65% × $4,123 = $315.4095
    // Should floor to $315
    const result = eic({ qualifyingChildren: 0, earnedIncome: 4123, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(315);
  });

  // ── 3+ children caps at 3 for rate lookup ──────────────────

  it("EIC - 4 qualifying children uses same rates as 3", () => {
    const c3 = eic({ qualifyingChildren: 3, earnedIncome: 15000 });
    const c4 = eic({ qualifyingChildren: 4, earnedIncome: 15000 });
    expect(c4.credit.toNumber()).toBe(c3.credit.toNumber());
  });

  it("EIC - 5 qualifying children uses same rates as 3", () => {
    const c3 = eic({ qualifyingChildren: 3, earnedIncome: 15000 });
    const c5 = eic({ qualifyingChildren: 5, earnedIncome: 15000 });
    expect(c5.credit.toNumber()).toBe(c3.credit.toNumber());
  });

  // ── At exact earned income amount: max credit ──────────────

  it("EIC - 2 children at exact earned income amount gets max credit", () => {
    // earned = $17,880, below phase-out start ($23,350)
    // credit = 40% × $17,880 = $7,152.00 exactly → $7,152
    const result = eic({ qualifyingChildren: 2, earnedIncome: 17880 });
    expect(result.credit.toNumber()).toBe(7152);
  });

  // ── Plateau: between phase-in ceiling and phase-out start ──

  it("EIC - income between phase-in ceiling and phase-out start gets max credit", () => {
    // 2 children, earned $20,000 (between $17,880 and $23,350)
    // phase-in = 40% × $17,880 = $7,152, phase-out = $0
    // credit = $7,152
    const result = eic({ qualifyingChildren: 2, earnedIncome: 20000 });
    expect(result.credit.toNumber()).toBe(7152);
  });

  // ── 3+ children maximum credit ─────────────────────────────

  it("EIC - 3 children gets $8,046 max credit on plateau", () => {
    const result = eic({ qualifyingChildren: 3, earnedIncome: 20000 });
    expect(result.credit.toNumber()).toBe(8046);
  });

  // ── $1 earned income ───────────────────────────────────────

  it("EIC - $1 earned income produces minimal credit", () => {
    // 1 child: 34% × $1 = $0.34 → floor = $0
    const result = eic({ qualifyingChildren: 1, earnedIncome: 1 });
    expect(result.credit.toNumber()).toBe(0);
  });

  it("EIC - small earned income produces small credit", () => {
    // 1 child: 34% × $100 = $34
    const result = eic({ qualifyingChildren: 1, earnedIncome: 100 });
    expect(result.credit.toNumber()).toBe(34);
  });

  // ── Audit trail ────────────────────────────────────────────

  it("EIC - produces audit trail lines", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 30000 });
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.some((l) => l.form === "EIC")).toBe(true);
  });

  it("EIC - disqualified result includes audit trail", () => {
    const result = eic({ filingStatus: "married_filing_separately", qualifyingChildren: 1, earnedIncome: 20000 });
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.some((l) => l.formula.includes("Disqualified"))).toBe(true);
  });

  // ── Very high income: well above limit ─────────────────────

  it("EIC - very high income produces $0 credit", () => {
    const result = eic({ qualifyingChildren: 3, earnedIncome: 200000 });
    expect(result.credit.toNumber()).toBe(0);
  });

  // ── Exact boundary: $1 above phase-out start ───────────────

  it("EIC - $1 above phase-out start begins reduction", () => {
    // 0 children single: phase-out start $10,620, rate 7.65%
    // earned = $10,621: phase-out = 7.65% × $1 = $0.0765
    // phase-in = 7.65% × $8,490 = $649.485
    // credit = floor($649.485 - $0.0765) = floor($649.4085) = $649
    const result = eic({ qualifyingChildren: 0, earnedIncome: 10621, primaryAge: 30 });
    expect(result.credit.toNumber()).toBe(649);
  });
});
