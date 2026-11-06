// Spec: spec/federal/guided-input.yaml, mortgage-source-qualification
import { describe, expect, it } from "vitest";
import { calculateHomeMortgageInterest } from "@/engine/forms/home-mortgage-interest";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildForm1098Inputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { computeDeductionComparison, emptyDeductionData, loadGuidedFlowState, validateSection } from "@/lib/guided-interview-flow";
import { completeMortgageSource, completeMortgageWorksheet, startCompleteInterview } from "./complete-facts";

function flow() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  state.sectionData.deductions = { ...emptyDeductionData, method: "itemized", mortgageInterest: "100.10", mortgageWorksheet: { ...completeMortgageWorksheet, sourceTaxYear: "2026" }, mortgageEntries: [{ ...completeMortgageSource, sourceTaxYear: "2026", mortgageInterest: "100.10", interestPaidByReturnAmount: "100.10" }] };
  return state;
}

describe("actual mortgage source qualification", () => {
  it("requires actual mortgage qualification rather than interpreting statement amounts as eligibility", () => {
    const state = flow();
    const entry = state.sectionData.deductions!.mortgageEntries![0]!;
    entry.securedDebt = null;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(validateSection(state, "deductions").status).toBe("partial");
    entry.securedDebt = true;
    expect(buildTaxInputFromGuidedData(state)?.form1098?.[0]).toMatchObject({ mortgageInterestReceived: "100.1", outstandingMortgagePrincipal: "250000", refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0", propertyTax: "0" });
    entry.outstandingPrincipal = "0";
    entry.maximumBalanceDuringYear = "9007199254740993.01";
    expect(buildTaxInputFromGuidedData(state)?.mortgageInterestWorksheet?.loans[0]?.balance).toMatchObject({ method: "highest_balance", amount: "9007199254740993.01" });
    entry.maximumBalanceDuringYear = "250000";
    expect(buildTaxInputFromGuidedData(state)?.form1098?.[0]?.outstandingMortgagePrincipal).toBe("0");
    entry.sourceTaxYear = "2025";
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("preserves unsupported mortgage source facts and enforces actual household and debt limits", () => {
    for (const change of [
      { loanType: "refinance" }, { loanType: "heloc" }, { proceedsUse: "mixed" }, { interestPaidByReturn: false },
      { rentalOrBusinessUse: true }, { mortgageCreditCertificate: true }, { specialCircumstances: true },
      { refundOfOverpaidInterest: "0.01" }, { pointsPaid: "1" }, { sourceFactsConfirmed: null },
      { accountHolder: "spouse" }, { propertyTaxPaid: "100", propertyTaxDisbursementConfirmed: null },
      { maximumBalanceDuringYear: "249999.99" },
    ]) {
      const state = flow(); Object.assign(state.sectionData.deductions!.mortgageEntries![0]!, change);
      expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
      expect(state.sectionData.deductions!.mortgageEntries![0]).toMatchObject(change);
    }
    const state = flow();
    state.segmentation.filingStatus = "mfs";
    state.sectionData.deductions!.mortgageEntries![0]!.maximumBalanceDuringYear = "500000";
    const supported = buildTaxInputFromGuidedData(state);
    expect(supported).not.toBeNull();
    expect(calculateHomeMortgageInterest(TaxYearInputSchema.parse(supported)).mortgageInterest.toString()).toBe("75");
  });
  it("forwards actual insurance allocation independently from Box 5 and requires known eligibility", () => {
    const state = flow();
    const entry = state.sectionData.deductions!.mortgageEntries![0]!;
    Object.assign(entry, { mortgageInsurancePremiums: "1200", hasMortgageInsuranceAllocation: true, insuranceContractIssueDate: "2020-01-01", insuranceAllocationTaxYear: "2026", insuranceQualifiedProvider: true, insuranceAcquisitionDebt: true, insuranceQualifiedResidence: true, insurancePremiumsAllocableToYear: "100.10" });
    expect(buildTaxInputFromGuidedData(state)?.form1098?.[0]).toMatchObject({ mortgageInsurancePremiums: "1200", mortgageInsuranceQualification: { allocationTaxYear: 2026, contractIssueDate: "2020-01-01", qualifiedProvider: true, acquisitionDebt: true, qualifiedResidence: true, premiumsAllocableToYear: "100.1" } });
    entry.insurancePremiumsAllocableToYear = "0";
    expect(buildTaxInputFromGuidedData(state)?.form1098?.[0]?.mortgageInsuranceQualification?.premiumsAllocableToYear).toBe("0");
    entry.insurancePremiumsAllocableToYear = "";
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("keeps legacy statement amounts unverified and rejects duplicate loan records", () => {
    expect(() => buildForm1098Inputs({ ...emptyDeductionData, method: "itemized", mortgageEntries: [{ lender: "Bank", mortgageInterest: "100", outstandingPrincipal: "200000", originationDate: "2020-01-01" }] })).toThrow();
    const state = flow();
    state.sectionData.deductions!.mortgageInterest = "200.20";
    state.sectionData.deductions!.mortgageEntries!.push({ ...state.sectionData.deductions!.mortgageEntries![0]! });
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    const legacy = flow();
    legacy.sectionData.deductions!.mortgageEntries = [{ lender: "Saved Lender", mortgageInterest: "100.10", outstandingPrincipal: "0", originationDate: "2018-01-02" }];
    const restored = loadGuidedFlowState({ getItem: () => JSON.stringify(legacy) } as unknown as Storage, "legacy-mortgage");
    expect(restored?.sectionData.deductions?.mortgageEntries?.[0]).toEqual(legacy.sectionData.deductions!.mortgageEntries[0]);
    expect(buildTaxInputFromGuidedData(restored!)).toBeNull();
  });
  it("requires the actual current-year purchase points conditions and preserves allocated taxes", () => {
    const state = flow();
    const entry = state.sectionData.deductions!.mortgageEntries![0]!;
    Object.assign(entry, { originationDate: "2026-02-03", pointsPaid: "100.10", pointsPaidByReturnAmount: "100.10", pointsPaidDate: "2026-02-03", pointsUse: "purchase", pointsMethod: "current_year", pointsOnMainHome: true, pointsEstablishedPractice: true, pointsWithinUsualAmount: true, pointsCashMethod: true, pointsNotServiceFees: true, pointsOwnFundsSufficient: true, pointsPurchaseMainHome: true, pointsPercentageOfPrincipal: true, pointsOnSettlementStatement: true, pointsFullDeductionElected: true, propertyTaxPaid: "0.20", propertyTaxDisbursementConfirmed: true });
    expect(buildTaxInputFromGuidedData(state)?.form1098?.[0]).toMatchObject({ pointsPaid: "100.1", propertyTax: "0.2" });
    expect(computeDeductionComparison("single", state.sectionData.deductions, 2026).itemizedTotal).toBe("200.4");
    entry.pointsOwnFundsSufficient = false;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    entry.pointsOwnFundsSufficient = true;
    entry.propertyUse = "second-home";
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    entry.propertyUse = "main-home";
    entry.originationDate = "2025-02-03";
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
});
