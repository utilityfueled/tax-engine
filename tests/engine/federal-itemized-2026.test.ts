// Spec: spec/federal/itemized-deduction-limit.yaml
// Inject draft constants only in this focused test; production getConstants(2026) remains gated.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { mortgageInput, mortgageLoan } from "../fixtures/mortgage-source.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
// These synthetic itemization scenarios have a confirmed full-year2025 US-resident return with no tax liability.
// This actual fixture fact avoids assuming an unpublished2027 penalty rate while testing deductions.
const form2210 = {calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,
  calculationMethod:"regular",withholdingMethod:"equal-installments",priorYearTaxStatus:"no-tax-liability",priorYearFullYear:true,
  priorYearResidentAllYear:true,priorYearTaxForForm2210:"0",priorYearTaxComputationConfirmed:true};
const base = { ...simpleW2Fixture,form2210, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, w2s: [{ ...simpleW2Fixture.w2s[0], wages: "700000" }] };
const actualMortgage = (interest: string) => {
  const source = mortgageInput([mortgageLoan({interestPaid:interest,balance:{method:"highest_balance",amount:"100000",sourceReference:"Actual synthetic maximum"}})]);
  if (!source.mortgageInterestWorksheet) throw new Error("Missing synthetic mortgage worksheet");
  return {form1098:source.form1098.map(form=>({...form,taxYear:2026})),mortgageInterestWorksheet:{...source.mortgageInterestWorksheet,sourceTaxYear:2026}};
};
describe("2026 federal itemized limitation integration", () => {
  it("reduces itemized deductions after the charitable floor without changing AGI", () => {
    const input = TaxYearInputSchema.parse({ ...base, donations: [{ organization: "Synthetic public charity", type: "cash", amount: "103500", dateOfDonation: "2026-01-01", qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, isPrivateFoundation: false }] });
    const result = calculateFederalTax(input);
    expect(result.agi.toString()).toBe("700000");
    expect(result.itemizedDeductionReduction?.toString()).toBe("3211");
    expect(result.deductionAmount.toString()).toBe("96789");
    expect(result.taxableIncome.toString()).toBe("603211");
    expect(result.form6251?.amti.toString()).toBe("600000");
  });
  it("switches to standard deduction when the overall limit makes it larger", () => {
    const input = TaxYearInputSchema.parse({ ...base, ...actualMortgage("16500") });
    const result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toString()).toBe("16100");
  });
  it("computes QBI before section 68 and subtracts it from the reduction base", () => {
    const input = TaxYearInputSchema.parse({ ...base, w2s: [], form1099Div: [{ payer: "Synthetic REIT", ordinaryDividends: "700000", section199ADividends: "700000" }], ...actualMortgage("100000") });
    const result = calculateFederalTax(input);
    expect(result.form8995A?.qbiDeduction.toString()).toBe("120000");
    expect(result.itemizedDeductionReduction?.toString()).toBe("0");
    expect(result.taxableIncome.toString()).toBe("480000");
  });
  it("rejects unimplemented NOL coordination for 2026", () => {
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...base, priorYear: { nolCarryforward: "1000" } }))).toThrow(/NOL.*coordination/i);
  });
  it("recomputes a taxable-income-limited QBI deduction after switching to standard", () => {
    const input = TaxYearInputSchema.parse({ ...base, w2s: [], form1099Div: [{ payer: "Synthetic REIT", ordinaryDividends: "1000000", section199ADividends: "1000000" }], ...actualMortgage("16500") });
    const result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe("standard");
    expect(result.form8995A?.qbiDeduction.toString()).toBe("196780");
    expect(result.taxableIncome.toString()).toBe("787120");
  });
});
