/**
 * Form 2441 — Child and Dependent Care Expenses
 * Spec: spec/federal/form-2441.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm2441 } from "@/engine/forms/form-2441.js";
import type { Form2441Input } from "@/engine/forms/form-2441.js";

const d = (n: number | string) => new Decimal(n);

function make(overrides: Partial<Form2441Input> = {}): Form2441Input {
  return {
    careExpenses: d(5000),
    qualifyingIndividuals: 1,
    earnedIncome: d(50000),
    agi: d(50000),
    ...overrides,
  };
}

describe("Form 2441", () => {
  // ── Line 3: Qualifying expenses ──────────────────────────
  it("Form 2441 Line 3 - qualifying expenses capped at $3K for one", () => {
    const result = calculateForm2441(make({ careExpenses: d(5000), qualifyingIndividuals: 1 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
  });

  it("Form 2441 Line 3 - qualifying expenses capped at $6K for two+", () => {
    const result = calculateForm2441(make({ careExpenses: d(8000), qualifyingIndividuals: 2 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
  });

  it("Form 2441 Line 3 - under cap passes through (one)", () => {
    const result = calculateForm2441(make({ careExpenses: d(2000), qualifyingIndividuals: 1 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(2000);
  });

  it("Form 2441 Line 3 - under cap passes through (two)", () => {
    const result = calculateForm2441(make({ careExpenses: d(4000), qualifyingIndividuals: 2 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(4000);
  });

  // ── Line 4: Earned income limit ──────────────────────────
  it("Form 2441 Line 4 - earned income limit applied", () => {
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(2000),
    }));
    expect(result.earnedIncomeLimit.toNumber()).toBe(2000);
  });

  it("Form 2441 Line 4 - expenses under earned income", () => {
    const result = calculateForm2441(make({
      careExpenses: d(1000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
    }));
    expect(result.earnedIncomeLimit.toNumber()).toBe(1000);
  });

  // ── Line 8: Credit percentage ────────────────────────────
  it("Form 2441 Line 8 - credit percentage 35% at $15K AGI", () => {
    const result = calculateForm2441(make({ agi: d(15000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.35);
  });

  it("Form 2441 Line 8 - credit percentage 34% at $16K (fraction of $2K step rounds up per IRS)", () => {
    // IRS Pub 503: $15,001–$17,000 → 34%. ($16K-$15K)/$2K = 0.5 → ceil = 1 step → 35%-1% = 34%
    const result = calculateForm2441(make({ agi: d(16000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.34);
  });

  it("Form 2441 Line 8 - credit percentage 34% at $17K (1 step over)", () => {
    // $17,000 is still inside the $15,001-$17,000 bracket.
    const result = calculateForm2441(make({ agi: d(17000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.34);
  });

  it("Form 2441 Line 8 - credit percentage drops to 34% at $15,001", () => {
    const result = calculateForm2441(make({ agi: d(15001) }));
    expect(result.creditPercentage.toNumber()).toBe(0.34);
  });

  it("Form 2441 Line 8 - credit percentage 21% at $43K AGI", () => {
    // ($43K - $15K) / $2K = 14 steps → 35% - 14% = 21%
    const result = calculateForm2441(make({ agi: d(43000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.21);
  });

  it("Form 2441 Line 8 - credit percentage 20% floor at $45K+", () => {
    // ($45K - $15K) / $2K = 15 steps → 35% - 15% = 20%
    const result = calculateForm2441(make({ agi: d(45000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("Form 2441 Line 8 - credit percentage 20% at very high AGI", () => {
    const result = calculateForm2441(make({ agi: d(500000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("Form 2441 Line 8 - credit percentage at $10K AGI (below threshold)", () => {
    const result = calculateForm2441(make({ agi: d(10000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.35);
  });

  // ── Line 9: Credit amount ───────────────────────────────
  it("Form 2441 Line 9 - credit amount calculated correctly", () => {
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(50000),
    }));
    // Expenses capped at $3K. 20% rate (AGI > $43K). Credit = $3K × 20% = $600
    expect(result.credit.toNumber()).toBe(600);
  });

  it("Form 2441 Line 9 - credit with low AGI gets higher percentage", () => {
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(20000),
      agi: d(20000),
    }));
    // Expenses capped $3K. AGI $20K → ($20K-$15K)/$2K = 2.5 → ceil = 3 steps → 35%-3% = 32%. $3K × 32% = $960
    expect(result.creditPercentage.toNumber()).toBe(0.32);
    expect(result.credit.toNumber()).toBe(960);
  });

  it("Form 2441 Line 9 - zero expenses means zero credit", () => {
    const result = calculateForm2441(make({ careExpenses: d(0) }));
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Form 2441 Line 9 - zero earned income means zero credit", () => {
    const result = calculateForm2441(make({ earnedIncome: d(0) }));
    expect(result.credit.toNumber()).toBe(0);
  });

  // ── Audit trail ─────────────────────────────────────────
  it("produces audit trail for all lines", () => {
    const result = calculateForm2441(make());
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("3");
    expect(lineIds).toContain("4");
    expect(lineIds).toContain("8");
    expect(lineIds).toContain("9");
  });

  // ── Two qualifying individuals ───────────────────────────
  it("Form 2441 Line 3 - expense cap doubles to $6K for two qualifying individuals", () => {
    // Two individuals → cap is $6K, not $3K
    const result = calculateForm2441(make({ careExpenses: d(7000), qualifyingIndividuals: 2 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
  });

  it("Form 2441 Line 3 - expenses exactly at $6K cap for two individuals pass through", () => {
    const result = calculateForm2441(make({ careExpenses: d(6000), qualifyingIndividuals: 2 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
  });

  // ── Expenses above cap: verify capped values ─────────────
  it("Form 2441 Line 3 - expenses well above $3K cap for one person are capped at $3K", () => {
    const result = calculateForm2441(make({ careExpenses: d(10000), qualifyingIndividuals: 1 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
  });

  it("Form 2441 Line 3 - expenses well above $6K cap for two people are capped at $6K", () => {
    const result = calculateForm2441(make({ careExpenses: d(15000), qualifyingIndividuals: 2 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
  });

  // ── AGI exactly at $15K: maximum 35% rate ────────────────
  it("Form 2441 Line 8 - AGI exactly $15,000 yields maximum 35% credit rate", () => {
    const result = calculateForm2441(make({ agi: d(15000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.35);
  });

  it("Form 2441 Line 9 - AGI exactly $15,000 applies 35% to $3K expenses for $1,050 credit", () => {
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    // Capped at $3K, 35% rate → $3K × 35% = $1,050
    expect(result.creditPercentage.toNumber()).toBe(0.35);
    expect(result.credit.toNumber()).toBe(1050);
  });

  // ── AGI at $43K+: minimum 20% rate ───────────────────────
  it("Form 2441 Line 8 - AGI at $43,000 yields 21% credit rate (14 steps)", () => {
    // ($43K - $15K) / $2K = 14 steps → 35% - 14% = 21%
    const result = calculateForm2441(make({ agi: d(43000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.21);
  });

  it("Form 2441 Line 8 - AGI at $45,000 hits 20% floor (15 steps)", () => {
    // ($45K - $15K) / $2K = 15 steps → 35% - 15% = 20%
    const result = calculateForm2441(make({ agi: d(45000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("Form 2441 Line 8 - AGI at $100,000 is clamped at 20% floor", () => {
    const result = calculateForm2441(make({ agi: d(100000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  // ── Credit rate steps: 1% per $2K over $15K ──────────────
  it("Form 2441 Line 8 - rate steps down 1% per $2K bracket: $19K AGI gives 33%", () => {
    // ($19K - $15K) / $2K = 2 steps → 35% - 2% = 33%
    const result = calculateForm2441(make({ agi: d(19000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.33);
  });

  it("Form 2441 Line 8 - rate steps down 1% per $2K bracket: $21K AGI gives 32%", () => {
    // ($21K - $15K) / $2K = 3 steps → 35% - 3% = 32%
    const result = calculateForm2441(make({ agi: d(21000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.32);
  });

  it("Form 2441 Line 8 - rate steps down 1% per $2K bracket: $23K AGI gives 31%", () => {
    // ($23K - $15K) / $2K = 4 steps → 35% - 4% = 31%
    const result = calculateForm2441(make({ agi: d(23000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.31);
  });

  // ── Audit trail: all line IDs present ────────────────────
  it("audit trail contains exactly lines 3, 4, 8, and 9 and no extras", () => {
    const result = calculateForm2441(make());
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toEqual(["3", "4", "8", "9"]);
  });

  it("audit trail line values match returned result fields", () => {
    const result = calculateForm2441(make({
      careExpenses: d(4000),
      qualifyingIndividuals: 2,
      earnedIncome: d(30000),
      agi: d(25000),
    }));
    const byLine = Object.fromEntries(result.lines.map((l) => [l.line, l.value]));
    expect(byLine["3"]).toEqual(result.qualifyingExpenses);
    expect(byLine["4"]).toEqual(result.earnedIncomeLimit);
    expect(byLine["8"]).toEqual(result.creditPercentage);
    expect(byLine["9"]).toEqual(result.credit);
  });

  // ── Zero expenses: zero credit ────────────────────────────
  it("Form 2441 Line 9 - zero care expenses produce zero credit regardless of AGI", () => {
    const result = calculateForm2441(make({ careExpenses: d(0), agi: d(15000) }));
    expect(result.qualifyingExpenses.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Form 2441 Line 9 - zero care expenses produce zero credit at minimum-rate AGI", () => {
    const result = calculateForm2441(make({ careExpenses: d(0), agi: d(200000) }));
    expect(result.credit.toNumber()).toBe(0);
  });

  // ── MFS: returns zero credit (handled in federal pipeline) ─
  // MFS filers are ineligible for the credit per IRS Form 2441 instructions.
  // The federal pipeline is responsible for zeroing the credit for MFS filers
  // before calling calculateForm2441; a caller that passes $0 expenses to
  // represent an MFS filer should receive $0 credit.
  it("Form 2441 Line 9 - MFS scenario: zero expenses passed by pipeline yields zero credit", () => {
    // Simulate what the federal pipeline does for an MFS filer: passes $0 expenses
    const result = calculateForm2441(make({ careExpenses: d(0) }));
    expect(result.credit.toNumber()).toBe(0);
  });

  // ── Expense limits: exact boundary values ──────────────────
  it("Form 2441 Line 3 - expenses exactly at $3K for one qualifying individual pass through", () => {
    const result = calculateForm2441(make({ careExpenses: d(3000), qualifyingIndividuals: 1 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
  });

  it("Form 2441 Line 3 - expenses $3,001 for one qualifying individual capped at $3K", () => {
    const result = calculateForm2441(make({ careExpenses: d(3001), qualifyingIndividuals: 1 }));
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
  });

  // ── Credit percentage phase-down: boundary at exactly $15K ─
  it("Form 2441 Line 8 - AGI below $15K still yields maximum 35%", () => {
    const result = calculateForm2441(make({ agi: d(5000), earnedIncome: d(5000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.35);
  });

  it("Form 2441 Line 8 - AGI $44,999 yields 20% (fraction rounds up to 15 steps per IRS)", () => {
    // ($44,999 - $15,000) / $2,000 = 14.9995 → ceil = 15 steps → 35% - 15% = 20%
    const result = calculateForm2441(make({ agi: d(44999) }));
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  // ── Ceiling rounding regression tests (IRS: "next higher whole number") ──
  it("Form 2441 Line 8 - AGI $15,001 triggers first step reduction to 34% (IRS Pub 503 table)", () => {
    // $15,001 - $15,000 = $1, $1/$2K = 0.0005 → ceil = 1 → 35%-1% = 34%
    const result = calculateForm2441(make({ agi: d(15001), earnedIncome: d(50000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.34);
  });

  it("Form 2441 Line 8 - AGI $16,999 still yields 34% (within $15,001-$17,000 bracket)", () => {
    // $16,999 - $15,000 = $1,999, $1,999/$2K = 0.9995 → ceil = 1 → 34%
    const result = calculateForm2441(make({ agi: d(16999), earnedIncome: d(50000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.34);
  });

  it("Form 2441 Line 8 - AGI $17,001 drops to 33% (enters $17,001-$19,000 bracket)", () => {
    // $17,001 - $15,000 = $2,001, $2,001/$2K = 1.0005 → ceil = 2 → 33%
    const result = calculateForm2441(make({ agi: d(17001), earnedIncome: d(50000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.33);
  });

  it("Form 2441 Line 8 - AGI $43,000 yields 21% (on-boundary, last step before floor)", () => {
    // $43,000 - $15,000 = $28,000, $28K/$2K = 14 → ceil = 14 → 35%-14% = 21%
    const result = calculateForm2441(make({ agi: d(43000), earnedIncome: d(50000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.21);
  });

  it("Form 2441 Line 8 - AGI $43,001 hits 20% floor (IRS Pub 503: 'Over $43,000')", () => {
    // $43,001 - $15,000 = $28,001, $28,001/$2K = 14.0005 → ceil = 15 → 35%-15% = 20%
    const result = calculateForm2441(make({ agi: d(43001), earnedIncome: d(50000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("Form 2441 Line 9 - AGI $30,500 credit uses ceiling step count (IRS rounding)", () => {
    // $30,500 - $15,000 = $15,500, $15,500/$2K = 7.75 → ceil = 8 → 35%-8% = 27%
    // Credit = $3,000 × 27% = $810
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(30500),
    }));
    expect(result.creditPercentage.toNumber()).toBe(0.27);
    expect(result.credit.toNumber()).toBe(810);
  });

  // ── MFS restriction: zero earned income simulates MFS disqualification ─
  it("Form 2441 Line 9 - MFS scenario: zero earned income yields zero credit even with expenses", () => {
    // MFS filers have $0 earned-income limit passed by the pipeline
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(0),
      agi: d(15000),
    }));
    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  // ── Earned income limitation: lower-earning spouse caps the credit ─
  it("Form 2441 Line 4 - earned income of $1,500 limits qualifying expenses for two individuals", () => {
    const result = calculateForm2441(make({
      careExpenses: d(8000),
      qualifyingIndividuals: 2,
      earnedIncome: d(1500),
      agi: d(15000),
    }));
    // Expenses capped at $6K, then limited to $1,500 earned income
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(1500);
    // Credit = $1,500 × 35% = $525
    expect(result.credit.toNumber()).toBe(525);
  });

  // ── Zero expenses: full pipeline produces zeros ────────────
  it("Form 2441 - zero expenses produce zero across all result fields", () => {
    const result = calculateForm2441(make({
      careExpenses: d(0),
      qualifyingIndividuals: 2,
      earnedIncome: d(50000),
      agi: d(30000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(0);
    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  // ── Audit trail verification: formulas and descriptions ────
  it("audit trail records correct form name and descriptions for each line", () => {
    const result = calculateForm2441(make({
      careExpenses: d(4000),
      qualifyingIndividuals: 1,
      earnedIncome: d(30000),
      agi: d(25000),
    }));
    const line3 = result.lines.find((l) => l.line === "3")!;
    expect(line3.form).toBe("Form 2441");
    expect(line3.description).toBe("Qualifying expenses");
    expect(line3.value.toNumber()).toBe(3000);

    const line4 = result.lines.find((l) => l.line === "4")!;
    expect(line4.form).toBe("Form 2441");
    expect(line4.description).toBe("Earned income limit");
    expect(line4.value.toNumber()).toBe(3000);

    const line8 = result.lines.find((l) => l.line === "8")!;
    expect(line8.form).toBe("Form 2441");
    expect(line8.description).toBe("Credit percentage");
    // AGI $25K → ($25K-$15K)/$2K = 5 steps → 35%-5% = 30%
    expect(line8.value.toNumber()).toBe(0.30);

    const line9 = result.lines.find((l) => l.line === "9")!;
    expect(line9.form).toBe("Form 2441");
    expect(line9.description).toBe("Dependent care credit");
    // $3,000 × 30% = $900
    expect(line9.value.toNumber()).toBe(900);
  });

  // ── End-to-end: two qualifying individuals with max credit ─
  it("Form 2441 Line 9 - two qualifying individuals at $15K AGI get maximum $2,100 credit", () => {
    const result = calculateForm2441(make({
      careExpenses: d(10000),
      qualifyingIndividuals: 2,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    // Expenses capped at $6K, 35% rate → $6K × 35% = $2,100
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
    expect(result.creditPercentage.toNumber()).toBe(0.35);
    expect(result.credit.toNumber()).toBe(2100);
  });

  // ── Credit percentage step-down: 35% at $15K, 20% at $43K+ ─
  it("Form 2441 Line 8 - step-down comparison: 35% at $15K AGI vs 20% floor above $43K", () => {
    // Maximum rate applies at or below the $15K threshold
    const lowAgi = calculateForm2441(make({ agi: d(15000) }));
    expect(lowAgi.creditPercentage.toNumber()).toBe(0.35);

    // Floor is reached at $45K ($45K-$15K)/$2K = 15 steps → 35%-15% = 20%
    const highAgi = calculateForm2441(make({ agi: d(45000) }));
    expect(highAgi.creditPercentage.toNumber()).toBe(0.20);

    // $43K produces 21%, not yet the 20% floor: ($43K-$15K)/$2K = 14 steps → 35%-14% = 21%
    const boundary43K = calculateForm2441(make({ agi: d(43000) }));
    expect(boundary43K.creditPercentage.toNumber()).toBe(0.21);
  });

  // ── One qualifying individual ($3K limit) vs two ($6K limit) ─
  it("Form 2441 Line 3 - same $5K expense yields $3K credit base for one vs $5K for two individuals", () => {
    const oneIndividual = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(50000),
    }));
    // Capped at $3K → 20% → $600
    expect(oneIndividual.qualifyingExpenses.toNumber()).toBe(3000);
    expect(oneIndividual.credit.toNumber()).toBe(600);

    const twoIndividuals = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 2,
      earnedIncome: d(50000),
      agi: d(50000),
    }));
    // Under $6K cap → passes through at $5K → 20% → $1,000
    expect(twoIndividuals.qualifyingExpenses.toNumber()).toBe(5000);
    expect(twoIndividuals.credit.toNumber()).toBe(1000);
  });

  // ── Earned income limitation: lower-earning spouse caps credit ─
  it("Form 2441 Line 4 - lower-earning spouse income of $2,500 caps qualifying expenses for two individuals", () => {
    // MFJ: higher earner makes $80K; lower earner makes $2,500
    // Expenses $6K capped; then limited to lower earner's $2,500
    const result = calculateForm2441(make({
      careExpenses: d(8000),
      qualifyingIndividuals: 2,
      earnedIncome: d(2500), // lower-earning spouse's income
      agi: d(82500),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(2500);
    // Credit = $2,500 × 20% (AGI $82,500 > $45K floor) = $500
    expect(result.credit.toNumber()).toBe(500);
  });

  // ── MFS: not eligible for dependent care credit ─────────────
  // IRC §21(e)(2) bars MFS filers from claiming the dependent care credit.
  // The federal.ts orchestrator enforces this by skipping Form 2441 entirely for
  // MFS filers. At the form level, the equivalent is passing $0 care expenses
  // (what the pipeline effectively does). These tests document that contract.
  it("Form 2441 Line 9 - MFS contract: $0 expenses produce $0 credit regardless of high earned income", () => {
    const result = calculateForm2441(make({
      careExpenses: d(0),
      qualifyingIndividuals: 2,
      earnedIncome: d(120000),
      agi: d(120000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(0);
    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  // ── Employer-provided dependent care benefits (FSA) reducing eligible expenses ─
  // Per IRS Form 2441 Part III, employer-provided dependent care benefits (e.g. FSA)
  // reduce the qualifying expenses before the $3K/$6K cap is applied. The caller is
  // responsible for reducing careExpenses by the FSA amount prior to calling
  // calculateForm2441 (this matches how federal.ts feeds the form).
  it("Form 2441 Line 3 - FSA benefit of $2K pre-reduces expenses: $5K - $2K = $3K fed to the form", () => {
    // Taxpayer paid $5K in care, but $2K was covered by employer FSA.
    // Net eligible expenses = $3K, which exactly hits the one-individual cap.
    const fsaAmount = d(2000);
    const grossExpenses = d(5000);
    const netExpenses = grossExpenses.minus(fsaAmount); // $3,000

    const result = calculateForm2441(make({
      careExpenses: netExpenses,
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(50000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
    // 20% rate (AGI $50K > $45K floor) → $3,000 × 20% = $600
    expect(result.credit.toNumber()).toBe(600);
  });

  it("Form 2441 Line 3 - large FSA benefit reduces expenses below $3K cap for one individual", () => {
    // Taxpayer paid $8K in care; $5K covered by FSA. Net = $3K - remainder
    // actually $8K - $5K = $3K, which is at the cap; use $8K - $6K = $2K instead
    const result = calculateForm2441(make({
      careExpenses: d(2000), // $8K gross - $6K FSA benefit
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    // $2K is under $3K cap, so it passes through. 35% rate → $2K × 35% = $700
    expect(result.qualifyingExpenses.toNumber()).toBe(2000);
    expect(result.credit.toNumber()).toBe(700);
  });

  // ── AGI at exact step-down boundaries ────────────────────────
  it("Form 2441 Line 8 - AGI step-down boundaries: each $2K bracket reduces rate by exactly 1%", () => {
    const cases: Array<[number, number]> = [
      [15000, 0.35], // baseline: no reduction
      [15001, 0.34], // first reduced bracket begins immediately above $15K
      [17000, 0.34], // top of the first reduced bracket
      [19000, 0.33], // 2 steps
      [21000, 0.32], // 3 steps
      [23000, 0.31], // 4 steps
      [43000, 0.21], // 14 steps
      [43001, 0.20], // any fraction into the next $2K bracket hits the 20% floor
      [44999, 0.20], // still at the 20% floor inside the $43,001-$45,000 bracket
      [45000, 0.20], // 15 steps → hits 20% floor
      [47000, 0.20], // 16 steps → still floored at 20%
    ];
    for (const [agi, expectedRate] of cases) {
      const result = calculateForm2441(make({ agi: d(agi) }));
      expect(result.creditPercentage.toNumber(), `AGI $${agi}`).toBe(expectedRate);
    }
  });

  // ── Very high childcare expenses capped at $3K/$6K ───────────
  it("Form 2441 Line 3 - $50K in expenses for one individual is still capped at $3K", () => {
    const result = calculateForm2441(make({
      careExpenses: d(50000),
      qualifyingIndividuals: 1,
      earnedIncome: d(200000),
      agi: d(200000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
    // Credit = $3,000 × 20% = $600
    expect(result.credit.toNumber()).toBe(600);
  });

  it("Form 2441 Line 3 - $50K in expenses for two individuals is still capped at $6K", () => {
    const result = calculateForm2441(make({
      careExpenses: d(50000),
      qualifyingIndividuals: 2,
      earnedIncome: d(200000),
      agi: d(200000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
    // Credit = $6,000 × 20% = $1,200
    expect(result.credit.toNumber()).toBe(1200);
  });

  // ── Credit as nonrefundable (can't exceed tax liability) ─────
  // The dependent care credit is nonrefundable under IRC §21. The $3K/$6K cap
  // already limits the raw credit to at most $1,050 (one) or $2,100 (two).
  // The further constraint that credit ≤ tax liability is enforced by federal.ts
  // (which passes taxLiability to Form 8812 and similar forms). At the Form 2441
  // level the function returns the computed credit unconstrained by liability,
  // so that federal.ts can apply the nonrefundable cap in one place.
  // These tests document that the function returns the computed credit value and
  // that callers are responsible for capping against liability.
  it("Form 2441 Line 9 - maximum credit for one individual at lowest AGI is $1,050 (35% of $3K)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    // $3,000 × 35% = $1,050 — this is the theoretical maximum for one qualifying individual
    expect(result.credit.toNumber()).toBe(1050);
  });

  it("Form 2441 Line 9 - maximum credit for two individuals at lowest AGI is $2,100 (35% of $6K)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(6000),
      qualifyingIndividuals: 2,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    // $6,000 × 35% = $2,100 — theoretical maximum for two qualifying individuals
    expect(result.credit.toNumber()).toBe(2100);
  });

  // ── Audit trail line verification ────────────────────────────
  it("audit trail line 3 records the capped qualifying expense amount, not the raw input", () => {
    const result = calculateForm2441(make({
      careExpenses: d(9000), // far above cap
      qualifyingIndividuals: 2,
      earnedIncome: d(50000),
      agi: d(25000),
    }));
    const line3 = result.lines.find((l) => l.line === "3")!;
    expect(line3.form).toBe("Form 2441");
    expect(line3.description).toBe("Qualifying expenses");
    // Capped at $6K despite $9K input
    expect(line3.value.toNumber()).toBe(6000);
    expect(line3.value).toEqual(result.qualifyingExpenses);
  });

  it("audit trail line 9 value equals qualifying expenses times credit percentage", () => {
    const result = calculateForm2441(make({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(19000), // 2 steps → 33%
    }));
    const line9 = result.lines.find((l) => l.line === "9")!;
    expect(line9.form).toBe("Form 2441");
    expect(line9.description).toBe("Dependent care credit");
    // $3,000 × 33% = $990
    expect(line9.value.toNumber()).toBe(990);
    expect(line9.value).toEqual(result.credit);
  });
});

// Spec: spec/federal/form-2441.yaml validation2026; IRC 21(a)(2), (c), (d).
describe("Form 2441 2026", () => {
  const current = (overrides: Partial<Form2441Input> = {}): Form2441Input => make({
    taxYear: 2026, filingStatus: "single", eligibilityConfirmed: true,
    excludedDependentCareBenefits: d("0"), ...overrides,
  });

  it("2026 rates follow both statutory phase-downs", () => {
    for (const [agi, nonjoint, joint] of [
      ["15000", "0.50", "0.50"], ["15000.01", "0.49", "0.49"],
      ["43000", "0.36", "0.36"], ["43001", "0.35", "0.35"],
      ["75000", "0.35", "0.35"], ["75001", "0.34", "0.35"],
      ["103000", "0.21", "0.35"], ["103001", "0.20", "0.35"],
      ["150000", "0.20", "0.35"], ["150001", "0.20", "0.34"],
      ["154000", "0.20", "0.34"], ["154001", "0.20", "0.33"],
      ["206000", "0.20", "0.21"], ["206001", "0.20", "0.20"],
    ]) {
      expect(calculateForm2441(current({ agi: d(agi) })).creditPercentage.toString()).toBe(d(nonjoint).toString());
      expect(calculateForm2441(current({ agi: d(agi), filingStatus: "married_filing_jointly", spouseEarnedIncome: d("60000") })).creditPercentage.toString()).toBe(d(joint).toString());
    }
    expect(calculateForm2441(make({ taxYear: 2025, agi: d("15000") })).credit.toString()).toBe("1050");
    expect(calculateForm2441(current({ agi: d("15000") })).credit.toString()).toBe("1500");
  });

  it("2026 requires confirmed facts and separate spouse income", () => {
    for (const override of [
      { filingStatus: undefined }, { eligibilityConfirmed: undefined },
      { excludedDependentCareBenefits: undefined },
      { filingStatus: "married_filing_jointly" as const, spouseEarnedIncome: undefined },
      { taxYear: 2027 },
    ]) expect(() => calculateForm2441(current(override))).toThrow();
    const joint = calculateForm2441(current({ filingStatus: "married_filing_jointly", spouseEarnedIncome: d("1000"), agi: d("15000") }));
    expect(joint.credit.toString()).toBe("500");
    expect(calculateForm2441(current({ filingStatus: "married_filing_separately" })).credit.toString()).toBe("0");
  });

  it("2026 reduces expenses and cap by excluded benefits", () => {
    const remaining = calculateForm2441(current({ careExpenses: d("4500"), qualifyingIndividuals: 2,
      excludedDependentCareBenefits: d("3000"), agi: d("15000") }));
    expect(remaining.qualifyingExpenses.toString()).toBe("1500");
    expect(remaining.credit.toString()).toBe("750");
    expect(calculateForm2441(current({ excludedDependentCareBenefits: d("7500") })).credit.toString()).toBe("0");
    expect(calculateForm2441(current({ earnedIncome: d("-100") })).credit.toString()).toBe("0");
    expect(calculateForm2441(current({ qualifyingIndividuals: 0 })).credit.toString()).toBe("0");
    expect(calculateForm2441(current({ eligibilityConfirmed: false })).credit.toString()).toBe("0");
    for (const overrides of [{careExpenses: d("-1")}, {careExpenses: d("Infinity")}, {earnedIncome: d("NaN")}, {spouseEarnedIncome: d("Infinity")}, {agi: d("NaN")}]) {
      expect(() => calculateForm2441(current(overrides))).toThrow();
    }
    expect(() => calculateForm2441(current({ excludedDependentCareBenefits: d("-1") }))).toThrow();
  });
});

// Spec: spec/federal/form-2441.yaml lines 10–11.
it("care credit preserves tentative amount and applies actual tax limit", () => {
  const result = calculateForm2441(make({agi:d("15000"),taxLiabilityLimit:d("123")}));
  expect(result.credit.toString()).toBe("123");
  expect(result.lines.find(line=>line.line==="9")?.value.toString()).toBe("1050");
  expect(result.lines.find(line=>line.line==="10")?.value.toString()).toBe("123");
  expect(result.lines.find(line=>line.line==="11")?.value.toString()).toBe("123");
  expect(calculateForm2441(make({taxLiabilityLimit:d("0")})).credit.toString()).toBe("0");
  for(const amount of ["-1","NaN","Infinity"]) expect(()=>calculateForm2441(make({taxLiabilityLimit:d(amount)}))).toThrow();
});
