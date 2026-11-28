// Spec: spec/federal/guided-input.yaml, mortgage-source-qualification
import { describe, expect, it, vi } from "vitest";
import { calculateHomeMortgageInterest } from "@/engine/forms/home-mortgage-interest";
import { calculateScheduleA } from "@/engine/schedules/schedule-a";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import { TaxYearInputSchema } from "@/models/inputs";
import { d } from "@/utils/decimal";
import { buildForm1098Inputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { computeDeductionComparison, emptyDeductionData, loadGuidedFlowState, validateSection } from "@/lib/guided-interview-flow";
import { completeMortgageSource, completeMortgageWorksheet, startCompleteInterview } from "./complete-facts";

function flow(taxYear = 2026, originationDate = completeMortgageSource.originationDate) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  state.taxYear = taxYear;
  const sourceTaxYear = String(taxYear);
  state.sectionData.deductions = { ...emptyDeductionData, method: "itemized", mortgageInterest: "100.10", mortgageWorksheet: { ...completeMortgageWorksheet, sourceTaxYear }, mortgageEntries: [{ ...completeMortgageSource, sourceTaxYear, originationDate, mortgageInterest: "100.10", interestPaidByReturnAmount: "100.10" }] };
  return state;
}

function reopen(state: ReturnType<typeof flow>) {
  const raw = JSON.stringify(state);
  const restored = loadGuidedFlowState({ getItem: () => raw } as Storage, "fictional-mortgage");
  if (!restored) throw new Error("Expected the saved mortgage worksheet to reopen");
  return restored;
}

function expectDateHold(state: ReturnType<typeof flow>, message: RegExp) {
  const validation = validateSection(state, "deductions");
  expect.soft(validation.status).toBe("partial");
  expect.soft(validation.fieldErrors?.mortgageWorksheet).toMatch(message);
  expect.soft(Boolean(buildTaxInputFromGuidedData(state))).toBe(false);
}

describe("actual mortgage source qualification", () => {
  it("holds a future 2026 Box 3 origination after reopening", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 10, 27, 12));
      const future = reopen(flow(2026, "2026-12-15"));
      expect(future.sectionData.deductions?.mortgageEntries?.[0]).toMatchObject({
        originationDate: "2026-12-15", sourceFactsConfirmed: true,
        lender: completeMortgageSource.lender, outstandingPrincipal: "250000",
      });
      expectDateHold(future, /origination.*on or before today/i);

      for (const [year, date] of [[2026, "2026-11-27"], [2025, "2025-12-15"]] as const) {
        const actual = reopen(flow(year, date));
        expect(validateSection(actual, "deductions").status).toBe("complete");
        const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(actual));
        expect(input.form1098?.[0]).toMatchObject({
          taxYear: year, mortgageOriginationDate: date, lender: completeMortgageSource.lender,
          outstandingMortgagePrincipal: "250000", mortgageInterestReceived: "100.1",
        });
        expect(calculateHomeMortgageInterest(input).mortgageInterest.toFixed()).toBe("100");
      }
      vi.setSystemTime(new Date(2026, 11, 15, 12));
      expect(validateSection(future, "deductions").status).toBe("complete");
      expect(buildTaxInputFromGuidedData(future)?.form1098?.[0]?.mortgageOriginationDate).toBe("2026-12-15");
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds future 2026 current-year points until payment", () => {
    const state = flow(2026, "2026-02-03");
    const entry = state.sectionData.deductions?.mortgageEntries?.[0];
    if (!entry) throw new Error("Expected the original mortgage fixture");
    Object.assign(entry, {
      pointsPaid: "100.10", pointsPaidByReturnAmount: "100.10", pointsPaidDate: "2026-12-15",
      pointsUse: "purchase", pointsMethod: "current_year",
      pointsOnMainHome: true, pointsEstablishedPractice: true, pointsWithinUsualAmount: true,
      pointsCashMethod: true, pointsNotServiceFees: true, pointsOwnFundsSufficient: true,
      pointsPurchaseMainHome: true, pointsPercentageOfPrincipal: true, pointsOnSettlementStatement: true,
      pointsFullDeductionElected: true,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 10, 27, 12));
      const restored = reopen(state);
      expect(restored.sectionData.deductions?.mortgageEntries?.[0]).toMatchObject({
        originationDate: "2026-02-03", pointsPaidDate: "2026-12-15", pointsPaid: "100.10",
      });
      expectDateHold(restored, /points.*on or before today/i);

      vi.setSystemTime(new Date(2026, 11, 15, 12));
      expect(validateSection(restored, "deductions").status).toBe("complete");
      const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(restored));
      expect(input.form1098[0]?.pointsPaid).toBe("100.1");
      expect(input.mortgageInterestWorksheet?.loans[0]?.points).toMatchObject({ paidDate: "2026-12-15" });
      expect(calculateHomeMortgageInterest(input).line8a.toFixed()).toBe("200");
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds 2026 insurance on a future contract issue date", () => {
    const state = flow();
    const entry = state.sectionData.deductions?.mortgageEntries?.[0];
    if (!entry) throw new Error("Expected the original mortgage fixture");
    Object.assign(entry, {
      mortgageInsurancePremiums: "1200", hasMortgageInsuranceAllocation: true,
      insuranceAllocationMethod: "manual-annual", insuranceContractIssueDate: "2026-12-15",
      insuranceAllocationTaxYear: "2026", insuranceQualifiedProvider: true, insuranceAcquisitionDebt: true,
      insuranceQualifiedResidence: true, insurancePremiumsAllocableToYear: "100.10",
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 10, 27, 12));
      const restored = reopen(state);
      expect(restored.sectionData.deductions?.mortgageEntries?.[0]).toMatchObject({
        insuranceContractIssueDate: "2026-12-15", mortgageInsurancePremiums: "1200", insurancePremiumsAllocableToYear: "100.10",
      });
      expectDateHold(restored, /insurance contract.*on or before today/i);

      vi.setSystemTime(new Date(2026, 11, 15, 12));
      expect(validateSection(restored, "deductions").status).toBe("complete");
      const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(restored));
      expect(input.form1098[0]?.mortgageInsuranceQualification).toMatchObject({
        contractIssueDate: "2026-12-15", premiumsAllocableToYear: "100.1",
      });
      expect(calculateScheduleA(input, d("70000"), "single", FEDERAL_2026_CONSTANTS).mortgageInsurancePremiums.toFixed()).toBe("100");
    } finally {
      vi.useRealTimers();
    }
  });

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
