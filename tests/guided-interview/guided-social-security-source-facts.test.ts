// Spec: spec/federal/guided-input.yaml, social-security-source-records
import { expect, it } from "vitest";
import { buildGuidedFactAnswers, buildGuidedSyntheticDocuments, buildSocialSecurityInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { type SocialSecurityData, validateSection } from "@/lib/guided-interview-flow";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";

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
  state.sectionData.adjustments = { hsaDeduction: "", studentLoanInterest: "", selfEmployedHealthInsurance: "", educatorExpenses: "", iraDeduction: "100", alimonyPaid: "", iraContributions: { primaryContributions: "100", primaryIsActiveParticipant: true } };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
