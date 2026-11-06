// Spec: spec/federal/schedule-1-a.yaml
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateSchedule1A } from "@/engine/schedules/schedule-1-a.js";
import { Schedule1ASchema, TaxpayerSchema } from "@/models/inputs.js";
const d = (x: string) => new Decimal(x);
const taxpayer = TaxpayerSchema.parse({ taxYear: 2026, filingStatus: "single", primary: { firstName: "Test", lastName: "Person", ssn: "900-00-0001", dateOfBirth: "1962-01-01" }, address: { street: "1 Test", city: "Test", state: "TX", zip: "00000" } });
const facts = { primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: [] };
const tip = { owner: "primary", employer: "Synthetic cafe", qualifiedW2Tips: "20000", qualifiedForm4137Tips: "0", occupationCode: "102", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true };
const overtime = { owner: "primary", qualifiedPremium: "15000", reportedCompensation: "40000", requiredByFlsa: true };
const vehicle = { vin: "1HGCM82633A004352", acquiredDate: "2025-01-01", loanOriginationDate: "2025-01-01", interestPaid: "12000", businessInterestDeducted: "0", nonqualifyingInterest: "0", firstLien: true, originalUse: true, finalAssemblyUnitedStates: true, personalUse: true, vehicleType: "car", grossVehicleWeightRating: 13999, relatedParty: false, lease: false, fleet: false, salvageOrScrap: false, refinanced: false };
function calc(input: Record<string, unknown> = {}, magi = "50000", person = taxpayer) {
  return calculateSchedule1A({ taxpayer: person, agi: d(magi), foreignExcludedIncome: d("0"), facts: Schedule1ASchema.parse({ ...facts, ...input }), standardDeductionFacts: { primaryDeathDate: null, spouseDeathDate: null } });
}
describe("Schedule 1-A additional deductions", () => {
  it.each([["150999.99", "20000"], ["151000", "19900"], ["350000", "0"]])("floors tip phase-down steps at MAGI %s", (magi, expected) => {
    expect(calc({ employeeTips: [tip] }, magi).tipsDeduction.toString()).toBe(expected);
  });
  it("uses the maximum employee report for each employer without counting overlap twice", () => {
    expect(calc({ employeeTips: [{ ...tip, qualifiedW2Tips: "3000", qualifiedForm4137Tips: "3500" }, { ...tip, employer: "Second cafe", qualifiedW2Tips: "2000" }] }).tipsDeduction.toString()).toBe("5500");
  });
  it("applies the per-return tips maximum across spouses", () => {
    const joint = { ...taxpayer, filingStatus: "married_filing_jointly" as const, spouse: { ...taxpayer.primary, firstName: "Spouse" } };
    expect(calc({ spouseSsnEligible: true, employeeTips: [tip, { ...tip, owner: "spouse" }] }, "50000", joint).tipsDeduction.toString()).toBe("25000");
  });
  it("implements the IRS two-business example of $500 plus $1,000 eligible tips", () => {
    const business = { owner: "primary", businessName: "Tutor", qualifiedReportedTips: "500", netProfit: "4500", otherAllocableDeductions: "0", occupationCode: "804", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true };
    expect(calc({ businessTips: [business, { ...business, businessName: "Rideshare", qualifiedReportedTips: "1800", netProfit: "1000" }] }).tipsDeduction.toString()).toBe("1500");
  });
  it.each(["eligibleOccupation", "voluntaryCashTips", "lawfulActivity", "meetsSstbRuleOrTransition"])("excludes tips failing %s", key => {
    expect(calc({ employeeTips: [{ ...tip, [key]: false }] }).tipsDeduction.toString()).toBe("0");
  });
  it.each([["150999.99", "12500"], ["151000", "12400"], ["275000", "0"]])("caps and floors overtime steps at %s", (magi, expected) => {
    expect(calc({ overtime: [overtime] }, magi).overtimeDeduction.toString()).toBe(expected);
  });
  it("excludes contractual overtime not required by FLSA", () => {
    expect(calc({ overtime: [{ ...overtime, requiredByFlsa: false }] }).overtimeDeduction.toString()).toBe("0");
  });
  it.each([["100000", "10000"], ["100000.01", "9800"], ["101000", "9800"], ["101000.01", "9600"], ["150000", "0"]])("ceils vehicle phase-down steps at %s", (magi, expected) => {
    expect(calc({ vehicleLoans: [vehicle] }, magi).vehicleInterestDeduction.toString()).toBe(expected);
  });
  it("subtracts business and nonqualifying interest before capping", () => {
    expect(calc({ vehicleLoans: [{ ...vehicle, interestPaid: "5000", businessInterestDeducted: "2000", nonqualifyingInterest: "500" }] }).vehicleInterestDeduction.toString()).toBe("2500");
  });
  it.each([{ originalUse: false }, { finalAssemblyUnitedStates: false }, { firstLien: false }, { personalUse: false }, { grossVehicleWeightRating: 14000 }, { relatedParty: true }, { lease: true }, { fleet: true }, { salvageOrScrap: true }, { acquiredDate: "2024-12-31" }])("excludes an ineligible vehicle %j", changes => {
    expect(calc({ vehicleLoans: [{ ...vehicle, ...changes }] }).vehicleInterestDeduction.toString()).toBe("0");
  });
  it.each([["1962-01-01", "6000"], ["1962-01-02", "0"]])("uses the January 1 age rule for %s", (dateOfBirth, expected) => {
    expect(calc({ seniorOwners: ["primary"] }, "75000", { ...taxpayer, primary: { ...taxpayer.primary, dateOfBirth } }).seniorDeduction.toString()).toBe(expected);
  });
  it("phases down each eligible spouse's $6,000 independently", () => {
    const joint = { ...taxpayer, filingStatus: "married_filing_jointly" as const, spouse: { ...taxpayer.primary, firstName: "Spouse" } };
    expect(calc({ seniorOwners: ["primary", "spouse"], spouseSsnEligible: true }, "200000", joint).seniorDeduction.toString()).toBe("6000");
  });
  it("rounds the shared per-person senior amount before adding spouses", () => {
    const joint = { ...taxpayer, filingStatus: "married_filing_jointly" as const, spouse: { ...taxpayer.primary, firstName: "Spouse" } };
    expect(calc({ seniorOwners: ["primary", "spouse"], spouseSsnEligible: true }, "200008.33", joint).seniorDeduction.toString()).toBe("6000");
  });
  it("does not claim a spouse deduction on a nonjoint return", () => {
    expect(() => calc({ seniorOwners: ["spouse"], spouseSsnEligible: true }, "50000", { ...taxpayer, spouse: { ...taxpayer.primary } })).toThrow(/joint/i);
  });
  it("adds all exclusions to MAGI before applying phase-down", () => {
    expect(calc({ seniorOwners: ["primary"], excludedPuertoRicoIncome: "5000", form4563Exclusion: "5000" }, "75000").seniorDeduction.toString()).toBe("5400");
  });
  it("MFS blocks tips/overtime/senior but permits qualified vehicle interest", () => {
    const result = calc({ employeeTips: [tip], overtime: [overtime], seniorOwners: ["primary"], vehicleLoans: [vehicle] }, "50000", { ...taxpayer, filingStatus: "married_filing_separately" });
    expect(result.totalDeduction.toString()).toBe("10000");
  });
  it("requires actual SSN eligibility and does not infer it from a formatted SSN", () => {
    expect(calc({ employeeTips: [tip], primarySsnEligible: false }).tipsDeduction.toString()).toBe("0");
    expect(() => calc({ primarySsnEligible: undefined })).toThrow();
  });
  it("rejects duplicate employers, missing spouse, excessive premium, invalid dates and unqualified refinance", () => {
    expect(() => calc({ employeeTips: [tip, tip] })).toThrow(/duplicate/i);
    expect(() => calc({ seniorOwners: ["spouse"] })).toThrow(/spouse/i);
    expect(() => calc({ overtime: [{ ...overtime, reportedCompensation: "1" }] })).toThrow(/compensation/i);
    expect(() => calc({ vehicleLoans: [{ ...vehicle, acquiredDate: "2026-02-30" }] })).toThrow(/date/i);
    expect(() => calc({ vehicleLoans: [{ ...vehicle, refinanced: true }] })).toThrow(/refinanc/i);
  });
  it("rejects years not covered by this implementation and negative money", () => {
    expect(() => calc({}, "0", { ...taxpayer, taxYear: 2024 })).toThrow(/year/i);
    expect(() => calc({ overtime: [{ ...overtime, qualifiedPremium: "-1" }] })).toThrow();
  });
});

describe("Schedule 1-A federal integration", () => {
  it("deducts qualified overtime after AGI without changing payroll or withholding", async () => {
    const { calculateFederalTax } = await import("@/engine/federal.js");
    const { simpleW2Fixture } = await import("../../fixtures/simple-w2.js");
    const baseline = calculateFederalTax(simpleW2Fixture);
    const result = calculateFederalTax({ ...simpleW2Fixture, schedule1A: Schedule1ASchema.parse({ ...facts, overtime: [overtime] }) });
    expect(result.agi.eq(baseline.agi)).toBe(true);
    expect(result.totalWithholding.eq(baseline.totalWithholding)).toBe(true);
    expect(result.taxableIncome.toString()).toBe(baseline.taxableIncome.minus("12500").toString());
    expect(result.allLines.find(line => line.form === "1040" && line.line === "13b")?.value.toString()).toBe("12500");
  });
  it("reduces the QBI taxable-income limitation before computing the deduction", async () => {
    const { calculateFederalTax } = await import("@/engine/federal.js");
    const { TaxYearInputSchema } = await import("@/models/inputs.js");
    const input = TaxYearInputSchema.parse({ taxpayer: { ...taxpayer, taxYear: 2025, primary: { ...taxpayer.primary, dateOfBirth: "1950-01-01" } }, form1099Div: [{ payer: "Synthetic REIT", ordinaryDividends: "20000", section199ADividends: "20000" }] });
    const baseline = calculateFederalTax(input);
    expect(baseline.form8995?.qbiDeduction.gt(0)).toBe(true);
    const result = calculateFederalTax({ ...input, schedule1A: Schedule1ASchema.parse({ ...facts, seniorOwners: ["primary"] }) });
    expect(result.taxableIncome.toString()).toBe("0");
    expect(result.allLines.find(line => line.form === "1040" && line.line === "13")?.value.toString()).toBe("0");
  });
  it("explicitly rejects unsupported business-tip QBI coordination", async () => {
    const { calculateFederalTax } = await import("@/engine/federal.js");
    const { simpleW2Fixture } = await import("../../fixtures/simple-w2.js");
    const businessTips = [{ ...tip, businessName: "Tutor", qualifiedReportedTips: "500", netProfit: "4500", otherAllocableDeductions: "0" }];
    expect(() => calculateFederalTax({ ...simpleW2Fixture, schedule1A: Schedule1ASchema.parse({ ...facts, businessTips }) })).toThrow(/business.*QBI/i);
  });
});
