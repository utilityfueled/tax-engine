// Spec: spec/federal/taxable-refund-worksheet.yaml — origin_year
import { describe, expect, it } from "vitest";
import { calculateTaxableRefundWorksheet } from "@/engine/forms/taxable-refund-worksheet.js";
import { TaxableRefundWorksheetSchema } from "@/models/inputs.js";
const facts = {
  priorTaxYear: 2025, priorYearItemized: true, priorYearItemizedTotal: "60000",
  priorYearStandardDeduction: "15750", priorYearStateLocalTaxesPaid: "41000",
  priorYearPropertyTaxesPaid: "0",
  priorYearFilingStatus: "single" as const, priorYearSaltMagi: "500000",
};
function calculate(overrides: Record<string, unknown> = {}, refund = "5000", receivedTaxYear = 2026) {
  return calculateTaxableRefundWorksheet([{ stateLocalIncomeTaxRefund: refund }], { ...facts, ...overrides }, receivedTaxYear);
}
describe("Taxable refunds retain their origin year", () => {
  it.each([
    [2024, "500000", "0"], [2025, "500000", "4000"],
    [2025, "500010", "3997"], [2025, "600000", "0"],
    [2026, "505000", "4400"], [2026, "505010", "4397"],
  ])("uses origin %s MAGI %s for an independently derived taxable amount %s", (priorTaxYear, priorYearSaltMagi, expected) => {
    expect(calculate({ priorTaxYear, priorYearSaltMagi }, "5000", 2027).taxableRefund.toString()).toBe(expected);
  });
  it("halves the MFS cap only after the phase-down", () => {
    expect(calculate({ priorYearFilingStatus: "married_filing_separately", priorYearSaltMagi: "260000", priorYearStateLocalTaxesPaid: "21000" }).taxableRefund.toString()).toBe("2500");
  });
  it("includes property taxes in cap headroom and both alternatives", () => {
    expect(calculate({ priorYearStateLocalTaxesPaid: "36000", priorYearPropertyTaxesPaid: "6000", priorYearAlternativeGeneralSalesTaxDeduction: "35000" }).taxableRefund.toString()).toBe("0");
  });
  it("keeps historical cents until the return-line rounding point", () => {
    expect(calculate({ priorYearStateLocalTaxesPaid: "40000.50" }, "5000.25").taxableRefund.toString()).toBe("4999.75");
  });
  it.each([{}, { priorTaxYear: 2025 }, { priorTaxYear: 2026 }])("rejects absent origin year or required MAGI: %j", (extra) => {
    const { priorTaxYear: _year, priorYearSaltMagi: _magi, ...missing } = facts;
    expect(TaxableRefundWorksheetSchema.safeParse({ ...missing, ...extra }).success).toBe(false);
  });
  it("accepts an explicit zero MAGI", () => {
    expect(TaxableRefundWorksheetSchema.safeParse({ ...facts, priorYearSaltMagi: "0" }).success).toBe(true);
  });
  it.each([2017, 2027, undefined])("rejects unavailable or absent origin year %s without using another year", (priorTaxYear) => {
    expect(() => calculate({ priorTaxYear })).toThrow(/year/i);
  });
  it("rejects the same-year recovery branch instead of reporting it as income", () => {
    expect(() => calculate({}, "5000", 2025)).toThrow(/before/i);
  });
  it("rejects a mixed-year 1099-G batch", () => {
    expect(() => calculateTaxableRefundWorksheet([{ stateLocalIncomeTaxRefund: "100", refundTaxYear: 2024 }], facts, 2026)).toThrow(/year/i);
  });
  it("rejects a negative refund instead of producing a negative tax benefit", () => {
    expect(() => calculate({}, "-1")).toThrow(/negative/i);
  });
  it.each(["priorYearPropertyTaxesPaid", "priorYearStateLocalTaxesPaid"])("rejects unknown %s instead of assuming no SALT cap consumption", (field) => {
    expect(() => calculate({ [field]: undefined })).toThrow(/required/i);
    expect(TaxableRefundWorksheetSchema.safeParse({ ...facts, [field]: undefined }).success).toBe(false);
  });
  it.each(["priorYearPropertyTaxesPaid", "priorYearStateLocalTaxesPaid", "priorYearStandardDeduction", "priorYearItemizedTotal"])("rejects negative %s", field => {
    expect(() => calculate({ [field]: "-1" })).toThrow(/negative/i);
  });
  it("accepts negative MAGI after deductible losses, while rejecting nonfinite data", () => {
    expect(calculate({ priorYearSaltMagi: "-1" }).taxableRefund.toString()).toBe("4000");
    expect(() => calculate({ priorYearSaltMagi: "Infinity" })).toThrow(/finite/i);
  });
});
