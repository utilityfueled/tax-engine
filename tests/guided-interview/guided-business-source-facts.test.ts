import { completeGuidedBusinessPA } from "../fixtures/guided-business-pa-complete";
import { assertPAGuidedPaymentBoundary } from "../fixtures/assert-pa-guided-payment-boundary";
// Spec: spec/federal/guided-input.yaml, business-source-records and business-return-year
import { describe, expect, it } from "vitest";
import { buildGuidedFactAnswers, buildNecInputs, buildScheduleCInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  emptyNecEntry, emptyScheduleCExpenses, emptyStateReturnData, loadGuidedFlowState,
  saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type SelfEmploymentSectionData,
} from "@/lib/guided-interview-flow";
import { businessFactErrors } from "@/lib/guided-business-facts";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";

const source = { ...emptyNecEntry, payerName: "Actual client", payerTin: "12-3456789", accountHolder: "primary" as const, nonemployeeCompensation: "0", federalWithheld: "0", stateTaxReporting: "single" as const, state: "PA", stateIncome: "0", stateWithheld: "0" };
const expenses = Object.fromEntries(Object.keys(emptyScheduleCExpenses).map(key => [key, "0"])) as typeof emptyScheduleCExpenses;
const businessFacts = { accountHolder: "primary" as const, activityDescription: "Independent design services", businessCode: "541430", accountingMethod: "cash" as const, singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", contractLabor: "0", depreciation: "0", legalAndProfessional: "0", w2WagesPaid: "0", ubiaQualifiedProperty: "0", isSST: false, allInvestmentAtRisk: true, priorYearUnallowedLoss: "0", additionalWorksheetRequired: false };
function flow() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
  state.sectionData["income-self-employment"] = { necEntries: [source], manualGrossReceipts: "0", expenses, businessFacts, qbiMateriallyParticipated: true } as SelfEmploymentSectionData;
  return state;
}

describe("guided business source records", () => {
  it("preserves actual NEC owners state amounts and explicit zero", () => {
    expect(buildNecInputs([source])).toEqual([expect.objectContaining({ payer: "Actual client", accountHolder: "primary", nonemployeeCompensation: "0", federalWithheld: "0", state: "PA", stateIncome: "0", stateWithheld: "0" })]);
    expect(buildNecInputs([{ ...source, payerName: "", federalWithheld: "" }])[0]).toMatchObject({ payer: "", federalWithheld: undefined });
  });
  it("requires actual business facts and source amounts before combining one activity", () => {
    const state = flow();
    expect(buildTaxInputFromGuidedData(state)?.scheduleC).toMatchObject({ accountHolder: "primary", businessCode: "541430", accountingMethod: "cash", grossReceipts: "0", returnsAndAllowances: "0", costOfGoodsSold: "0", isSST: false });
    state.sectionData["income-self-employment"]!.businessFacts = undefined;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(buildScheduleCInput([source], "", expenses)?.grossReceipts).toBeUndefined();
    expect(buildScheduleCInput([], "", emptyScheduleCExpenses)).toBeUndefined();
    state.sectionData["income-self-employment"]!.businessFacts = businessFacts;
    state.sectionData["income-self-employment"]!.necEntries = [{ ...source, federalWithheld: "" }];
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("keeps exact receipts and preserves an expense-only activity without inventing qualification", () => {
    const state = flow();
    state.sectionData["income-self-employment"]!.necEntries = [{ ...source, nonemployeeCompensation: "9007199254740993.01" }];
    state.sectionData["income-self-employment"]!.manualGrossReceipts = "0.02";
    expect(buildTaxInputFromGuidedData(state)?.scheduleC?.grossReceipts).toBe("9007199254740993.03");
    state.sectionData["income-self-employment"]!.necEntries = [];
    state.sectionData["income-self-employment"]!.manualGrossReceipts = "0";
    state.sectionData["income-self-employment"]!.expenses = { ...expenses, supplies: "100" };
    expect(buildTaxInputFromGuidedData(state)?.scheduleC?.expenses?.supplies).toBe("100");
    state.sectionData["income-self-employment"]!.businessFacts = { ...businessFacts, allInvestmentAtRisk: false };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("requires annual Schedule C reconciliation after a tax-year change and saved reopen", () => {
    const business = {
      necEntries: [], manualGrossReceipts: "1000.02", expenses: { ...expenses, supplies: "100.01" },
      businessFacts, qbiMateriallyParticipated: true,
    };
    const confirmed = updateSectionData(setInterviewTaxYear(flow(), 2026), "income-self-employment", business);
    expect(setInterviewTaxYear(confirmed, 2026)).toBe(confirmed);
    expect(validateSection(confirmed, "income-self-employment").status).toBe("complete");

    const switched = setInterviewTaxYear(confirmed, 2025);
    expect(buildTaxInputFromGuidedData(switched)).toBeNull();
    expect(validateSection(switched, "income-self-employment")).toMatchObject({
      status: "partial",
      fieldErrors: { incomeReconciled: expect.any(String), expensesReconciled: expect.any(String) },
    });

    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    } as Storage;
    expect(saveGuidedFlowState(storage, "fictional-schedule-c", switched)).toBe(true);
    const reopened = loadGuidedFlowState(storage, "fictional-schedule-c");
    if (!reopened) throw new Error("Expected the saved Schedule C review.");
    const pending = { ...business, businessFacts: { ...businessFacts, incomeReconciled: null, expensesReconciled: null } };
    expect(reopened.sectionData["income-self-employment"]).toMatchObject(pending);
    expect(computeGuidedPreview(reopened)).toBeNull();
    const incomeReviewed = updateSectionData(reopened, "income-self-employment", {
      ...pending, businessFacts: { ...pending.businessFacts, incomeReconciled: true },
    });
    expect(buildTaxInputFromGuidedData(incomeReviewed)).toBeNull();
    const reviewed = updateSectionData(incomeReviewed, "income-self-employment", business);
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reviewed));
    expect(input.taxpayer.taxYear).toBe(2025);
    expect(input.scheduleC).toMatchObject({ grossReceipts: "1000.02", expenses: { supplies: "100.01" } });
    expect(computeGuidedPreview(reviewed)).not.toBeNull();
    expect(calculateFederalTax(input).scheduleC?.netProfit.toFixed()).toBe("900.01");
  });
  it("retains original NEC years and false or unknown business answers across a tax-year change", () => {
    const state = flow();
    const business = {
      ...state.sectionData["income-self-employment"]!,
      necEntries: [{ ...source, sourceTaxYear: "2025", nonemployeeCompensation: "12.34" }],
      businessFacts: { ...businessFacts, incomeReconciled: true, expensesReconciled: false },
    };
    const pending = setInterviewTaxYear(updateSectionData(state, "income-self-employment", business), 2026);
    expect(pending.sectionData["income-self-employment"]).toMatchObject({
      ...business, businessFacts: { ...business.businessFacts, incomeReconciled: null },
    });
    const incomeUnknown = updateSectionData(state, "income-self-employment", {
      ...business, businessFacts: { ...businessFacts, incomeReconciled: undefined },
    });
    expect(setInterviewTaxYear(incomeUnknown, 2026).sectionData["income-self-employment"]?.businessFacts)
      .toMatchObject({ incomeReconciled: undefined, expensesReconciled: null });
    const reviewed = updateSectionData(pending, "income-self-employment", { ...business, businessFacts });
    expect(validateSection(reviewed, "income-self-employment").fieldErrors).toHaveProperty("nec-0-sourceTaxYear");
    expect(buildTaxInputFromGuidedData(reviewed)).toBeNull();

    const incomplete = updateSectionData(reviewed, "income-self-employment", {
      ...business, businessFacts, necEntries: [{ ...business.necEntries[0], sourceTaxYear: "2026" }],
      expenses: { ...business.expenses, supplies: "" },
    });
    expect(validateSection(incomplete, "income-self-employment").fieldErrors).toHaveProperty("expense-supplies");
    expect(buildTaxInputFromGuidedData(incomplete)).toBeNull();
  });
  it("blocks multiple businesses and unconfirmed expenses", () => {
    const state = flow();
    for (const patch of [{ singleBusinessConfirmed: false }, { expensesReconciled: undefined }, { additionalWorksheetRequired: true }, { accountHolder: "joint" }, { priorYearUnallowedLoss: "1" }]) {
      state.sectionData["income-self-employment"]!.businessFacts = { ...businessFacts, ...patch } as typeof businessFacts;
      expect(buildTaxInputFromGuidedData(state), JSON.stringify(patch)).toBeNull();
    }
  });
  it("uses actual spouse payroll without reducing the other business owner's wage base", () => {
    const state = flow();
    state.sectionData["income-self-employment"]!.manualGrossReceipts = "100000";
    state.segmentation.filingStatus = "mfj";
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, accountHolder: "spouse", wages: "176100", socialSecurityWages: "176100", socialSecurityTips: "0", socialSecurityWithheld: "10918.20", medicareWages: "176100", medicareWithheld: "2553.45" }] };
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    const result = calculateFederalTax(TaxYearInputSchema.parse(input)).scheduleSE;
    // The primary taxpayer has 92,350 net SE earnings: 11,451 SS + 2,678 Medicare.
    expect(result?.totalSETax.toFixed()).toBe("14129");
    expect(result?.perTaxpayer[0].accountHolder).toBe("primary");
    state.sectionData["income-w2"].entries[0].accountHolder = "primary";
    expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).scheduleSE?.totalSETax.toFixed()).toBe("2678");
  });
  it("rejects missing and invalid expense facts without replacing them with zero", () => {
    const state = flow();
    for (const value of ["", "-0.01", "invalid"]) {
      state.sectionData["income-self-employment"]!.expenses = { ...expenses, supplies: value };
      expect(buildTaxInputFromGuidedData(state), value).toBeNull();
    }
    state.sectionData["income-self-employment"]!.expenses = { ...expenses, supplies: "0" };
    expect(buildTaxInputFromGuidedData(state)?.scheduleC?.expenses?.supplies).toBe("0");
    state.sectionData["income-self-employment"]!.manualGrossReceipts = "invalid";
    expect(buildGuidedFactAnswers(state)).toContainEqual({ factId: "nonemployee-compensation", answerText: "Business income source amounts still need review." });
  });
  it("routes actual other income separately and preserves the business loss qualifications", () => {
    const state = flow();
    state.sectionData["income-self-employment"]!.manualGrossReceipts = "100.35";
    state.sectionData["income-self-employment"]!.businessFacts = { ...businessFacts, returnsAndAllowances: "20.10", costOfGoodsSold: "10.20", otherIncome: "50.05", allInvestmentAtRisk: false };
    state.sectionData["income-self-employment"]!.expenses = { ...expenses, supplies: "5.10" };
    const input = buildTaxInputFromGuidedData(state);
    expect(input?.scheduleC).toMatchObject({ principalBusinessActivity: "Independent design services", allInvestmentAtRisk: false, otherIncome: "50.05" });
    // 100.35 - 20.10 - 10.20 + 50.05 - 5.10 = 115.00 before tax.
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).scheduleC?.netProfit.toFixed()).toBe("115");
    state.sectionData["income-self-employment"]!.expenses.supplies = "121";
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("counts only actual matching state withholding and rejects duplicate source entries", () => {
    const state = flow();
    state.sectionData.deductions!.nonW2IncomeTaxesDeductedElsewhere = "0";
    state.segmentation.stateCode = "PA";
    state.sectionData["income-self-employment"]!.necEntries = [{ ...source, stateWithheld: "0.10" }, { ...source, payerName: "Other client", state: "NY", stateWithheld: "0.20" }];
    completeGuidedBusinessPA(state, "pending_ny");
    assertPAGuidedPaymentBoundary(state, "0.1", "0");
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("0");
    state.sectionData["income-self-employment"]!.necEntries[1].state = "PA";
    completeGuidedBusinessPA(state, "all_pa");
    assertPAGuidedPaymentBoundary(state, "0.3", "0");
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("0");
    state.sectionData["state-return"] = { ...emptyStateReturnData, additionalStateWithholdingEntries: [{ payer: "Actual client", documentType: "1099-NEC", state: "PA", taxYear: "2025", amount: "0.10" }] };
    expect(businessFactErrors(state.sectionData["income-self-employment"], "single", [], state.sectionData["state-return"])).toHaveProperty("nec-0-duplicate-withholding");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
});
