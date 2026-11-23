// Spec: spec/federal/form-1099-r-disability-guided-2026.yaml.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { setInterviewTaxYear, updateSectionData, validateSection, type RetirementEntryData } from "@/lib/guided-interview-flow";
import { iraEducationOwnerFingerprint } from "@/utils/ira-education-owner.js";
import { completePersonalInfo, completeRetirementSource, startCompleteInterview } from "./complete-facts";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

// The otherwise independent EIC calculation has an actual disqualifying SSN answer.
const personal = { ...completePersonalInfo, dateOfBirth: "1966-08-01", employmentValidSsnIssuedByDueDate: false };
const statement = {
  ...completeRetirementSource, sourceTaxYear: "2026", distributionCode: "3",
  grossDistribution: "12000.45", taxableAmount: "9000.25", federalWithheld: "900.15",
};
const ownerFingerprint = iraEducationOwnerFingerprint(personal);
if (!ownerFingerprint) throw new Error("The synthetic taxpayer is missing an owner fingerprint");
const worksheet = {
  original: {
    sourceTaxYear: "2026", payer: statement.payer, payerTin: "123456789", accountReference: statement.accountReference,
    ownerFingerprint, ownerBirthDate: personal.dateOfBirth,
    grossDistribution: "12000.45", taxableAmount: "9000.25", federalWithheld: "900.15",
  },
  planReference: "Employer disability retirement plan notice",
  employerDisabilityPensionConfirmed: true, singlePaymentConfirmed: true,
  minimumRetirementDate: "2026-08-01", paymentDate: "2026-07-31",
  publicSafetyOfficerExclusionElected: false,
};

beforeEach(() => vi.setSystemTime(new Date(2026, 9, 12, 12)));
afterEach(() => vi.useRealTimers());

function draft(entry: RetirementEntryData = { ...statement, code3DisabilitySource: worksheet }) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  state.sectionData["personal-info"] = personal;
  state.sectionData["income-retirement"] = { entries: [entry] };
  return state;
}

it("projects a documented 2026 Code 3 disability pension as wages", () => {
  const state = draft();
  expect(validateSection(state, "income-retirement").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.form1099R?.[0]).toMatchObject({
    taxYear: 2026, distributionCode: "3", distributionDate: "2026-07-31", disabilityPensionBeforeMinimumRetirementAge: true,
    grossDistribution: "12000.45", taxableAmount: "9000.25", federalWithheld: "900.15",
  });
  const federal = calculateFederalTax(input);
  expect(federal.allLines.find(line => line.form === "1040" && line.line === "1h")?.value.toFixed()).toBe("9000.25");
  expect(federal.pensionDistributionsTaxable.toFixed()).toBe("0");
  expect(federal.totalWithholding.toFixed()).toBe("900.15");
  expect(federal.form5329?.line4.toFixed() ?? "0").toBe("0");
});

it("requires an explicit public safety officer election answer for the saved Code 3 worksheet", () => {
  for (const [answer, expectedError] of [
    [undefined, /confirm whether you are electing.*public safety officer/i],
    [null, /confirm whether you are electing.*public safety officer/i],
    [true, /review.*employer plan and paid premium records/i],
  ] as const) {
    const state = draft({ ...statement, code3DisabilitySource: { ...worksheet, publicSafetyOfficerExclusionElected: answer } });
    const validation = validateSection(state, "income-retirement");
    expect(validation.fieldErrors["retirement-0-code3-disability"]).toMatch(expectedError);
    expect(validation.allowSkip).toBe(false);
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
});

it("holds unknown or stale Code 3 disability pension records", () => {
  const requiresWorksheet = validateSection(draft(statement), "income-retirement");
  expect(requiresWorksheet.fieldErrors["retirement-0-code3-disability"]).toMatch(/enter the actual employer disability pension worksheet/i);
  const unknownTaxableAmount = validateSection(draft({ ...statement, taxableAmount: "" }), "income-retirement");
  expect(unknownTaxableAmount.fieldErrors["retirement-0-code3-disability"]).toMatch(/complete the statement facts or use separate retirement review/i);
  for (const patch of [
    { code3DisabilitySource: undefined }, { taxableAmount: "" }, { taxableAmountNotDetermined: true },
    { payerTin: "12-3456788" }, { accountReference: "changed pension account" }, { taxableAmount: "9000.24" },
    { distributionCode: "3D" }, { distributionCode: "7" }, { isIraSepSimple: true },
    { code3DisabilitySource: { ...worksheet, singlePaymentConfirmed: false } },
    { code3DisabilitySource: { ...worksheet, employerDisabilityPensionConfirmed: null } },
    { code3DisabilitySource: { ...worksheet, planReference: "" } },
    { code3DisabilitySource: { ...worksheet, minimumRetirementDate: "" } },
    { code3DisabilitySource: { ...worksheet, paymentDate: "2026-08-01" } },
    { code3DisabilitySource: { ...worksheet, paymentDate: "2026-08-02" } },
    { code3DisabilitySource: { ...worksheet, paymentDate: "2025-07-31" } },
    { code3DisabilitySource: { ...worksheet, paymentDate: "2026-12-20", minimumRetirementDate: "2027-08-01" } },
  ]) {
    const state = draft({ ...statement, code3DisabilitySource: worksheet, ...patch });
    expect(validateSection(state, "income-retirement").allowSkip, JSON.stringify(patch)).toBe(false);
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(patch)).toBeNull();
  }
  for (const changes of [{ ssn: "111-22-4444" }, { dateOfBirth: "1967-08-01" }]) {
    const state = updateSectionData(draft(), "personal-info", { ...personal, ...changes });
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  const extra = draft();
  const retirement = extra.sectionData["income-retirement"];
  if (!retirement) throw new Error("The synthetic interview is missing retirement income");
  retirement.entries.push({ ...statement, distributionCode: "7", accountReference: "second plan" });
  expect(buildTaxInputFromGuidedData(extra)).toBeNull();
  expect(buildTaxInputFromGuidedData(setInterviewTaxYear(draft(), 2025))).toBeNull();
});
