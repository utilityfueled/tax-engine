import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SectionSelfEmployment } from "@/components/guided-interview/section-self-employment";
import { calculateFederalTax } from "@/engine/federal";
import { calculateScheduleC } from "@/engine/schedules/schedule-c";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyDeductionData, emptyScheduleCExpenses, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type SelfEmploymentSectionData } from "@/lib/guided-interview-flow";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
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

const ownedRecords = {
  sourceTaxYear: "2026", propertyReference: "Property parcel 42",
  purchaseReference: "Deed and closing disclosure", purchaseDate: "2015-05-12",
  firstBusinessUseReference: "First actual home-office ledger", firstBusinessUseDate: "2018-02-20",
  floorAreaReference: "Floor plan and measurements", businessSquareFeet: "100", totalSquareFeet: "1,000",
  adjustedBasisReference: "Basis workpaper", adjustedBasisDate: "2018-02-20", adjustedBasisTotal: "240,000", adjustedBasisLand: "40,000",
  fairMarketValueReference: "First-use appraisal", fairMarketValueDate: "2018-02-20", fairMarketValueTotal: "275,000", fairMarketValueLand: "50,000",
  mortgageInterestReference: "2026 lender interest statement", mortgageInterest: "6,000.00",
  realEstateTaxesReference: "2026 paid county taxes", realEstateTaxes: "3,000.00",
  confirmed: true,
};

function ownedInterview(records = ownedRecords, receipts = "30000") {
  const { state, business } = interview(rentalRecords, receipts);
  assert.ok(business.businessFacts);
  delete business.businessFacts.homeOfficeRenter;
  business.businessFacts.homeOfficeOwned = { ...records };
  state.sectionData.deductions = { ...emptyDeductionData, method: "standard" };
  return { state, business };
}

it("projects documented owned-home expenses through the live Schedule C calculation", () => {
  const { state } = ownedInterview();
  expect(validateSection(state, "income-self-employment").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.deductionElection).toBe("standard");
  expect(input.scheduleC?.homeOffice).toMatchObject({ method: "actual", form8829: {
    areaUsedForBusiness: 100, totalAreaOfHome: 1000,
    indirectExpenses: { excessMortgageInterest: "6000", excessRealEstateTaxes: "3000" },
    adjustedBasisOrFairMarketValue: "240000", landValue: "40000", depreciationPercentage: "0.02564",
  } });
  expect(input.scheduleC?.homeOffice?.form8829?.grossIncomeLimit).toBeUndefined();
  expect(input.scheduleC?.homeOffice?.actualAmount).toBeUndefined();
  const result = calculateScheduleC(input, input.scheduleC);
  expect([result.homeOfficeDeduction.toFixed(), result.netProfit.toFixed()]).toEqual(["1413", "28587"]);
  const form8829Line = (line: string) => result.lines.find(entry => entry.form === "Form 8829" && entry.line === line)?.value.toFixed();
  expect([form8829Line("8"), form8829Line("24"), form8829Line("42"), form8829Line("36")]).toEqual(["30000", "900", "513", "1413"]);
  expect(() => calculateFederalTax(input)).toThrow(/2026 rule pack.*is incomplete/);

  const limited = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(ownedInterview({ ...ownedRecords, mortgageInterest: "0" }, "500").state));
  expect(limited.scheduleC?.homeOffice?.form8829?.indirectExpenses?.excessMortgageInterest).toBe("0");
  expect(calculateScheduleC(limited, limited.scheduleC).homeOfficeDeduction.toFixed()).toBe("500");
});

it("holds unsupported, mixed, or edited owned-home evidence until reconfirmed", () => {
  for (const patch of [
    { sourceTaxYear: "2025" }, { propertyReference: "" }, { confirmed: false }, { businessSquareFeet: "1001" },
    { purchaseDate: "2019-05-12" }, { fairMarketValueDate: "2018-03-20" }, { adjustedBasisLand: "70000" },
    { mortgageInterest: "" }, { realEstateTaxesReference: "" },
  ]) {
    const { state } = ownedInterview({ ...ownedRecords, ...patch });
    expect(validateSection(state, "income-self-employment").status, JSON.stringify(patch)).toBe("partial");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  const { state, business } = ownedInterview();
  expect(buildTaxInputFromGuidedData({ ...state, taxYear: 2025 })).toBeNull();
  expect(buildTaxInputFromGuidedData({ ...state, segmentation: { ...state.segmentation, stateCode: "PA" } })).toBeNull();
  const changedYear = setInterviewTaxYear(setInterviewTaxYear(state, 2025), 2026);
  expect(changedYear.sectionData["income-self-employment"]?.businessFacts?.homeOfficeOwned?.confirmed).toBe(false);
  const changedIncome = updateSectionData(state, "income-self-employment", { ...business, manualGrossReceipts: "28000" });
  const changedMethod = updateSectionData(state, "deductions", { ...emptyDeductionData, method: "itemized" });
  const changedProperty = updateSectionData(state, "income-self-employment", { ...business,
    businessFacts: { ...business.businessFacts, homeOfficeOwned: { ...ownedRecords, propertyReference: "Different parcel" } },
  });
  for (const changed of [changedIncome, changedMethod, changedProperty]) {
    expect(changed.sectionData["income-self-employment"]?.businessFacts?.homeOfficeOwned?.confirmed).toBe(false);
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  }
  const reopenedMethod = changedMethod.sectionData["income-self-employment"];
  assert.ok(reopenedMethod?.businessFacts?.homeOfficeOwned);
  reopenedMethod.businessFacts.homeOfficeOwned.confirmed = true;
  expect(buildTaxInputFromGuidedData(changedMethod)).toBeNull();
  assert.ok(business.businessFacts);
  business.businessFacts.homeOfficeRenter = rentalRecords;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("shows the 2026 owned-home records in the business interview and preserves saved evidence", () => {
  const { state, business } = ownedInterview();
  const renderBusiness = (taxYear: number, businessFacts?: SelfEmploymentSectionData["businessFacts"]) => renderToStaticMarkup(createElement(SectionSelfEmployment, {
    workspace: createWorkspaceRecord("form-8829-owned-home"), flowState: { ...state, taxYear }, ...business, businessFacts,
    onSectionChange: () => {},
  }));
  expect(renderBusiness(2025)).not.toContain("Add owned home office");
  expect(renderBusiness(2026)).toContain("Add owned home office");
  expect(renderBusiness(2025, business.businessFacts)).toContain("Remove owned home office");
  expect(renderBusiness(2026, business.businessFacts)).toContain("Date of fair market value shown in the record");

  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; }, clear: () => values.clear(), key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } satisfies Storage;
  const target = { storageKey: "form-8829-owned-home" };
  expect(saveGuidedFlowState(storage, target, state)).toBe(true);
  const reopened = loadGuidedFlowState(storage, target);
  assert.ok(reopened);
  expect(reopened.sectionData["income-self-employment"]?.businessFacts?.homeOfficeOwned).toEqual(ownedRecords);
  expect(buildTaxInputFromGuidedData(reopened)?.scheduleC?.homeOffice).toEqual(buildTaxInputFromGuidedData(state)?.scheduleC?.homeOffice);
});
