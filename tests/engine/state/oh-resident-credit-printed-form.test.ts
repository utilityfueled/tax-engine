/** Spec: spec/state/oh-resident-credit.yaml; independent primary-source originals pinned before outputs. */
import { describe, expect, it } from "vitest";
import { calculateOhioResidentCredit } from "@/engine/state/oh-resident-credit.js";

const single = { stateCode: "NY", incomeType: "other" as const, doubleTaxedIncome: "10000", taxPaid: "10000" };
describe("Actual 2025 Ohio IT RC printed method", () => {
  it("Ohio RC aggregates printed columns before the statutory minimum", () => {
    // Independent original bc7d170c: per-state minima incorrectly yield300.
    const result = calculateOhioResidentCredit({ ohioAgi: "100000", ohioTaxBeforeCredits: "2000", otherStates: [
      { ...single, taxPaid: "1000" }, { ...single, stateCode: "CA", taxPaid: "100" },
    ] });
    expect(result.totalResidentCredit.toFixed(0)).toBe("400");
    expect(result.lines.find(row => row.line === "1")?.value.toFixed(0)).toBe("20000");
    expect(result.lines.find(row => row.line === "2")?.value.toFixed(0)).toBe("1100");
    expect(result.lines.find(row => row.line === "7")?.value.toFixed(0)).toBe("400");
    expect(result.stateDetails).toHaveLength(2);
    for (const row of result.stateDetails) expect(Object.hasOwn(row, "credit")).toBe(false);
  });
  it("Ohio RC truncates the actual aggregate ratio before dollar rounding", () => {
    // Independent supplemental ff72186a: untruncated result1668 is wrong.
    const result = calculateOhioResidentCredit({ ohioAgi: "30000", ohioTaxBeforeCredits: "5003", otherStates: [single] });
    expect(result.lines.find(row => row.line === "4")?.value.toFixed(4)).toBe("0.3333");
    expect(result.lines.find(row => row.line === "6")?.value.toFixed(0)).toBe("1667");
    expect(result.totalResidentCredit.toFixed(0)).toBe("1667");
  });
  it("Ohio RC uses actual tax available after earlier credits", () => {
    const result = calculateOhioResidentCredit({ ohioAgi: "30000", ohioTaxBeforeCredits: "775", otherStates: [{ ...single, doubleTaxedIncome: "20000", taxPaid: "1000" }] });
    expect(result.lines.find(row => row.line === "5")?.value.toFixed(0)).toBe("775");
    expect(result.totalResidentCredit.toFixed(0)).toBe("517");
    const cap = calculateOhioResidentCredit({ ohioAgi: "30000", ohioTaxBeforeCredits: "1000", otherStates: [
      { ...single, doubleTaxedIncome: "20000", taxPaid: "900" },
      { ...single, stateCode: "CA", doubleTaxedIncome: "20000", taxPaid: "900" },
    ] });
    expect(cap.lines.find(row => row.line === "4")?.value.toFixed(4)).toBe("1.0000");
    expect(cap.totalResidentCredit.toFixed(0)).toBe("1000");
  });
  it("Ohio RC retains known zero and nonpositive tax-base controls", () => {
    for (const ohioAgi of ["0", "-5000", "30000"]) {
      const result = calculateOhioResidentCredit({ ohioAgi, ohioTaxBeforeCredits: "0", otherStates: [{ ...single, doubleTaxedIncome: "0", taxPaid: "0" }] });
      expect(result.totalResidentCredit.toFixed(0)).toBe("0");
      expect(result.lines.filter(row => /^[1-7]$/u.test(row.line))).toHaveLength(7);
    }
  });
  it("Ohio RC rejects invalid actual source pairs before any zero-base shortcut", () => {
    for (const otherStates of [
      [{ ...single, doubleTaxedIncome: "NaN" }], [{ ...single, taxPaid: "Infinity" }],
      [{ ...single, doubleTaxedIncome: "-1" }], [{ ...single, taxPaid: "-1" }],
      [{ ...single, doubleTaxedIncome: "0" }], [{ ...single, taxPaid: "0" }],
      [{ ...single, stateCode: "TX" }], [{ ...single, stateCode: "OH" }],
      [{ ...single, doubleTaxedIncome: "" }], [{ ...single, taxPaid: " " }],
    ]) expect(() => calculateOhioResidentCredit({ ohioAgi: "0", ohioTaxBeforeCredits: "0", otherStates })).toThrow(/Ohio/u);
  });
});
