// Spec: spec/federal/form-6251.yaml
import { describe, it, expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
describe("AMT standard and senior deduction addbacks", () => {
  it("adds back the actual selected standard deduction", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.form6251?.amti.eq(result.agi)).toBe(true);
  });
  it("adds back senior deduction and standard deduction while retaining overtime deduction", () => {
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1950-01-01" } }, schedule1A: { primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", employeeTips: [], businessTips: [], vehicleLoans: [], seniorOwners: ["primary"], overtime: [{ owner: "primary", qualifiedPremium: "1000", reportedCompensation: "1000", requiredByFlsa: true }] } }));
    expect(result.schedule1A?.seniorDeduction.toString()).toBe("5400");
    expect(result.form6251?.amti.toString()).toBe("84000");
  });
  it("does not add an unused standard deduction when itemizing", () => {
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, form1098: [{ lender: "Synthetic lender", mortgageInterestReceived: "30000", outstandingMortgagePrincipal: "100000" }] }));
    expect(result.deductionUsed).toBe("itemized");
    expect(result.form6251?.amti.toString()).toBe("55000");
  });
  it("uses income before the 1040 zero floor when deductions exceed income", () => {
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], wages: "5000" }] }));
    expect(result.taxableIncome.toString()).toBe("0");
    expect(result.form6251?.amti.toString()).toBe("5000");
  });
});
