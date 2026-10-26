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
    // Final2025 Pub596 table: 5000/nonjoint/1 children=1709.
    const result = eic({ qualifyingChildren: 1, earnedIncome: 5000 });
    expect(result.phaseInCredit.toFixed()).toBe("1700");
    expect(result.credit.toNumber()).toBe(1709);
  });

  it("EIC - phase-in credit caps at earned income amount", () => {
    // 1 child, earned $15,000 (above $12,730 ceiling), below phase-out start ($23,350)
    // credit = 34% × $12,730 = $4,328.20, floor = $4,328
    const result = eic({ qualifyingChildren: 1, earnedIncome: 15000 });
    expect(result.credit.toNumber()).toBe(4328);
  });

  it("EIC - zero children phase-in at $4,000 earned income", () => {
    // Final2025 Pub596 table: 4000/nonjoint/0 children=308.
    const result = eic({ qualifyingChildren: 0, earnedIncome: 4000, primaryAge: 30 });
    expect(result.credit.toNumber()).toBe(308);
  });

  // ── Phase-out: credit decreases above phase-out start ──────

  it("EIC - single with 1 child mid-phase-out gets correct credit", () => {
    // Final2025 Pub596 table: 35000/nonjoint/1 children=2462.
    const result = eic({ qualifyingChildren: 1, earnedIncome: 35000 });
    expect(result.credit.toNumber()).toBe(2462);
  });

  it("EIC - single with 2 children mid-phase-out", () => {
    // Final2025 Pub596 table: 40000/nonjoint/2 children=3640.
    const result = eic({ qualifyingChildren: 2, earnedIncome: 40000 });
    expect(result.credit.toNumber()).toBe(3640);
  });

  // ── Phase-out uses greater of earned income or AGI ─────────

  it("EIC - phase-out uses greater of earned income or AGI", () => {
    // Final2025 Pub596 table: 35000/nonjoint/1 children=2462.
    const result = eic({ qualifyingChildren: 1, earnedIncome: 20000, agi: 35000 });
    expect(result.credit.toNumber()).toBe(2462);
  });

  it("EIC - earned income higher than AGI uses earned income for phase-out", () => {
    // Final2025 Pub596 table: 35000/nonjoint/1 children=2462.
    const result = eic({ qualifyingChildren: 1, earnedIncome: 35000, agi: 30000 });
    expect(result.credit.toNumber()).toBe(2462);
  });

  // ── At exact phase-out start: full maximum credit ──────────

  it("EIC - exact phase-out start uses the published table interval", () => {
    // Final2025 Pub596 table: 23350/nonjoint/1 children=4324.
    const result = eic({ qualifyingChildren: 1, earnedIncome: 23350 });
    expect(result.credit.toNumber()).toBe(4324);
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
    // Final2025 Pub596 table: 50400/nonjoint/1 children=3.
    const result = eic({ qualifyingChildren: 1, earnedIncome: 50400 });
    expect(result.credit.toNumber()).toBe(3);
  });

  // ── MFJ uses higher phase-out start ────────────────────────

  it("EIC - MFJ 1 child gets higher credit than single at same income due to higher phase-out start", () => {
    // Final2025 Pub596 table: 30000/nonjoint/1 children=3261; 30000/joint/1 children=4328.
    const single = eic({ qualifyingChildren: 1, earnedIncome: 30000 });
    const mfj = eic({ filingStatus: "married_filing_jointly", qualifyingChildren: 1, earnedIncome: 30000 });
    expect(single.credit.toNumber()).toBe(3261);
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
    // Final2025 Pub596 table: 55000/nonjoint/1 children=0; 55000/nonjoint/1 children=0; 55000/joint/1 children=404.
    const mfj = eic({ filingStatus: "married_filing_jointly", qualifyingChildren: 1, earnedIncome: 55000 });
    const qss = eic({ filingStatus: "qualifying_surviving_spouse", qualifyingChildren: 1, earnedIncome: 55000 });
    const single = eic({ filingStatus: "single", qualifyingChildren: 1, earnedIncome: 55000 });
    expect(single.credit.toNumber()).toBe(0);
    expect(qss.credit.toNumber()).toBe(0);
    expect(mfj.credit.toNumber()).toBe(404);
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

  // Published whole-dollar table result

  it("EIC - credit uses the published whole-dollar table amount", () => {
    // Final2025 Pub596 table: 4123/nonjoint/0 children=316.
    const result = eic({ qualifyingChildren: 0, earnedIncome: 4123, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(316);
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
    // Final2025 Pub596 table: 1/nonjoint/1 children=9.
    const result = eic({ qualifyingChildren: 1, earnedIncome: 1 });
    expect(result.credit.toNumber()).toBe(9);
  });

  it("EIC - small earned income produces small credit", () => {
    // Final2025 Pub596 table: 100/nonjoint/1 children=43.
    const result = eic({ qualifyingChildren: 1, earnedIncome: 100 });
    expect(result.credit.toNumber()).toBe(43);
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
