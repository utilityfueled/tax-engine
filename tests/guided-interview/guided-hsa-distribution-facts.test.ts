// Spec: spec/federal/guided-hsa-distributions.yaml
import { expect, it } from "vitest";
import { buildHsaDistributionInputs, hsaDistributionFactErrors, type HsaDistributionSource } from "@/lib/guided-hsa-distribution-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData } from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs";
import { calculateFederalTax } from "@/engine/federal";
import { completeHsaSources, startCompleteInterview } from "./complete-facts";
const medical = { qualifiedExpense: true, beneficiaryEligible: true, incurredAfterHsaEstablished: true, notReimbursedElsewhere: true, notDeductedOnScheduleA: true };
const source: HsaDistributionSource = { id: "source1", sourceTaxYear: "2025", accountOwner: "primary", payer: "Actual HSA bank", payerTin: "12-3456789", accountReference: "actual-source-account", accountType: "hsa", distributionCode: "1", grossDistribution: "1000.10", earningsOnExcessContributions: "0", trusteeToTrusteeTransfer: false, sourceFactsConfirmed: true,
  events: [{ id: "event1", distributionDate: "2025-04-01", grossDistribution: "1000.10", medicalExpenses: "800.05", medicalEligibility: medical, rolloverAmount: "0" }] };
const errors = (records: HsaDistributionSource[]) => hsaDistributionFactErrors(records, "primary", 2025, "1990-02-15");
it("reconciles exact ordinary distribution events without guessing missing facts", () => {
  expect(errors([source])).toEqual({});
  const result = buildHsaDistributionInputs([source], "primary", 2025, "1990-02-15");
  expect(result.form1099SA[0]).toMatchObject({ grossDistribution: "1000.1", earningsOnExcessContributions: "0", accountHolder: "primary", accountType: "hsa", distributionCode: "1" });
  expect(result.form8889).toMatchObject({ qualifiedMedicalExpenses: "800.05", rolloverDistributions: "0", distributionsAfterAge65: "0" });
  for (const patch of [{ accountOwner: "" }, { sourceTaxYear: "" }, { earningsOnExcessContributions: "" }, { sourceFactsConfirmed: false }, { distributionCode: "2" }, { accountType: "archer_msa" }]) expect(Object.keys(errors([{ ...source, ...patch } as HsaDistributionSource])).length).toBeGreaterThan(0);
  expect(Object.keys(errors([source, source])).length).toBeGreaterThan(0);
  expect(Object.keys(errors([{ ...source, grossDistribution: "1000.11" }])).length).toBeGreaterThan(0);
});
it("preserves known medical ineligibility and prevents duplicate expense use", () => {
  const noExpense = { ...source, events: [{ ...source.events[0]!, medicalEligibility: { ...medical, notReimbursedElsewhere: false } }] };
  expect(buildHsaDistributionInputs([noExpense], "primary", 2025, "1990-02-15").form8889.qualifiedMedicalExpenses).toBe("0");
  expect(noExpense.events[0]?.medicalExpenses).toBe("800.05");
  const unknown = { ...source, events: [{ ...source.events[0]!, medicalEligibility: { ...medical, notDeductedOnScheduleA: null } }] };
  expect(Object.keys(errors([unknown])).length).toBeGreaterThan(0);
  expect(Object.keys(errors([{ ...source, events: [{ ...source.events[0]!, medicalExpenses: "1000.11" }] }])).length).toBeGreaterThan(0);
  const zero = { ...source, grossDistribution: "0", events: [{ ...source.events[0]!, grossDistribution: "0", medicalExpenses: "0", medicalEligibility: undefined }] };
  expect(errors([zero])).toEqual({});
});
it("uses actual rollover dates and taxable post-age65 amounts", () => {
  const current: HsaDistributionSource = { ...source, grossDistribution: "300", events: [
    { id: "early", distributionDate: "2025-03-01", grossDistribution: "100", medicalExpenses: "0", rolloverAmount: "0" },
    { id: "later", distributionDate: "2025-06-01", grossDistribution: "200", medicalExpenses: "20", medicalEligibility: medical, rolloverAmount: "100", rolloverReceivedDate: "2025-07-31", rolloverToSameOwnerHsa: true, noOtherRolloverInPrior12Months: true },
  ] };
  const result = buildHsaDistributionInputs([current], "primary", 2025, "1960-06-01");
  expect(result.form8889).toMatchObject({ rolloverDistributions: "100", qualifiedMedicalExpenses: "20", distributionsAfterAge65: "80" });
  const late = { ...current, events: [current.events[0]!, { ...current.events[1]!, rolloverReceivedDate: "2025-08-01" }] };
  expect(buildHsaDistributionInputs([late], "primary", 2025, "1960-06-01").form8889).toMatchObject({ rolloverDistributions: "0", distributionsAfterAge65: "180" });
  const prior = { ...current, events: [current.events[0]!, { ...current.events[1]!, noOtherRolloverInPrior12Months: null }] };
  expect(Object.keys(hsaDistributionFactErrors([prior], "primary", 2025, "1960-06-01")).length).toBeGreaterThan(0);
});

it("binds actual distributions to the owner return and preserves contradictory saved records", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
  state.sectionData.adjustments = { ...emptyAdjustmentData, hsaAccounts: [{ ...completeHsaSources, hasDistributions: true, distributions: [source] }] };
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form1099SA?.[0]).toMatchObject({ accountHolder: "primary", grossDistribution: "1000.1" });
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.form8889ByOwner?.primary).toMatchObject({});
  expect(result.form8889ByOwner?.primary?.line16.toString()).toBe("200.05");
  expect(result.form8889ByOwner?.primary?.line17b.toString()).toBe("40.01");
  state.sectionData.adjustments!.hsaAccounts![0]!.hasDistributions = false;
  expect(buildTaxInputFromGuidedData(state)).toBeNull(); expect(state.sectionData.adjustments!.hsaAccounts![0]!.distributions).toHaveLength(1);
  state.sectionData.adjustments!.hsaAccounts![0]!.hasDistributions = true;
  state.sectionData.adjustments!.hsaAccounts![0]!.distributions![0] = { ...source, sourceTaxYear: "2024" };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("keeps disability and age exceptions separate and prevents copied source ownership", () => {
  const disability: HsaDistributionSource = { ...source, distributionCode: "3", grossDistribution: "1000", events: [{ ...source.events[0]!, distributionDate: "2025-06-01", grossDistribution: "1000", medicalExpenses: "800.05" }] };
  const ordinary: HsaDistributionSource = { ...source, id: "source2", grossDistribution: "1000", events: [{ ...source.events[0]!, id: "event2", grossDistribution: "1000", medicalExpenses: "0" }] };
  const actual = buildHsaDistributionInputs([disability, ordinary], "primary", 2025, "1960-06-01");
  expect(actual.form8889).toMatchObject({ disabilityExceptionTaxableDistributions: "199.95", distributionsAfterAge65: "0" });
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
  state.sectionData.adjustments = { ...emptyAdjustmentData, hsaAccounts: [{ ...completeHsaSources, hasDistributions: true, distributions: [disability, ordinary] }] };
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).form8889ByOwner?.primary?.line17b.toString()).toBe("200");
  state.segmentation.filingStatus = "mfj";
  state.sectionData.adjustments.hsaAccounts = [
    { ...completeHsaSources, bothSpousesHaveHsas: true, hasDistributions: true, distributions: [source] },
    { ...completeHsaSources, id: "spouse", accountOwner: "spouse", bothSpousesHaveHsas: true, hasDistributions: true, distributions: [{ ...source, id: "spouseSource", accountOwner: "spouse", accountReference: "spouse-actual-account", events: [{ ...source.events[0]!, id: "spouseEvent" }] }] },
  ];
  expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
  state.sectionData.adjustments.hsaAccounts[1]!.distributions![0]!.accountReference = source.accountReference;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
