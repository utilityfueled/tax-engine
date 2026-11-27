/** Form 6251 line 4 and line 1a. Spec: spec/federal/form-6251.yaml */
import { describe, expect, it } from "vitest";
import { calculateForm6251, type Form6251Input } from "@/engine/forms/form-6251.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { d } from "@/utils/decimal.js";

function makeInput(preliminaryAmti: string, overrides: Partial<Form6251Input> = {}): Form6251Input {
  return {
    taxableIncome: d(preliminaryAmti),
    saltDeduction: d("0"),
    regularTax: d("100000"),
    filingStatus: "married_filing_separately",
    isItemizing: true,
    ...overrides,
  };
}

describe("Form 6251 high-income married filing separately addition", () => {
  it("applies the published Form 6251 line 4 addition for separate filers", () => {
    const result = calculateForm6251(makeInput("660200"), FEDERAL_2026_CONSTANTS);

    expect(result.lines.find(line => line.line === "4")?.value.toString()).toBe("670200");
    expect(result.amti.toString()).toBe("670200");
    expect(result.exemption.toString()).toBe("0");
    expect(result.amtBase.toString()).toBe("670200");
    expect(result.tentativeMinimumTax.toString()).toBe("185211");
    expect(result.amt.toString()).toBe("85211");
  });

  it("applies the final 2025 instructions worked example", () => {
    const result = calculateForm6251(makeInput("920350"), getConstants(2025));

    expect(result.amti.toString()).toBe("925350");
    expect(result.exemption.toString()).toBe("0");
    expect(result.amtBase.toString()).toBe("925350");
  });

  it.each([
    ["900350", "900350"],
    ["900352", "900353"],
    ["1174350", "1242850"],
    ["1200000", "1268500"],
  ])("computes the 2025 threshold, rounding and cap at %s", (before, after) => {
    expect(calculateForm6251(makeInput(before), getConstants(2025)).amti.toString()).toBe(after);
  });

  it.each([
    ["640198", "640198"],
    ["640200", "640200"],
    ["640201", "640202"],
    ["640202", "640203"],
    ["780398", "850497"],
    ["780400", "850500"],
    ["800400", "870500"],
  ])("computes the 2026 threshold, rounding and cap at %s", (before, after) => {
    expect(calculateForm6251(makeInput(before), FEDERAL_2026_CONSTANTS).amti.toString()).toBe(after);
  });

  it("records the separate-filer addition on line 4 after the actual ATNOLD", () => {
    const input = makeInput("665200", { saltDeduction: d("5000"), regularNolDeduction: d("0") });
    const full = calculateForm6251({ ...input, alternativeTaxNolDeduction: d("10000") }, FEDERAL_2026_CONSTANTS);
    const line4 = full.lines.find(line => line.line === "4");
    const reduced = calculateForm6251({ ...input, alternativeTaxNolDeduction: d("30000") }, FEDERAL_2026_CONSTANTS);

    expect(full.amti.toString()).toBe("670200");
    expect(line4?.inputs?.["AMTI before MFS addition"]?.toString()).toBe("660200");
    expect(line4?.inputs?.["MFS high-income addition"]?.toString()).toBe("10000");
    expect(reduced.amti.toString()).toBe("640200");
  });

  it("uses the tentative sum before the line 4 addition for the line 2f income-only calculation", () => {
    const input = makeInput("665200", { saltDeduction: d("5000"), regularNolDeduction: d("0"), alternativeTaxNolDeduction: d("0") });
    const tentative = calculateForm6251(input, FEDERAL_2026_CONSTANTS, { incomeOnly: true });

    expect(tentative.amti.toString()).toBe("670200");
    expect(tentative.lines.find(line => line.line === "4")?.inputs?.["MFS high-income addition"]).toBeUndefined();
  });

  it("leaves another filing status outside the separate-filer addition", () => {
    const result = calculateForm6251(makeInput("660200", { filingStatus: "single" }), FEDERAL_2026_CONSTANTS);

    expect(result.amti.toString()).toBe("660200");
    expect(result.lines.find(line => line.line === "4")?.inputs?.["MFS high-income addition"]).toBeUndefined();
  });

  it("identifies the correct Schedule 1-A senior deduction line for each year", () => {
    const input = makeInput("40000", {
      filingStatus: "single",
      totalDeductions: d("26000"),
      seniorDeduction: d("6000"),
    });
    const legacy = calculateForm6251(input, getConstants(2025));
    const draft = calculateForm6251(input, FEDERAL_2026_CONSTANTS);

    expect(legacy.lines.find(line => line.line === "1a")?.formula).toContain("line37");
    expect(draft.lines.find(line => line.line === "1a")?.formula).toContain("draft Schedule 1-A line 43");
    expect(draft.lines.find(line => line.line === "1a")?.value.toString()).toBe("20000");
    expect(draft.lines.find(line => line.line === "1b")?.value.toString()).toBe("46000");
  });
});
