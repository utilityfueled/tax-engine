// Spec: spec/federal/form-5329-first-home-guided-2026.yaml.
import assert from "node:assert/strict";
import { afterEach, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { setInterviewTaxYear, type RetirementEntryData } from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs";
import { guidedFirstHomeBirthDate, guidedFirstHomeRetirement, guidedFirstHomeWorksheet } from "../fixtures/guided-first-home";
import { startCompleteInterview } from "./complete-facts";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const distributionDate = "2026-09-15";
const worksheet = {
  ...guidedFirstHomeWorksheet,
  original: { ...guidedFirstHomeWorksheet.original, distributionDate },
  bindingContractDate: "2026-10-20",
  paymentDate: "2027-01-13",
};
const original: RetirementEntryData = {
  ...guidedFirstHomeRetirement, sourceTaxYear: "2026",
  code1IraAgeSource: { ...guidedFirstHomeRetirement.code1IraAgeSource, distributionDate },
  code1IraFirstHomeSource: worksheet,
};

afterEach(() => vi.useRealTimers());

function draft(entries: RetirementEntryData[], taxYear = 2026) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = taxYear;
  const personal = state.sectionData["personal-info"];
  assert.ok(personal);
  personal.dateOfBirth = guidedFirstHomeBirthDate;
  state.sectionData["income-retirement"] = { entries };
  return state;
}

it("projects the confirmed 2026 first-home source and applies the exact day 120 result", () => {
  vi.setSystemTime(new Date(2027, 0, 13, 12));
  const state = draft([original]);
  const projected = buildTaxInputFromGuidedData(state);
  expect(projected?.form1099R[0]).toMatchObject({ taxYear: 2026, distributionCode: "1", distributionDate });
  expect(projected?.form5329FirstHomeSource).toMatchObject({
    sourceTaxYear: 2026, owner: "primary", distributionReceivedDate: distributionDate,
    qualifiedPayment: { date: "2027-01-13", amount: "6500" },
  });
  const result = calculateFederalTax(TaxYearInputSchema.parse(projected));
  expect(result.iraDistributionsTaxable.toFixed()).toBe("7000");
  expect(result.form5329?.line2ExceptionNumber).toBe("09");
  const partI = result.form5329;
  assert.ok(partI);
  expect([partI.line1, partI.line2, partI.line3, partI.line4].map(amount => amount.toFixed()))
    .toEqual(["7000", "6000", "1000", "100"]);
  expect(buildTaxInputFromGuidedData(setInterviewTaxYear(state, 2025))).toBeNull();
});

it("holds day 121 and unsupported 2026 first-home sources", () => {
  vi.setSystemTime(new Date(2027, 0, 14, 12));
  const project = (entry: RetirementEntryData) => buildTaxInputFromGuidedData(draft([entry]));
  expect(project(original)).not.toBeNull();
  for (const changes of [
    { paymentDate: "2027-01-14" }, { ownHomePurchaseCompleted: false },
    { distributionWasNotRolledOver: false }, { priorQualifiedDistributions: "" },
    { original: { ...worksheet.original, distributionDate: "2025-09-15" } },
  ]) {
    expect(project({ ...original, code1IraFirstHomeSource: { ...worksheet, ...changes } })).toBeNull();
  }
  for (const changes of [
    { sourceTaxYear: "2025" }, { accountHolder: "spouse" as const }, { distributionCode: "J" },
    { iraBasisConfirmedZero: false }, { trumpAccount: true }, { excessContributionEarnings: "1" },
    { directRolloverConfirmed: true }, { additionalWorksheetRequired: true },
    { payerTin: "12-3456788" }, { accountReference: "another IRA" }, { sourceFactsConfirmed: false },
  ]) {
    expect(project({ ...original, ...changes })).toBeNull();
  }
  expect(buildTaxInputFromGuidedData(draft([original, {
    ...original, accountReference: "second IRA", code1IraFirstHomeSource: undefined,
  }]))).toBeNull();
});

it("holds future receipt, contract and purchase payment dates until they occur", () => {
  const receiptOnly = { ...original, code1IraFirstHomeSource: undefined };
  const project = (entry: RetirementEntryData) => buildTaxInputFromGuidedData(draft([entry]));
  vi.setSystemTime(new Date(2026, 8, 14, 23, 59, 59));
  expect.soft(project(receiptOnly), "September 15 receipt has not occurred").toBeNull();
  expect.soft(project(original), "all three source dates are still future").toBeNull();

  vi.setSystemTime(new Date(2026, 8, 15, 0, 0));
  expect.soft(project(receiptOnly)?.form1099R[0]?.distributionDate, "same-day actual receipt").toBe(distributionDate);

  vi.setSystemTime(new Date(2026, 9, 19, 23, 59, 59));
  expect.soft(project(original), "the binding contract and payment are still future").toBeNull();
  vi.setSystemTime(new Date(2027, 0, 12, 23, 59, 59));
  expect.soft(project(original), "only the payment is still future").toBeNull();

  vi.setSystemTime(new Date(2027, 0, 13, 0, 0));
  expect.soft(project(original)?.form5329FirstHomeSource?.qualifiedPayment.date, "same-day actual payment").toBe(worksheet.paymentDate);
  const completed2025 = { ...guidedFirstHomeRetirement, code1IraFirstHomeSource: guidedFirstHomeWorksheet };
  expect(buildTaxInputFromGuidedData(draft([completed2025], 2025))?.form5329FirstHomeSource?.sourceTaxYear).toBe(2025);
});
