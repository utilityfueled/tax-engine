// Spec: spec/federal/form-5329-education-guided-2026.yaml.
import assert from "node:assert/strict";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type RetirementEntryData } from "@/lib/guided-interview-flow";
import { guidedIraEducationOwnerFingerprint } from "@/lib/guided-retirement-education";
import { TaxYearInputSchema } from "@/models/inputs";
import { guidedFirstHomeBirthDate, guidedFirstHomeRetirement, guidedFirstHomeWorksheet } from "../fixtures/guided-first-home";
import { completePersonalInfo, startCompleteInterview } from "./complete-facts";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const distributionDate = "2026-09-15";
const worksheet = {
  original: { ...guidedFirstHomeWorksheet.original, distributionDate, grossDistribution: "3000.45", ownerFingerprint: guidedIraEducationOwnerFingerprint(completePersonalInfo) },
  ordinaryTraditionalIraConfirmed: true,
  ownEligibleTuitionConfirmed: true,
  refundedOrReimbursed: false,
  coveredByEducationAccount: false,
  allocatedToEducationCredit: false,
  institutionName: "Example State College",
  billAccountReference: "C-2107",
  receiptAccountReference: "C-2107",
  paymentDate: "2026-08-25",
  billedTuition: "2,000.15",
  paidTuition: "2000.15",
  taxFreeAssistance: "0",
};
const original: RetirementEntryData = {
  ...guidedFirstHomeRetirement, sourceTaxYear: "2026", grossDistribution: "3000.45", taxableAmount: "3000.45",
  code1IraAgeSource: { ...guidedFirstHomeRetirement.code1IraAgeSource, distributionDate },
  code1IraEducationSource: worksheet,
};

beforeEach(() => vi.setSystemTime(new Date(2026, 9, 12, 12)));
afterEach(() => vi.useRealTimers());

function draft(entry: RetirementEntryData = original) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const personal = state.sectionData["personal-info"];
  assert.ok(personal);
  personal.dateOfBirth = guidedFirstHomeBirthDate;
  state.sectionData["income-retirement"] = { entries: [entry] };
  return state;
}

it("projects matched 2026 paid tuition and calculates exact code 08 amounts", () => {
  const state = draft();
  expect(validateSection(state, "income-retirement").status).toBe("complete");
  const projected = buildTaxInputFromGuidedData(state);
  expect(projected?.form5329).toEqual({ qualifiedHigherEducationExpenseExceptionAmount: "2000.15" });
  const input = TaxYearInputSchema.parse(projected);
  expect(input.form5329?.qualifiedHigherEducationExpenseExceptionAmount).toBe("2000.15");
  expect(input.form5329?.earlyDistributionsIncludedInIncome).toBeUndefined();
  const result = calculateFederalTax(input);
  expect(result.iraDistributionsTaxable.toFixed()).toBe("3000.45");
  const partI = result.form5329;
  assert.ok(partI);
  expect([partI.line1, partI.line2, partI.line3, partI.line4].map(amount => amount.toFixed()))
    .toEqual(["3000.45", "2000.15", "1000.3", "100.03"]);
  expect(partI.line2ExceptionNumber).toBe("08");
  const capped = buildTaxInputFromGuidedData(draft({ ...original, code1IraEducationSource: {
    ...worksheet, billedTuition: "4000", paidTuition: "4000",
  } }));
  expect(capped?.form5329?.qualifiedHigherEducationExpenseExceptionAmount).toBe("3000.45");
  expect(calculateFederalTax(TaxYearInputSchema.parse(capped)).form5329?.line4.toFixed()).toBe("0");
});

it("holds missing, mismatched and competing Code 08 source facts", () => {
  for (const changes of [
    { institutionName: "" }, { receiptAccountReference: "different" }, { paidTuition: "2000.14" },
    { paidTuition: "0", billedTuition: "0" }, { paidTuition: "2000.151", billedTuition: "2000.151" },
    { paymentDate: "2025-08-25" }, { paymentDate: "2027-01-01" }, { paymentDate: "2026-10-13" }, { paymentDate: "2026-02-30" },
    { ordinaryTraditionalIraConfirmed: false }, { ownEligibleTuitionConfirmed: undefined }, { refundedOrReimbursed: true },
    { taxFreeAssistance: "" }, { taxFreeAssistance: "0.01" }, { coveredByEducationAccount: true },
    { coveredByEducationAccount: null }, { allocatedToEducationCredit: true }, { allocatedToEducationCredit: null },
  ]) {
    const state = draft({ ...original, code1IraEducationSource: { ...worksheet, ...changes } });
    expect(validateSection(state, "income-retirement").allowSkip, JSON.stringify(changes)).toBe(false);
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(changes)).toBeNull();
  }
  for (const changes of [
    { sourceFactsConfirmed: null }, { additionalWorksheetRequired: true }, { grossDistribution: "3000.46", taxableAmount: "3000.46" },
    { payerTin: "12-3456788" }, { accountReference: "another IRA" }, { directRolloverConfirmed: true },
    { code1IraAgeSource: { ...original.code1IraAgeSource, distributionDate: "2026-09-16" } },
    { code1IraFirstHomeSource: guidedFirstHomeWorksheet },
  ]) expect(buildTaxInputFromGuidedData(draft({ ...original, ...changes })), JSON.stringify(changes)).toBeNull();
  const multiple = draft();
  const retirement = multiple.sectionData["income-retirement"];
  assert.ok(retirement);
  retirement.entries.push({ ...original, code1IraEducationSource: undefined, accountReference: "second IRA" });
  expect(buildTaxInputFromGuidedData(multiple)).toBeNull();
});

it("holds saved education benefit sources and a change of return year", () => {
  const state = draft();
  expect(buildTaxInputFromGuidedData(setInterviewTaxYear(state, 2025))).toBeNull();
  for (const credits of [
    { ...emptyCreditsData, education: { ...emptyCreditsData.education, llcExpenses: "5" } },
    { ...emptyCreditsData, educationDistributions: { taxYear: "2026" } },
  ]) {
    state.sectionData.credits = credits;
    expect(validateSection(state, "income-retirement").allowSkip).toBe(false);
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
});

it("preserves a separately qualifying medical exception and code 99", () => {
  const state = draft({ ...original, grossDistribution: "3000", taxableAmount: "3000", code1IraEducationSource: {
    ...worksheet, original: { ...worksheet.original, grossDistribution: "3000" }, billedTuition: "2000", paidTuition: "2000",
  } });
  const projected = buildTaxInputFromGuidedData(state);
  expect(projected?.form5329?.qualifiedHigherEducationExpenseExceptionAmount).toBe("2000");
  const input = TaxYearInputSchema.parse({ ...projected, scheduleA: { medicalExpenses: "1000" } });
  expect(input.form5329?.medicalExpenseExceptionAmount).toBeUndefined();
  expect(input.form5329?.supportedMedicalExpenseExceptionAmount).toBeUndefined();
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe("3000");
  const partI = result.form5329;
  assert.ok(partI);
  expect(partI.line2ExceptionNumber).toBe("99");
  expect([partI.line1, partI.line2, partI.line3, partI.line4].map(amount => amount.toFixed()))
    .toEqual(["3000", "2775", "225", "22.5"]);
  const explicitMedicalZero = TaxYearInputSchema.parse({ ...input, form5329: { ...input.form5329, medicalExpenseExceptionAmount: "0" } });
  expect(calculateFederalTax(explicitMedicalZero).form5329?.line2ExceptionNumber).toBe("08");
  const explicitLine1Zero = TaxYearInputSchema.parse({ ...input, form5329: { ...input.form5329, earlyDistributionsIncludedInIncome: "0" } });
  expect(calculateFederalTax(explicitLine1Zero).form5329?.line1.toFixed()).toBe("0");
});

it("holds a saved tuition proof after the primary taxpayer changes with the same birth date", () => {
  const originalState = draft();
  const personal = originalState.sectionData["personal-info"];
  assert.ok(personal);
  expect(buildTaxInputFromGuidedData(originalState)?.form5329?.qualifiedHigherEducationExpenseExceptionAmount).toBe("2000.15");
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => { records.set(key, value); },
    removeItem: (key: string) => { records.delete(key); },
  } as Storage;
  for (const change of [
    { firstName: "Another" },
    { middleName: "Different" },
    { ssn: "222-22-3333" },
    { ssn: "" },
    { firstName: "Another", lastName: "Taxpayer", ssn: "222-22-3333" },
  ]) {
    const edited = updateSectionData(originalState, "personal-info", { ...personal, ...change });
    expect(saveGuidedFlowState(storage, "tuition-owner", edited)).toBe(true);
    const restored = loadGuidedFlowState(storage, "tuition-owner");
    assert.ok(restored);
    expect(restored.sectionData["personal-info"]?.dateOfBirth).toBe(personal.dateOfBirth);
    expect(validateSection(restored, "income-retirement").allowSkip).toBe(false);
    expect(buildTaxInputFromGuidedData(restored)).toBeNull();
  }
  const formatted = updateSectionData(originalState, "personal-info", { ...personal, firstName: " JORDAN ", ssn: "111223333" });
  expect(buildTaxInputFromGuidedData(formatted)?.form5329?.qualifiedHigherEducationExpenseExceptionAmount).toBe("2000.15");
  const legacy = draft({ ...original, code1IraEducationSource: {
    ...worksheet, original: { ...worksheet.original, ownerFingerprint: undefined },
  } });
  expect(saveGuidedFlowState(storage, "tuition-owner", legacy)).toBe(true);
  const reopenedLegacy = loadGuidedFlowState(storage, "tuition-owner");
  assert.ok(reopenedLegacy);
  expect(buildTaxInputFromGuidedData(reopenedLegacy)).toBeNull();
});
