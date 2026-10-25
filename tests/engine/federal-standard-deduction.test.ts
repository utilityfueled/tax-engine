// Spec: spec/federal/standard-deduction.yaml
// Draft constants are injected only here; production2026 readiness remains gated.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { mortgageLoan } from "../fixtures/mortgage-source.js";

const facts = { primaryBlind: false, primaryCanBeClaimedAsDependent: false, primaryDeathDate: null,
  dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false };
const base = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, standardDeductionFacts: facts };
describe("Federal standard deduction integration", () => {
  it("uses actual standard worksheet facts and rejects missing2026 facts", () => {
    const senior = calculateFederalTax(TaxYearInputSchema.parse({ ...base,
      taxpayer: { ...base.taxpayer, primary: { ...base.taxpayer.primary, dateOfBirth: "1962-01-01" } },
      standardDeductionFacts: { ...facts, primaryBlind: true } }));
    expect(senior.standardDeduction.toString()).toBe("20200"); //16100+2*2050
    expect(senior.deductionAmount.toString()).toBe("20200");
    expect(senior.allLines.find(l => l.form === "Standard Deduction Worksheet" && l.line === "total")?.value.toString()).toBe("20200");
    const dependent = calculateFederalTax(TaxYearInputSchema.parse({ ...base,
      standardDeductionFacts: { ...facts, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: "5000" } }));
    expect(dependent.standardDeduction.toString()).toBe("5450");
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...base, standardDeductionFacts: undefined }))).toThrow(/standard.*facts.*required/i);
  });

  it("honors the deduction election before and after the itemized limitation", () => {
    const mortgage = [{ sourceId: "1098-one", taxYear: 2026, lender: "Synthetic lender", mortgageInterestReceived: "16500", outstandingMortgagePrincipal: "100000", mortgageOriginationDate: "2020-01-01",
      refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0", propertyTax: "0" }];
    const actualMortgageWorksheet = (interestPaid: string) => ({
      sourceTaxYear: 2026, sourceReference: "Synthetic complete annual mortgage records", sourceFactsConfirmed: true,
      allHomeDebtIncluded: true, priorYearInterestRecoveries: [],
      loans: [mortgageLoan({ lenderName: "Synthetic lender", interestPaid,
        balance: { method: "highest_balance", amount: "100000", sourceReference: "Synthetic annual maximum balance" } })],
    });
    const highIncome = { ...base, form2210: { // Explicit synthetic prior-year exception; unrelated credit/deduction assertions stay intact.
      calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,
      calculationMethod:"regular" as const,withholdingMethod:"equal-installments" as const,priorYearTaxStatus:"no-tax-liability" as const,priorYearFullYear:true,
      priorYearResidentAllYear:true,priorYearTaxForForm2210:"0",priorYearTaxComputationConfirmed:true,
    }, w2s: [{ ...base.w2s[0], wages: "700000" }], form1098: mortgage, mortgageInterestWorksheet: actualMortgageWorksheet("16500") };
    const automatic = calculateFederalTax(TaxYearInputSchema.parse(highIncome));
    expect(automatic.deductionUsed).toBe("standard");
    expect(automatic.deductionAmount.toString()).toBe("16100");
    const elected = calculateFederalTax(TaxYearInputSchema.parse({ ...highIncome, deductionElection: "itemized" }));
    expect(elected.deductionUsed).toBe("itemized");
    expect(elected.deductionAmount.toString()).toBe("15608"); //16500-round(16500*2/37)
    const required = calculateFederalTax(TaxYearInputSchema.parse({ ...highIncome,
      standardDeductionFacts: { ...facts, shortTaxYear: true } }));
    expect(required.deductionUsed).toBe("itemized");
    expect(required.standardDeduction.toString()).toBe("0");
    expect(required.deductionAmount.toString()).toBe("15608");
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...highIncome, deductionElection: "standard",
      standardDeductionFacts: { ...facts, shortTaxYear: true } }))).toThrow(/standard deduction.*ineligible/i);
    const smallItemized = calculateFederalTax(TaxYearInputSchema.parse({ ...base, deductionElection: "itemized" }));
    expect(smallItemized.deductionUsed).toBe("itemized");
    expect(smallItemized.deductionAmount.toString()).toBe("0");
    const forcedStandard = calculateFederalTax(TaxYearInputSchema.parse({ ...highIncome, deductionElection: "standard",
      form1098: [{ ...mortgage[0], mortgageInterestReceived: "30000" }], mortgageInterestWorksheet: actualMortgageWorksheet("30000") }));
    expect(forcedStandard.deductionUsed).toBe("standard");
    expect(forcedStandard.deductionAmount.toString()).toBe("16100");
  });
});
