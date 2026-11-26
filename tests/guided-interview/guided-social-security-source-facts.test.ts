// Spec: spec/federal/guided-input.yaml, social-security-source-records and social-security-2026-small-excess-repayment
import { expect, it, vi } from "vitest";
import { buildGuidedFactAnswers, buildGuidedSyntheticDocuments, buildSocialSecurityInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { loadGuidedFlowState, setInterviewTaxYear, type SocialSecurityData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { completeIraSources, completeW2Entry, startCompleteInterview } from "./complete-facts";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { assertPdfExportAllowed } from "@/pdf/export-policy";
import { unemploymentSource } from "../fixtures/guided-government-uc-original";

const stagedCore = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return {
    ...original,
    getConstants: (year: number) => year === 2026 && stagedCore.enabled ? FEDERAL_2026_CONSTANTS : original.getConstants(year),
  };
});

const source = { sourceType: "ssa-1099" as const, sourceTaxYear: "2025", accountReference: "actual-ssa", beneficiaryRole: "primary" as const, recipient: "Actual Taxpayer", beneficiaryTaxIdLast4: "3333", benefitsPaid: "1000.30", benefitsRepaid: "0.20", netBenefits: "1000.10", federalWithheld: "0", priorYearBenefits: false, sourceFactsConfirmed: true };
const data = (entries: NonNullable<SocialSecurityData["entries"]> = [source]): SocialSecurityData => ({ netBenefits: "", federalWithheld: "", entries, residentTreatmentConfirmed: true, puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", sourceFactsConfirmed: true });

it("preserves actual SSA and railroad source amounts and excludes another beneficiary", () => {
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  state.sectionData["income-social-security"] = data([
    source,
    { ...source, sourceType: "rrb-1099", accountReference: "railroad", beneficiaryRole: "spouse", recipient: "Actual Spouse", beneficiaryTaxIdLast4: "4444", benefitsPaid: "50.10", benefitsRepaid: "0", netBenefits: "50.10", federalWithheld: "0.10" },
    { ...source, accountReference: "child", beneficiaryRole: "other", recipient: "Actual Child", beneficiaryTaxIdLast4: "1111", netBenefits: "1000.10", federalWithheld: "12.34" },
  ]);
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.formSSA1099).toEqual([{ recipient: "Actual Taxpayer", netBenefits: "1000.10", federalWithheld: "0" }]);
  expect(input?.formRRB1099).toEqual([{ recipient: "Actual Spouse", netSocialSecurityEquivalentBenefitPortion: "50.10", federalWithheld: "0.10" }]);
  expect(validateSection(state, "income-social-security").status).toBe("complete");
});

it("keeps zero records and rejects unknown, mismatched, duplicate and unreconciled benefit facts", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  state.sectionData["income-social-security"] = data([{ ...source, benefitsPaid: "0", benefitsRepaid: "0", netBenefits: "0" }]);
  expect(buildTaxInputFromGuidedData(state)?.formSSA1099?.[0]?.netBenefits).toBe("0");
  for (const change of [{ beneficiaryRole: undefined }, { federalWithheld: "" }, { beneficiaryTaxIdLast4: "0000" }, { sourceTaxYear: "2026" }, { sourceFactsConfirmed: undefined }, { benefitsRepaid: "0" }, { priorYearBenefits: undefined }, { beneficiaryRole: "spouse" }]) {
    state.sectionData["income-social-security"] = data([{ ...source, ...change }]);
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
    expect(buildGuidedSyntheticDocuments(state).find(document => document.kind === "ssa-1099")?.coverage).toBe("partially-supported");
  }
  state.sectionData["income-social-security"] = data([source, source]);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData["income-social-security"] = { netBenefits: "1000.10", federalWithheld: "" };
  expect(() => buildSocialSecurityInputs(state.sectionData["income-social-security"])).toThrow();
  expect(buildGuidedFactAnswers(state).find(fact => fact.factId === "social-security-benefits-review")?.answerText).not.toContain("confirmed");
});

it("requires the actual lump-sum method and preserves signed excess repayments for review", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  state.sectionData["income-social-security"] = data([{ ...source, priorYearBenefits: true, priorYearBenefitsAmount: "100" }]);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData["income-social-security"].lumpSumMethod = "current-year";
  expect(buildTaxInputFromGuidedData(state)?.formSSA1099?.[0]?.netBenefits).toBe("1000.10");
  state.sectionData["income-social-security"].lumpSumMethod = "election";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData["income-social-security"] = data([{ ...source, benefitsPaid: "0", benefitsRepaid: "12.34", netBenefits: "-12.34" }]);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(state.sectionData["income-social-security"].entries?.[0]?.netBenefits).toBe("-12.34");
});

const repayment2026 = { ...source, sourceTaxYear: "2026", benefitsPaid: "1000", benefitsRepaid: "4000", netBenefits: "-3000", federalWithheld: "37.25" };
const smallRepayment2026Data = () => ({ ...data([repayment2026]), noOtherPriorYearRepaymentsConfirmed: true });

it("calculates confirmed 2026 small excess repayments without losing signed benefits or withholding", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  for (const [benefitsRepaid, netBenefits] of [["4000", "-3000"], ["1000.01", "-0.01"]]) {
    state.sectionData["income-social-security"] = { ...smallRepayment2026Data(), entries: [{ ...repayment2026, benefitsRepaid, netBenefits }] };
    expect(validateSection(state, "income-social-security").status).toBe("complete");
    expect(buildGuidedSyntheticDocuments(state).find(document => document.kind === "ssa-1099")?.coverage).toBe("supported");
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    expect(input.formSSA1099).toEqual([{ recipient: "Actual Taxpayer", netBenefits, federalWithheld: "37.25" }]);
    expect(() => calculateFederalTax(input)).toThrow(/2026.*incomplete/);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review PDF mapping/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/);

    // Exercise the regular federal core with independently staged 2026 constants in this test only.
    stagedCore.enabled = true;
    try {
      const result = calculateFederalTax(input);
      expect(result.socialSecurityBenefitsGross.toFixed()).toBe(netBenefits);
      expect(result.socialSecurityBenefitsTaxable.toFixed()).toBe("0");
      expect(result.allLines.some(line => line.form === "SS Worksheet")).toBe(false);
      expect(result.totalWithholding.toFixed()).toBe("37.25");
      expect(result.agi.toFixed()).toBe("0");
      expect(result.claimOfRight).toBeUndefined();
      expect(result.refund.toFixed()).toBe("37.25");
    } finally {
      stagedCore.enabled = false;
    }
  }
  const reopened = loadGuidedFlowState({ getItem: () => JSON.stringify(state) } as unknown as Storage, "ss-repayment");
  if (!reopened) throw new Error("The confirmed repayment draft must reopen");
  expect(buildTaxInputFromGuidedData(reopened)?.formSSA1099?.[0]?.netBenefits).toBe("-0.01");
  const returnedTo2026 = setInterviewTaxYear(setInterviewTaxYear(reopened, 2025), 2026);
  expect(returnedTo2026.sectionData["income-social-security"]?.noOtherPriorYearRepaymentsConfirmed).toBeNull();
  expect(validateSection(returnedTo2026, "income-social-security").fieldErrors?.socialSecurityRepayment).toMatch(/Confirm/);
});

it("continues to hold unsupported 2026 benefit repayments", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const supported = smallRepayment2026Data();
  for (const held of [
    { ...supported, entries: [{ ...repayment2026, benefitsRepaid: "4000.01", netBenefits: "-3000.01" }] },
    { ...supported, entries: [{ ...repayment2026, benefitsPaid: "1000.001", benefitsRepaid: "4000.001" }] },
    { ...supported, entries: [{ ...repayment2026, federalWithheld: "" }] },
    { ...supported, noOtherPriorYearRepaymentsConfirmed: undefined },
    { ...supported, noOtherPriorYearRepaymentsConfirmed: false },
    { ...supported, lumpSumMethod: "current-year" as const, entries: [{ ...repayment2026, priorYearBenefits: true, priorYearBenefitsAmount: "100" }] },
    { ...supported, entries: [{ ...repayment2026, sourceType: "rrb-1099" as const }] },
    { ...supported, entries: [repayment2026, { ...repayment2026, beneficiaryRole: "other" as const, accountReference: "second-original" }] },
  ]) {
    state.sectionData["income-social-security"] = held;
    expect(validateSection(state, "income-social-security").status, JSON.stringify(held)).toBe("partial");
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(held)).toBeNull();
  }
  state.sectionData["income-social-security"] = supported;
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("The synthetic resident taxpayer facts must be present");
  for (const changedStatus of [{ dualStatusAlien: true }, { nonresidentAlien: true, residentJointElection: true }]) {
    const changed = updateSectionData(state, "personal-info", { ...personal, standardDeductionFacts: { ...personal.standardDeductionFacts, ...changedStatus } });
    expect(validateSection(changed, "income-social-security").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  }

  const governmentSource = { ...unemploymentSource, sourceTaxYear: "2026", sourceFormRevision: "2026-12", familyLeaveBenefits: "0" };
  const withGovernment = updateSectionData(state, "income-unemployment", { compensation: "", federalWithheld: "", entries: [governmentSource] });
  expect(buildTaxInputFromGuidedData(withGovernment)?.formSSA1099?.[0]?.netBenefits).toBe("-3000");
  const withRepayment = updateSectionData(withGovernment, "income-unemployment", { compensation: "", federalWithheld: "", entries: [{ ...governmentSource, priorYearRepaid: "1" }] });
  expect(validateSection(withRepayment, "income-social-security").fieldErrors?.socialSecurityRepayment).toMatch(/separate repayment/);
  expect(buildTaxInputFromGuidedData(withRepayment)).toBeNull();
});

it("invalidates a retained small repayment confirmation after a raw source update", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  state.sectionData["income-social-security"] = { ...smallRepayment2026Data(), noOtherPriorYearRepaymentsConfirmed: null };
  const confirmed = updateSectionData(state, "income-social-security", smallRepayment2026Data());
  expect(validateSection(confirmed, "income-social-security").status).toBe("complete");
  const replacement = updateSectionData(confirmed, "income-social-security", { ...smallRepayment2026Data(), entries: [{ ...repayment2026, federalWithheld: "41.10" }] });
  expect(replacement.sectionData["income-social-security"]?.entries?.[0]?.federalWithheld).toBe("41.10");
  expect(replacement.sectionData["income-social-security"]?.noOtherPriorYearRepaymentsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(replacement)).toBeNull();
});

it("reconfirms the statement and small repayment after a same-last-four primary taxpayer replacement", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  state.sectionData["income-social-security"] = smallRepayment2026Data();
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("Missing synthetic taxpayer details.");
  const sameOwner = updateSectionData(state, "personal-info", { ...personal, ssn: "111223333", addressLine1: "2 Example Lane" });
  expect(buildTaxInputFromGuidedData(sameOwner)?.formSSA1099?.[0]?.federalWithheld).toBe("37.25");

  const replaced = updateSectionData(state, "personal-info", { ...personal, firstName: "Morgan", ssn: "555-66-3333" });
  expect(replaced.sectionData["income-social-security"]).toMatchObject({
    sourceFactsConfirmed: null, noOtherPriorYearRepaymentsConfirmed: null,
    entries: [{ accountReference: "actual-ssa", netBenefits: "-3000", federalWithheld: "37.25", sourceFactsConfirmed: null }],
  });
  const reopened = loadGuidedFlowState({ getItem: () => JSON.stringify(replaced) } as Storage, "new-owner");
  expect(validateSection(reopened, "income-social-security").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
});

it("forwards actual prior-year election records and rejects inconsistent historical years and zero guesses", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  const history = { taxYear: "2024", filingStatus: "mfs" as const, livedWithSpouseAtAnyTimeDuringYear: false, benefitsReceivedInEarlierYear: "0", delayedBenefitsReceivedInCurrentYear: "100", adjustedGrossIncome: "-10.20", taxExemptInterest: "0", exclusionsAdjustments: "0", taxableBenefitsPreviouslyReported: "0", sourceFactsConfirmed: true };
  state.sectionData["income-social-security"] = { ...data([{ ...source, priorYearBenefits: true, priorYearBenefitsAmount: "100" }]), lumpSumMethod: "election", currentYearExclusionsAdjustments: "0", earlierYears: [history] };
  expect(buildTaxInputFromGuidedData(state)?.socialSecurityLumpSumElection).toMatchObject({ currentYearExclusionsAdjustments: "0", earlierYears: [{ taxYear: 2024, filingStatus: "married_filing_separately", adjustedGrossIncome: "-10.20", livedWithSpouseAtAnyTimeDuringYear: false }] });
  for (const change of [{ taxYear: "2025" }, { delayedBenefitsReceivedInCurrentYear: "1000.11" }, { taxExemptInterest: "" }, { sourceFactsConfirmed: false }, { livedWithSpouseAtAnyTimeDuringYear: undefined }]) {
    state.sectionData["income-social-security"].earlierYears = [{ ...history, ...change }];
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
  }
  state.sectionData["income-social-security"].earlierYears = [history, history];
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("reconciles every prior-year benefit allocation to actual source-statement amounts", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  const history = { taxYear: "2024", filingStatus: "single" as const, benefitsReceivedInEarlierYear: "0", delayedBenefitsReceivedInCurrentYear: "100", adjustedGrossIncome: "20000", taxExemptInterest: "0", exclusionsAdjustments: "0", taxableBenefitsPreviouslyReported: "0", sourceFactsConfirmed: true };
  state.sectionData["income-social-security"] = { ...data([{ ...source, priorYearBenefits: true, priorYearBenefitsAmount: "50.10" }]), lumpSumMethod: "election", currentYearExclusionsAdjustments: "0", earlierYears: [history] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData["income-social-security"].earlierYears = [{ ...history, delayedBenefitsReceivedInCurrentYear: "50.10" }];
  expect(buildTaxInputFromGuidedData(state)?.socialSecurityLumpSumElection?.earlierYears[0]?.delayedBenefitsReceivedInCurrentYear).toBe("50.10");
  state.sectionData["income-social-security"].entries![0]!.priorYearBenefits = false;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("includes actual possession exclusions in the independently computed taxable benefits", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security", "w2-wages"], lifeEvents: [], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "10000" }] };
  state.sectionData["income-social-security"] = { ...data([{ ...source, benefitsPaid: "20000", benefitsRepaid: "0", netBenefits: "20000" }]), puertoRicoIncomeExclusion: "15000", americanSamoaIncomeExclusion: "10000" };
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.socialSecurityFacts).toEqual({ puertoRicoIncomeExclusion: "15000", americanSamoaIncomeExclusion: "10000", sourceFactsConfirmed: true });
  // Publication 915: 0.85 × (45,000 − 34,000) + 4,500 = 13,850, below 85% of benefits.
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).socialSecurityBenefitsTaxable.toFixed()).toBe("13850");
});

it("requires the actual IRA interaction worksheet when a covered person contributes", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  state.sectionData["income-social-security"] = data();
  state.sectionData.adjustments = { hsaDeduction: "", studentLoanInterest: "", selfEmployedHealthInsurance: "", educatorExpenses: "", iraDeduction: "100", alimonyPaid: "", iraContributions: { ...completeIraSources, primaryContributions: "100", primaryIsActiveParticipant: true } };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("does not discard saved benefit aggregates behind an empty source-record array", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
  for (const amount of ["0", "1000.10"]) {
    state.sectionData["income-social-security"] = { netBenefits: amount, federalWithheld: "0", entries: [] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(validateSection(state, "income-social-security").status).toBe("partial");
    expect(buildGuidedFactAnswers(state).find(fact => fact.factId === "social-security-benefits-review")).toBeDefined();
  }
});
