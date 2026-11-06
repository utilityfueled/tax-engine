/**
 * Tests for Form W-2G gambling income, loss limitation, and withholding.
 * Spec: spec/federal/form-w2g.yaml
 *
 * Verifies that:
 * - W-2G reportable winnings flow to Schedule 1 Line 8b as income
 * - Multiple W-2Gs are summed correctly
 * - Gambling losses on Schedule A are limited to total gambling winnings (IRC §165(d))
 * - W-2G Box 4 federal withholding flows to Form 1040 Line 25d
 * - Manual gambling winnings on Schedule A combine with W-2G winnings for income and loss limitation
 */

import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";

const baseTaxpayer: TaxYearInput["taxpayer"] = {
  taxYear: 2025,
  filingStatus: "single",
  primary: {
    firstName: "Test",
    lastName: "Gambler",
    ssn: "111-22-3333",
    dateOfBirth: "1980-06-15",
  },
  address: {
    street: "100 Casino Blvd",
    city: "Las Vegas",
    state: "NV",
    zip: "89101",
  },
  dependents: [],
};

function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: baseTaxpayer,
    w2s: [
      {
        employer: { name: "Day Job Inc", ein: "99-8765432" },
        wages: "50000",
        federalWithheld: "6000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      },
    ],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    formW2G: [],
    ...overrides,
  };
}

describe("W-2G gambling income", () => {
  // ── Income reporting ────────────────────────────────────

  it("W-2G gambling income - single W-2G reports winnings as income", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Lucky Casino", reportableWinnings: "5000", federalWithheld: "0" },
      ],
    }));
    // Gambling winnings should appear in total income
    // Total income = $50,000 wages + $5,000 gambling = $55,000
    expect(result.totalIncome.toNumber()).toBe(55000);
    // Should show up in the Schedule 1 gambling income line
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    expect(sched1Line8b).toBeDefined();
    expect(sched1Line8b!.value.toNumber()).toBe(5000);
  });

  it("W-2G gambling income - multiple W-2Gs are summed", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino A", reportableWinnings: "3000", federalWithheld: "0" },
        { payer: "Casino B", reportableWinnings: "7000", federalWithheld: "0" },
        { payer: "State Lottery", reportableWinnings: "2000", federalWithheld: "0" },
      ],
    }));
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    expect(sched1Line8b!.value.toNumber()).toBe(12000);
    // Total income = $50,000 + $12,000 = $62,000
    expect(result.totalIncome.toNumber()).toBe(62000);
  });

  it("W-2G gambling income - zero W-2Gs produces zero gambling income", () => {
    const result = calculateFederalTax(makeInput());
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    expect(sched1Line8b!.value.toNumber()).toBe(0);
  });

  it("W-2G gambling income - W-2G winnings plus manual gambling winnings combine for income", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "8000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "2000", // additional unreported winnings
        gamblingLosses: "5000",
      },
    }));
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    // Total gambling income = $8,000 W-2G + $2,000 manual = $10,000
    expect(sched1Line8b!.value.toNumber()).toBe(10000);
  });

  // ── Withholding ─────────────────────────────────────────

  it("W-2G gambling income - withholding flows to Form 1040 Line 25d", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "10000", federalWithheld: "2400" },
      ],
    }));
    // Total withholding = $6,000 from W-2 + $2,400 from W-2G = $8,400
    expect(result.totalWithholding.toNumber()).toBe(8400);
  });

  it("W-2G gambling income - multiple W-2Gs withholding is summed", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino A", reportableWinnings: "5000", federalWithheld: "1200" },
        { payer: "Casino B", reportableWinnings: "8000", federalWithheld: "1920" },
      ],
    }));
    // Total withholding = $6,000 + $1,200 + $1,920 = $9,120
    expect(result.totalWithholding.toNumber()).toBe(9120);
  });

  it("W-2G gambling income - W-2G with zero withholding does not affect withholding total", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "3000", federalWithheld: "0" },
      ],
    }));
    // Only W-2 withholding
    expect(result.totalWithholding.toNumber()).toBe(6000);
  });

  // ── Schedule A gambling loss limitation ──────────────────

  it("W-2G gambling income - losses limited to winnings on Schedule A", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "5000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "8000", // losses exceed winnings
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    // Losses capped at total gambling winnings ($5,000 from W-2G)
    expect(schedALine28!.value.toNumber()).toBe(5000);
  });

  it("W-2G gambling income - losses equal to winnings are fully deductible", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "10000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "10000",
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    expect(schedALine28!.value.toNumber()).toBe(10000);
  });

  it("W-2G gambling income - losses less than winnings are fully deductible", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "10000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "6000",
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    expect(schedALine28!.value.toNumber()).toBe(6000);
  });

  it("W-2G gambling income - zero winnings means zero deductible losses", () => {
    const result = calculateFederalTax(makeInput({
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "5000",
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    expect(schedALine28!.value.toNumber()).toBe(0);
  });

  it("W-2G gambling income - combined W-2G and manual winnings used for loss limit", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "3000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "2000", // manual winnings
        gamblingLosses: "4000",
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    // Total winnings = $3,000 + $2,000 = $5,000 → losses $4,000 < $5,000, fully allowed
    expect(schedALine28!.value.toNumber()).toBe(4000);
  });

  it("W-2G gambling income - combined W-2G and manual winnings cap losses correctly", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "3000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "2000",
        gamblingLosses: "7000", // losses exceed combined $5,000 winnings
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    // Total winnings = $5,000, losses capped at $5,000
    expect(schedALine28!.value.toNumber()).toBe(5000);
  });

  // ── Net tax impact ─────────────────────────────────────

  it("W-2G gambling income - gambling income increases AGI", () => {
    const noGambling = calculateFederalTax(makeInput());
    const withGambling = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "15000", federalWithheld: "0" },
      ],
    }));
    // AGI should increase by $15,000
    expect(withGambling.agi.minus(noGambling.agi).toNumber()).toBe(15000);
  });

  it("W-2G gambling income - gambling income increases taxable income", () => {
    const noGambling = calculateFederalTax(makeInput());
    const withGambling = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "15000", federalWithheld: "0" },
      ],
    }));
    // Taxable income should increase by $15,000 (standard deduction unchanged)
    expect(withGambling.taxableIncome.minus(noGambling.taxableIncome).toNumber()).toBe(15000);
  });

  // ── Audit trail ────────────────────────────────────────

  it("W-2G gambling income - audit trail includes gambling income line", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "5000", federalWithheld: "1200" },
      ],
    }));
    const gamblingLine = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    expect(gamblingLine).toBeDefined();
    expect(gamblingLine!.description).toContain("Gambling");
  });

  it("W-2G gambling income - withholding audit line mentions W-2G", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "5000", federalWithheld: "1200" },
      ],
    }));
    const withholdingLine = result.allLines.find(
      (l) => l.form === "1040" && l.line === "25c"
    );
    expect(withholdingLine).toBeDefined();
    expect(withholdingLine!.formula).toContain("W-2G");
    expect(withholdingLine?.value.toString()).toBe("1200");
  });
});
