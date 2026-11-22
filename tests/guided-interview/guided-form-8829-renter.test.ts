import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { calculateScheduleC } from "@/engine/schedules/schedule-c";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyScheduleCExpenses, setInterviewTaxYear, updateSectionData, validateSection, type SelfEmploymentSectionData } from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs";
import { startCompleteInterview } from "./complete-facts";

const rentalRecords = {
  sourceTaxYear: "2026",
  floorAreaReference: "Lease floor plan and measured workroom",
  businessSquareFeet: "100",
  totalSquareFeet: "1000",
  expenseReference: "Annual lease receipts and utility statements",
  rent: "10,000.00",
  utilities: "2,000.00",
  eligibilityBasis: "principal-place" as const,
  confirmed: true,
};

function interview(records = rentalRecords, manualGrossReceipts = "30000") {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const business: SelfEmploymentSectionData = {
    necEntries: [], manualGrossReceipts,
    expenses: Object.fromEntries(Object.keys(emptyScheduleCExpenses).map(key => [key, "0"])) as typeof emptyScheduleCExpenses,
    qbiMateriallyParticipated: true,
    businessFacts: {
      accountHolder: "primary", activityDescription: "Independent design services", businessCode: "541430",
      accountingMethod: "cash", singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true,
      returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", contractLabor: "0", depreciation: "0",
      legalAndProfessional: "0", w2WagesPaid: "0", ubiaQualifiedProperty: "0", isSST: false, allInvestmentAtRisk: true,
      priorYearUnallowedLoss: "0", additionalWorksheetRequired: false, homeOfficeRenter: { ...records },
    },
  };
  state.sectionData["income-self-employment"] = business;
  return { state, business };
}

it("projects documented renter expenses through the real Schedule C calculation", () => {
  const { state, business } = interview();
  expect(validateSection(state, "income-self-employment").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.scheduleC?.homeOffice).toMatchObject({
    method: "actual", form8829: {
      areaUsedForBusiness: 100, totalAreaOfHome: 1000, indirectExpenses: { rent: "10000", utilities: "2000" },
    },
  });
  expect(input.scheduleC?.homeOffice?.form8829?.grossIncomeLimit).toBeUndefined();
  expect(input.scheduleC?.homeOffice?.actualAmount).toBeUndefined();
  const result = calculateScheduleC(input, input.scheduleC);
  expect([result.homeOfficeDeduction.toFixed(), result.netProfit.toFixed()]).toEqual(["1200", "28800"]);

  const limited = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(interview({ ...rentalRecords, utilities: "0" }, "500").state));
  expect(limited.scheduleC?.homeOffice?.form8829?.indirectExpenses?.utilities).toBe("0");
  expect(calculateScheduleC(limited, limited.scheduleC).homeOfficeDeduction.toFixed()).toBe("500");

  const changed = updateSectionData(state, "income-self-employment", { ...business, manualGrossReceipts: "28000" });
  expect(changed.sectionData["income-self-employment"]?.businessFacts?.homeOfficeRenter?.confirmed).toBe(false);
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});

it("holds incomplete unsupported and unreconciled home office originals", () => {
  const cases = [
    { sourceTaxYear: "2025" }, { floorAreaReference: "" }, { expenseReference: " " }, { confirmed: false },
    { businessSquareFeet: "1200" }, { businessSquareFeet: "10.1" }, { totalSquareFeet: "0" },
    { rent: "" }, { rent: "10,00.00" }, { utilities: "-2" }, { eligibilityBasis: "client-meetings" },
  ];
  for (const patch of cases) {
    const { state } = interview({ ...rentalRecords, ...patch });
    expect(validateSection(state, "income-self-employment").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  const { state, business } = interview();
  expect(buildTaxInputFromGuidedData({ ...state, taxYear: 2025 })).toBeNull();
  expect(buildTaxInputFromGuidedData({ ...state, segmentation: { ...state.segmentation, stateCode: "PA" } })).toBeNull();
  assert.ok(business.businessFacts);
  business.businessFacts.additionalWorksheetRequired = true;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("requires fresh office confirmation after a return-year edit", () => {
  const { state } = interview();
  const changed = setInterviewTaxYear(setInterviewTaxYear(state, 2025), 2026);
  expect(changed.sectionData["income-self-employment"]?.businessFacts?.homeOfficeRenter).toEqual({ ...rentalRecords, confirmed: false });
});
