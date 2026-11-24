// Spec: spec/federal/guided-input.yaml, standard-deduction-source-facts
import { describe, expect, it } from "vitest";
import { buildStandardDeductionFacts, readGuidedShortAccountingPeriod, standardDeductionFactErrors, type StandardDeductionData } from "@/lib/guided-standard-deduction-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, emptyDeductionData, setInterviewTaxYear, updateSectionData } from "@/lib/guided-interview-flow";
import { computeGuidedPreviewOutcome } from "@/lib/guided-preview-compute";
import { completeMortgageSource, completeMortgageWorksheet, completePersonalInfo, startCompleteInterview } from "./complete-facts";
import { fictionalGuidedEmptyEicHistory } from "../fixtures/guided-eic-history";
const actual: StandardDeductionData = { primaryBlind: false, primaryCanBeClaimedAsDependent: false, primaryDeceased: false, dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false };
const shortPeriod = { startsOn: "2025-11-01", endsOn: "2026-03-31", sourceReference: "Private document label", sourceFactsConfirmed: true };

describe("guided short accounting periods", () => {
  it("records a confirmed short period across calendar years without projecting tax facts", () => {
    const data = { ...actual, shortTaxYear: true, shortAccountingPeriod: shortPeriod };
    expect(readGuidedShortAccountingPeriod(data, "single", 2025, completePersonalInfo)).toEqual({
      formerYearEndsOn: "2025-10-31", newYearStartsOn: "2026-04-01", months: 5,
    });
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData["personal-info"] = { ...completePersonalInfo, standardDeductionFacts: data };
    const taxInput = buildTaxInputFromGuidedData(state);
    expect(taxInput?.standardDeductionFacts?.shortTaxYear).toBe(true);
    expect(JSON.stringify(taxInput)).not.toContain(shortPeriod.sourceReference);
    expect(taxInput?.standardDeductionFacts).not.toHaveProperty("shortAccountingPeriod");
    expect(computeGuidedPreviewOutcome(state)).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/annualized tax calculation is unavailable/i) });
  });

  it("accepts whole months ending in February and preserves other facts as unconfirmed drafts", () => {
    const read = (patch: Partial<typeof shortPeriod>, year = 2025) => readGuidedShortAccountingPeriod({ ...actual, shortTaxYear: true, shortAccountingPeriod: { ...shortPeriod, ...patch } }, "single", year, completePersonalInfo);
    expect(read({ startsOn: "2024-02-01", endsOn: "2024-02-29" }, 2024)).toEqual({ formerYearEndsOn: "2024-01-31", newYearStartsOn: "2024-03-01", months: 1 });
    expect(read({ startsOn: "2025-02-01", endsOn: "2025-02-28" })).toEqual({ formerYearEndsOn: "2025-01-31", newYearStartsOn: "2025-03-01", months: 1 });
    for (const patch of [{ startsOn: "" }, { startsOn: "2025-11-02" }, { endsOn: "2026-02-29" }, { endsOn: "2026-03-30" }, { endsOn: "2025-10-31" }, { endsOn: "2026-10-31" }, { sourceReference: "   " }, { sourceFactsConfirmed: false }]) {
      expect(read(patch), JSON.stringify(patch)).toBeNull();
    }
    expect(read({}, 2026)).toBeNull();
    expect(readGuidedShortAccountingPeriod({ ...actual, shortTaxYear: true }, "single", 2025, completePersonalInfo)).toBeNull();
    expect(readGuidedShortAccountingPeriod({ ...actual, shortTaxYear: true, shortAccountingPeriod: shortPeriod }, "mfj", 2025, completePersonalInfo)).toBeNull();
  });

  it("revokes confirmation on source edits, return-year changes and primary filer changes", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    const personal = { ...completePersonalInfo, standardDeductionFacts: { ...actual, shortTaxYear: true, shortAccountingPeriod: shortPeriod } };
    state.sectionData["personal-info"] = personal;
    const packet = (draft: typeof state) => draft.sectionData["personal-info"]?.standardDeductionFacts?.shortAccountingPeriod;
    expect(packet(updateSectionData(state, "personal-info", { ...personal, addressLine1: "New address" }))).toEqual(shortPeriod);
    expect(packet(updateSectionData(state, "personal-info", { ...personal, lastName: "Different primary filer" }))).toEqual({ ...shortPeriod, sourceFactsConfirmed: null });
    const changed = { ...shortPeriod, endsOn: "2026-04-30" };
    expect(packet(updateSectionData(state, "personal-info", { ...personal, standardDeductionFacts: { ...personal.standardDeductionFacts, shortAccountingPeriod: changed } }))).toEqual({ ...changed, sourceFactsConfirmed: null });
    expect(packet(setInterviewTaxYear(setInterviewTaxYear(state, 2026), 2025))).toEqual({ ...shortPeriod, sourceFactsConfirmed: null });
    expect(packet(state)).toEqual(shortPeriod);
  });

  it("requires living taxpayer facts that reconcile to the former accounting year", () => {
    const data = { ...actual, shortTaxYear: true, shortAccountingPeriod: shortPeriod };
    expect(readGuidedShortAccountingPeriod({ ...data, primaryDeathDate: "2025-11-20" }, "single", 2025, completePersonalInfo)).toBeNull();
    for (const patch of [{ ssn: "000-00-0000" }, { ssn: "111 22 3333" }, { dateOfBirth: "2025-11-01" }, { dateOfBirth: "0000-01-01" }]) {
      expect(readGuidedShortAccountingPeriod(data, "single", 2025, { ...completePersonalInfo, ...patch }), JSON.stringify(patch)).toBeNull();
    }
    expect(readGuidedShortAccountingPeriod(data, "single", 2025, { ...completePersonalInfo, dateOfBirth: "2025-10-31" })).toMatchObject({ months: 5 });
  });

  it("keeps unrelated confirmations on edits to private short-period facts", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData.deductions = { ...emptyDeductionData, mortgageEntries: [{ ...completeMortgageSource }], mortgageWorksheet: { ...completeMortgageWorksheet } };
    state.sectionData.credits = { ...emptyCreditsData, educationDistributions: { taxYear: "2025", sourceFactsConfirmed: true } };
    const facts = { ...actual, shortTaxYear: true, shortAccountingPeriod: shortPeriod };
    const personal = { ...completePersonalInfo, standardDeductionFacts: facts };
    state.sectionData["personal-info"] = personal;
    personal.eicSeparatedSpouseSources = { sourceFactsConfirmed: true };
    personal.eicDisallowanceHistory = fictionalGuidedEmptyEicHistory(personal, "single", 2025);
    const edit = { ...personal, standardDeductionFacts: { ...facts, shortAccountingPeriod: { ...shortPeriod, sourceReference: "Refiled local label" } } };
    const revised = updateSectionData(state, "personal-info", edit);
    expect(revised.sectionData["personal-info"]?.standardDeductionFacts?.shortAccountingPeriod?.sourceFactsConfirmed).toBeNull();
    expect(revised.sectionData.deductions?.mortgageEntries?.[0]?.sourceFactsConfirmed).toBe(true);
    expect(revised.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBe(true);
    expect(revised.sectionData["personal-info"]?.eicDisallowanceHistory?.sourceFactsConfirmed).toBe(true);
    for (const originalEdit of [{ ...personal, addressLine1: "New address" }, { ...personal, standardDeductionFacts: { ...facts, shortTaxYear: false } }]) {
      const changed = updateSectionData(state, "personal-info", originalEdit);
      expect(changed.sectionData.deductions?.mortgageEntries?.[0]?.sourceFactsConfirmed).toBeNull();
      expect(changed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    }
    const changedYearType = updateSectionData(state, "personal-info", { ...personal, standardDeductionFacts: { ...facts, shortTaxYear: false } });
    expect(changedYearType.sectionData["personal-info"]?.eicDisallowanceHistory?.sourceFactsConfirmed).toBeNull();
  });
});

describe("guided standard deduction actual facts", () => {
  it("preserves actual blindness dependency signed worksheet and alive answers", () => {
    const data = { ...actual, primaryBlind: true, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: "-9007199254740993.01" };
    expect(standardDeductionFactErrors(data, "single", 2026, completePersonalInfo)).toEqual({});
    expect(buildStandardDeductionFacts(data, "single", 2026, completePersonalInfo)).toMatchObject({ primaryBlind: true, primaryCanBeClaimedAsDependent: true, primaryDeathDate: null, dependentEarnedIncome: "-9007199254740993.01" });
    for (const field of ["primaryBlind", "primaryCanBeClaimedAsDependent", "primaryDeceased", "dualStatusAlien", "nonresidentAlien", "shortTaxYear", "dependentEarnedIncome"] as const) { const unknown = { ...data }; delete unknown[field]; expect(() => buildStandardDeductionFacts(unknown, "single", 2026, completePersonalInfo)).toThrow(); }
    expect(() => buildStandardDeductionFacts({ ...data, dependentEarnedIncome: "NaN" }, "single", 2026, completePersonalInfo)).toThrow();
  });
  it("requires actual death dates and MFS spouse extra-box eligibility", () => {
    const data = { ...actual, primaryDeceased: true, primaryDeathDate: "2026-02-01", claimSpouseAdditionalDeduction: true, spouseHasGrossIncome: false, spouseFilesReturn: false };
    expect(buildStandardDeductionFacts(data, "mfs", 2026, completePersonalInfo)).toMatchObject({ primaryDeathDate: "2026-02-01", spouseDeathDate: null, spouseHasGrossIncome: false });
    for (const primaryDeathDate of ["", "2025-12-31", "2026-02-30"]) expect(() => buildStandardDeductionFacts({ ...data, primaryDeathDate }, "mfs", 2026, completePersonalInfo)).toThrow();
    expect(() => buildStandardDeductionFacts({ ...data, primaryDeceased: false }, "mfs", 2026, completePersonalInfo)).toThrow();
    expect(() => buildStandardDeductionFacts({ ...data, spouseHasGrossIncome: true }, "mfs", 2026, completePersonalInfo)).toThrow();
    expect(() => buildStandardDeductionFacts({ ...actual, nonresidentAlien: true }, "mfj", 2026, completePersonalInfo)).toThrow();
  });
  it("honors actual selected deduction methods and blocks incomplete personal facts", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData["personal-info"] = { ...completePersonalInfo, standardDeductionFacts: actual };
    for (const method of ["standard", "itemized"] as const) { state.sectionData.deductions = { ...emptyDeductionData, method }; expect(buildTaxInputFromGuidedData(state)?.deductionElection).toBe(method); }
    state.sectionData["personal-info"].standardDeductionFacts = undefined;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
});
