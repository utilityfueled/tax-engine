/**
 * Tests for New Jersey NJ-1040 excess payroll contributions credit.
 * Spec: spec/state/nj-1040-excess-payroll.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ1040ExcessPayroll } from "@/engine/state/nj-1040-excess-payroll.js";

describe("NJ-1040 excess payroll", () => {
  // --- UI/WF/SWF ---

  it("NJ-1040 excess payroll - no excess when single employer under maximum", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalUIWFSWFWithheld: 100,
      totalDIWithheld: 200,
      totalFLIWithheld: 50,
    });
    expect(result.excessUIWFSWF.toNumber()).toBe(0);
    expect(result.excessDI.toNumber()).toBe(0);
    expect(result.excessFLI.toNumber()).toBe(0);
    expect(result.totalExcessPayroll.toNumber()).toBe(0);
  });

  it("NJ-1040 excess payroll - excess UI/WF/SWF with two employers", () => {
    // Two employers each withheld the maximum → total = 2 × $184.02 = $368.04
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalUIWFSWFWithheld: "368.04",
    });
    // Excess = $368.04 - $184.02 = $184.02
    expect(result.excessUIWFSWF.toNumber()).toBe(184.02);
  });

  it("NJ-1040 excess payroll - no excess UI/WF/SWF at exactly maximum", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalUIWFSWFWithheld: "184.02",
    });
    expect(result.excessUIWFSWF.toNumber()).toBe(0);
  });

  it("NJ-1040 excess payroll - excess UI/WF/SWF with three employers", () => {
    // Three employers each withheld full amount
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalUIWFSWFWithheld: "552.06", // 3 × 184.02
    });
    // Excess = $552.06 - $184.02 = $368.04
    expect(result.excessUIWFSWF.toNumber()).toBe(368.04);
  });

  // --- DI ---

  it("NJ-1040 excess payroll - no excess DI at official 2025 maximum", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalDIWithheld: "380.42",
    });
    expect(result.excessDI.toNumber()).toBe(0);
  });

  it("NJ-1040 excess payroll - state plan DI excess uses official 2025 maximum", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalDIWithheld: 500,
    });
    // Excess = $500.00 - $380.42 = $119.58
    expect(result.excessDI.toNumber()).toBe(119.58);
  });

  it("NJ-1040 excess payroll - excess DI with private plan", () => {
    // Private plan has different maximum
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalDIWithheld: "400",
      privatePlanMaxDI: "250",
    });
    // Excess = $400 - $250 = $150
    expect(result.excessDI.toNumber()).toBe(150);
  });

  it("NJ-1040 excess payroll - no excess DI with private plan under max", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalDIWithheld: "200",
      privatePlanMaxDI: "250",
    });
    expect(result.excessDI.toNumber()).toBe(0);
  });

  // --- FLI ---

  it("NJ-1040 excess payroll - excess FLI with two employers", () => {
    // Two employers each withheld max FLI → total = 2 × $545.82 = $1,091.64
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalFLIWithheld: "1091.64",
    });
    // Excess = $1,091.64 - $545.82 = $545.82
    expect(result.excessFLI.toNumber()).toBe(545.82);
  });

  it("NJ-1040 excess payroll - no excess FLI at exactly maximum", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalFLIWithheld: "545.82",
    });
    expect(result.excessFLI.toNumber()).toBe(0);
  });

  it("NJ-1040 excess payroll - no excess FLI under maximum", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalFLIWithheld: 50,
    });
    expect(result.excessFLI.toNumber()).toBe(0);
  });

  // --- Total ---

  it("NJ-1040 excess payroll - total excess sums all categories", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalUIWFSWFWithheld: "368.04", // excess: 184.02
      totalDIWithheld: "500", // excess: 119.58
      totalFLIWithheld: "1091.64", // excess: 545.82
    });
    expect(result.excessUIWFSWF.toNumber()).toBe(184.02);
    expect(result.excessDI.toNumber()).toBe(119.58);
    expect(result.excessFLI.toNumber()).toBe(545.82);
    expect(result.totalExcessPayroll.toNumber()).toBe(849.42);
  });

  it("NJ-1040 excess payroll - total zero when all under maximums", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalUIWFSWFWithheld: 100,
      totalDIWithheld: 0,
      totalFLIWithheld: 50,
    });
    expect(result.totalExcessPayroll.toNumber()).toBe(0);
  });

  // --- Edge cases ---

  it("NJ-1040 excess payroll - all zero inputs", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
    });
    expect(result.excessUIWFSWF.toNumber()).toBe(0);
    expect(result.excessDI.toNumber()).toBe(0);
    expect(result.excessFLI.toNumber()).toBe(0);
    expect(result.totalExcessPayroll.toNumber()).toBe(0);
  });

  it("NJ-1040 excess payroll - Decimal input accepted", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalUIWFSWFWithheld: new Decimal("200.50"),
      totalFLIWithheld: new Decimal("600.25"),
    });
    // UI/WF/SWF: 200.50 - 184.02 = 16.48
    expect(result.excessUIWFSWF.toNumber()).toBe(16.48);
    // FLI: 600.25 - 545.82 = 54.43
    expect(result.excessFLI.toNumber()).toBe(54.43);
  });

  it("NJ-1040 excess payroll - private plan DI with multiple employers", () => {
    // Three employers, each withheld $200 DI under private plan (max $500)
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalDIWithheld: "600",
      privatePlanMaxDI: "500",
    });
    expect(result.excessDI.toNumber()).toBe(100);
  });

  // --- Audit trail ---

  it("NJ-1040 excess payroll - produces audit trail with all lines", () => {
    const result = calculateNJ1040ExcessPayroll({
      taxYear: 2025,
      totalUIWFSWFWithheld: 200,
      totalFLIWithheld: 100,
    });
    expect(result.lines.length).toBe(4);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("59");
    expect(lineIds).toContain("60");
    expect(lineIds).toContain("61");
    expect(lineIds).toContain("59-61-total");
  });
});
