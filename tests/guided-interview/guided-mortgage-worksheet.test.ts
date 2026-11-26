// Spec: spec/federal/guided-mortgage-worksheet.yaml
import { describe, expect, it } from "vitest";
import { calculateHomeMortgageInterest } from "@/engine/forms/home-mortgage-interest";
import { calculateFederalTax } from "@/engine/federal";
import { Form1098Schema, TaxYearInputSchema } from "@/models/inputs";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildGuidedMortgageInputs, distinctMortgageLoansConfirmation } from "@/lib/guided-mortgage-worksheet";
import { emptyDeductionData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { completeMortgageSource, completeW2Entry, startCompleteInterview } from "./complete-facts";

function facts() {
  return { ...emptyDeductionData, method: "itemized" as const, mortgageInterest: "40000.10",
    mortgageWorksheet: { sourceTaxYear: "2025", sourceReference: "Actual annual debt records", allHomeDebtIncluded: true, priorYearInterestRecoveriesPresent: false, sourceFactsConfirmed: true },
    mortgageEntries: [{ ...completeMortgageSource, sourceTaxYear: "2025", mortgageInterest: "40000.10", outstandingPrincipal: "900000", maximumBalanceDuringYear: "1000000", balanceMethod: "highest_balance" as const, balanceSourceReference: "Actual annual balance history",
      interestPaidByReturnAmount: "30000.10", interestPaidByOthers: "10000", interestDeductedElsewhere: "0", sameYearInterestRefund: "0", nonqualifiedInterest: "0", pointsPaidByReturnAmount: "0", pointsPaidByOthers: "0", pointsNotInterest: "0" }] };
}

function reopen(state: GuidedFlowState): GuidedFlowState {
  const values = new Map<string, string>();
  const storage = { get length() { return values.size; }, clear: () => values.clear(), key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } } satisfies Storage;
  const target = { storageKey: "mortgage-transfer" };
  expect(saveGuidedFlowState(storage, target, state)).toBe(true);
  const reopened = loadGuidedFlowState(storage, target);
  if (!reopened) throw new Error("Expected a reopened mortgage worksheet.");
  return reopened;
}

describe("actual guided mortgage worksheet", () => {
  it("holds two statements for the same transferred mortgage after reopening", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["bought-home"], stateCode: null });
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "100000", federalWithheld: "10000", socialSecurityWages: "100000", socialSecurityWithheld: "6200", medicareWages: "100000", medicareWithheld: "1450" }] };
    const original = { ...completeMortgageSource, lender: "First lender", accountReference: "4800", originationDate: "2020-02-20", mortgageAcquisitionDate: null,
      mortgageInterest: "12000", interestPaidByReturnAmount: "12000", outstandingPrincipal: "480000", maximumBalanceDuringYear: "480000" };
    const transferred = { ...original, lender: "Successor lender", accountReference: "4760", outstandingPrincipal: "476000", mortgageAcquisitionDate: "2025-07-01" };
    const deductions = { ...facts(), mortgageInterest: "24000", mortgageEntries: [original, transferred] };
    state.sectionData.deductions = deductions;
    const reopened = reopen(state);
    expect(reopened.sectionData.deductions?.mortgageEntries).toMatchObject([original, transferred]);
    expect(() => buildGuidedMortgageInputs(reopened.sectionData.deductions, 2025, "single")).toThrow(/transfer.*balance.*interest/i);
    expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
    const currentYear = { ...deductions, mortgageWorksheet: { ...deductions.mortgageWorksheet, sourceTaxYear: "2026" }, mortgageEntries: [
      { ...original, sourceTaxYear: "2026" }, { ...transferred, sourceTaxYear: "2026", mortgageAcquisitionDate: "2026-07-01" },
    ] };
    expect(() => buildGuidedMortgageInputs(currentYear, 2026, "single")).toThrow(/transfer.*balance.*interest/i);
    const currentReopened = reopen({ ...state, taxYear: 2026, sectionData: { ...state.sectionData, deductions: currentYear } });
    expect(validateSection(currentReopened, "deductions")).toMatchObject({ status: "partial", fieldErrors: { mortgageWorksheet: expect.stringMatching(/transfer/i) } });
    expect(buildTaxInputFromGuidedData(currentReopened)).toBeNull();
  });

  it("holds a supplied Box 11 at the canonical worksheet boundary", () => {
    const source = buildGuidedMortgageInputs(facts(), 2025, "single");
    const original = source.form1098[0];
    if (!original) throw new Error("Expected an original Form 1098.");
    const acquired = { ...original, mortgageAcquisitionDate: "2025-07-01" };
    expect(() => calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: "single" }, ...source, form1098: [acquired], form1099Misc: [] })).toThrow(/transfer.*balance.*interest/i);
    expect(Form1098Schema.parse(acquired)).toHaveProperty("mortgageAcquisitionDate", "2025-07-01");
  });

  it("preserves actual distinct mortgage statements and their explicit blank Box 11", () => {
    const original = { ...completeMortgageSource, mortgageAcquisitionDate: null };
    const second = { ...original, lender: "Actual second lender", accountReference: "second loan", outstandingPrincipal: "0" };
    const entries = [original, second];
    const root = { ...facts().mortgageWorksheet, distinctMortgageLoansSourceReference: "Two separate signed loan notes and annual ledgers" };
    const data = { ...facts(), mortgageInterest: "200", mortgageEntries: entries, mortgageWorksheet: {
      ...root, distinctMortgageLoansConfirmation: distinctMortgageLoansConfirmation(root, entries),
    } };
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["bought-home"], stateCode: null });
    state.sectionData.deductions = data;
    const reopened = reopen(state);
    const source = buildGuidedMortgageInputs(reopened.sectionData.deductions, 2025, "single");
    expect(source.form1098.map(form => [form.lender, form.mortgageOriginationDate, form.outstandingMortgagePrincipal, form.mortgageAcquisitionDate]))
      .toEqual([[original.lender, original.originationDate, "250000", null], [second.lender, second.originationDate, "0", null]]);
    const expected = calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: "single" }, ...source, form1099Misc: [] });
    expect(expected.mortgageInterest.toFixed()).toBe("200");
    const confirmedSingle = buildGuidedMortgageInputs({ ...data, mortgageInterest: "100", mortgageEntries: [original] }, 2025, "single");
    expect(confirmedSingle.form1098[0]).toHaveProperty("mortgageAcquisitionDate", null);
    const legacySingle = buildGuidedMortgageInputs(facts(), 2025, "single");
    expect(legacySingle.form1098[0]).not.toHaveProperty("mortgageAcquisitionDate");
    for (const edited of [[original, { ...second, accountReference: "edited" }], [original, { ...second, mortgageAcquisitionDate: undefined }],
      [...entries, { ...second, accountReference: "third loan" }], [{ ...second, accountReference: "replacement loan" }, original]]) {
      expect(() => buildGuidedMortgageInputs({ ...data, mortgageEntries: edited }, 2025, "single")).toThrow(/confirm.*separate loans/i);
    }
    const editedInterestAndBalance = { ...second, mortgageInterest: "1000", interestPaidByReturnAmount: "1000", maximumBalanceDuringYear: "600000" };
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageInterest: "1100", mortgageEntries: [original, editedInterestAndBalance] }, 2025, "single")).toThrow(/confirm.*separate loans/i);
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, sourceReference: "Different annual balance history" } }, 2025, "single")).toThrow(/confirm.*separate loans/i);
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...root, distinctMortgageLoansConfirmation: null } }, 2025, "single")).toThrow(/confirm.*separate loans/i);
    const owner = reopened.sectionData["personal-info"];
    if (!owner) throw new Error("Expected the reopened taxpayer information.");
    const ownerChanged = updateSectionData(reopened, "personal-info", { ...owner, ssn: "333-44-5555" });
    expect(ownerChanged.sectionData.deductions?.mortgageWorksheet?.distinctMortgageLoansConfirmation).toBeUndefined();
  });

  it("preserves actual mortgage sources and rejects unknown or conflicting payment shares", () => {
    const data = facts(); const source = buildGuidedMortgageInputs(data, 2025, "single");
    expect(source.form1098[0]).toMatchObject({ taxYear: 2025, mortgageInterestReceived: "40000.1", outstandingMortgagePrincipal: "900000", sourceFactsComplete: true });
    expect(source.mortgageInterestWorksheet?.loans[0]).toMatchObject({ interestPaid: "30000.1", interestPaidByOthers: "10000", sameYearInterestRefund: "0" });
    for (const change of [{ interestPaidByOthers: "" }, { interestPaidByReturnAmount: "30000" }, { interestDeductedElsewhere: "-1" }, { pointsPaidByOthers: "1" }, { balanceMethod: "" }]) {
      expect(() => buildGuidedMortgageInputs({ ...data, mortgageEntries: [{ ...data.mortgageEntries[0]!, ...change }] }, 2025, "single")).toThrow();
    }
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: undefined }, 2025, "single")).toThrow(/worksheet|complete|source/i);
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageInterest: "40000" }, 2025, "single")).toThrow(/reconcile|total/i);
    const huge = { ...data, mortgageInterest: "9007199254740993.01", mortgageEntries: [{ ...data.mortgageEntries[0]!, mortgageInterest: "9007199254740993.01", interestPaidByReturnAmount: "9007199254740993.01", interestPaidByOthers: "0" }] };
    expect(buildGuidedMortgageInputs(huge, 2025, "single").mortgageInterestWorksheet?.loans[0]?.interestPaid).toBe("9007199254740993.01");
  });
  it("applies the canonical debt limit to actual highest balances and lender averages", () => {
    const data = facts(); const source = buildGuidedMortgageInputs(data, 2025, "single");
    const result = calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: "single" }, ...source, form1099Misc: [] });
    expect(result.deductionRatio.toString()).toBe("0.75"); expect(result.mortgageInterest.toString()).toBe("22500");
    const average = buildGuidedMortgageInputs({ ...data, mortgageEntries: [{ ...data.mortgageEntries[0]!, balanceMethod: "lender_average", lenderAverageBalance: "600000" }] }, 2025, "single");
    expect(calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: "single" }, ...average, form1099Misc: [] }).mortgageInterest.toString()).toBe("30000");
    for (const change of [{ sourceTaxYear: "2026" }, { allHomeDebtIncluded: null }, { priorYearInterestRecoveriesPresent: null }, { priorYearInterestRecoveriesPresent: true }, { sourceFactsConfirmed: false }]) {
      expect(() => buildGuidedMortgageInputs({ ...data, mortgageWorksheet: { ...data.mortgageWorksheet, ...change } }, 2025, "single")).toThrow();
    }
  });
  it("requires actual points timing and binding contract facts without guessing", () => {
    const data = facts(); const entry = { ...data.mortgageEntries[0]!, originationDate: "2025-03-01", pointsPaid: "2000", pointsPaidByReturnAmount: "2000", pointsPaidDate: "2025-03-02", pointsUse: "purchase" as const, pointsMethod: "current_year" as const,
      pointsOnMainHome: true, pointsEstablishedPractice: true, pointsWithinUsualAmount: true, pointsCashMethod: true, pointsNotServiceFees: true, pointsOwnFundsSufficient: true, pointsPurchaseMainHome: true, pointsPercentageOfPrincipal: true, pointsOnSettlementStatement: true, pointsFullDeductionElected: true };
    expect(buildGuidedMortgageInputs({ ...data, mortgageEntries: [entry] }, 2025, "single").mortgageInterestWorksheet?.loans[0]?.points).toMatchObject({ method: "current_year", paidDate: "2025-03-02", buyBuildOrImproveMainHome: "purchase" });
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageEntries: [{ ...entry, pointsPaidDate: "" }] }, 2025, "single")).toThrow(/date|payment/i);
    const transition = { ...data.mortgageEntries[0]!, originationDate: "2017-12-16" };
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageEntries: [transition] }, 2025, "single")).toThrow(/contract/i);
    const source = buildGuidedMortgageInputs({ ...data, mortgageEntries: [{ ...transition, bindingContractApplies: true, bindingContractSignedDate: "2017-12-14", bindingContractRequiredClosingDate: "2017-12-31", bindingContractPurchaseDate: "2018-03-31" }] }, 2025, "single");
    expect(calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: "single" }, ...source, form1099Misc: [] }).deductionRatio.toString()).toBe("1");
  });
  it("uses the actual source worksheet in the full return and retains seller-paid buyer points", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["bought-home"], stateCode: null });
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "100000", federalWithheld: "10000", socialSecurityWages: "100000", socialSecurityWithheld: "6200", medicareWages: "100000", medicareWithheld: "1450" }] };
    state.sectionData.deductions = facts();
    const input = buildTaxInputFromGuidedData(state); expect(input?.mortgageInterestWorksheet?.sourceFactsConfirmed).toBe(true);
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(result.itemizedDeductions.toString()).toBe("22500"); expect(result.taxableIncome.toString()).toBe("77500");
    const sellerPoints = { ...facts(), mortgageEntries: [{ ...facts().mortgageEntries[0]!, originationDate: "2025-03-01", pointsPaid: "2000", pointsPaidByReturnAmount: "2000", pointsPaidByOthers: "0", pointsPaidDate: "2025-03-01", pointsUse: "purchase" as const, pointsMethod: "current_year" as const,
      pointsOnMainHome: true, pointsEstablishedPractice: true, pointsWithinUsualAmount: true, pointsCashMethod: true, pointsNotServiceFees: true, pointsOwnFundsSufficient: true, pointsPurchaseMainHome: true, pointsPercentageOfPrincipal: true, pointsOnSettlementStatement: true, pointsFullDeductionElected: true }] };
    const source = buildGuidedMortgageInputs(sellerPoints, 2025, "single");
    expect(calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: "single" }, ...source, form1099Misc: [] }).deductiblePoints.toString()).toBe("1500");
    const changed = updateSectionData(state, "personal-info", { ...state.sectionData["personal-info"]!, ssn: "333-44-5555" });
    expect(changed.sectionData.deductions?.mortgageWorksheet?.sourceFactsConfirmed).toBeNull();
  });
  it("retains known prior-year recovery requirements after changing the deduction election", () => {
    const data = { ...facts(), method: "standard" as const, mortgageEntries: [{ ...facts().mortgageEntries[0]!, refundOfOverpaidInterest: "100" }] };
    expect(() => buildGuidedMortgageInputs(data, 2025, "single")).toThrow(/recovery|refund/i);
    expect(() => buildGuidedMortgageInputs({ ...facts(), method: "standard", mortgageWorksheet: { ...facts().mortgageWorksheet, priorYearInterestRecoveriesPresent: true } }, 2025, "single")).toThrow(/recovery|refund/i);
    expect(() => buildGuidedMortgageInputs({ ...data, mortgageEntries: [{ ...data.mortgageEntries[0]!, refundOfOverpaidInterest: "" }] }, 2025, "single")).toThrow(/unknown|refund/i);
  });
});
