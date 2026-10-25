// Spec: spec/federal/workspace-calculation-context.yaml.
import { expect, it } from "vitest";
import { buildWorkspaceEngineInput, buildWorkspaceEnginePreview } from "@tax-engine/engine";
import type { WorkspaceDocumentRecord, WorkspaceReturnSummary, WorkspaceStructuredFactRecord } from "@tax-engine/contracts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { TaxYearInputSchema } from "@/models/inputs";
import { completeW2Entry, startCompleteInterview } from "../guided-interview/complete-facts";

function actualContext() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, employerName: "Actual Employer", employerEin: "12-3456789", sourceTaxYear: "2025", wages: "50000", federalWithheld: "6000", socialSecurityWages: "50000", socialSecurityWithheld: "3100", medicareWages: "50000", medicareWithheld: "725" }] };
  return { taxInput: TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), allReturnFactsConfirmed: true,
    sourceBindings: [{ sourceFactId: "source-wages", inputCollection: "w2s" as const, inputIndex: 0, sourceFactsConfirmed: true }] };
}
const actualInterestBoxes = { earlyWithdrawalPenalty: "0", taxExemptInterest: "0", usSavingsBondInterest: "0", federalWithheld: "0", foreignTaxPaid: "0", stateWithheld: "0" };
const actualDividendBoxes = { qualifiedDividends: "0", totalCapitalGainDistributions: "0", section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0", nondividendDistributions: "0", federalWithheld: "0", section199ADividends: "0", foreignTaxPaid: "0", exemptInterestDividends: "0", stateWithheld: "0" };
const documents: WorkspaceDocumentRecord[] = [{ id: "w2", name: "original.pdf", taxYear: 2025, size: 100, uploadedAt: "2026-01-31T00:00:00Z", kind: "w2", coverage: "supported", label: "Actual W2", notes: "Original evidence", matchedFixtureId: null, seededFactIds: ["wages", "withholding"] }];
const summary: WorkspaceReturnSummary = { status: "ready-to-recompute", targetTaxYear: 2025, taxYearState: "single", answeredFactCount: 2, totalFactCount: 2, readyItemCount: 1, itemCount: 1, blockers: [], items: [{ id: "wages-and-withholding", label: "Wages", status: "ready", engineTargets: [], relatedFactIds: ["wages", "withholding"], sourceDocumentIds: ["w2"], answeredFactCount: 2, factCount: 2 }] };
const facts: WorkspaceStructuredFactRecord[] = [{ id: "source-wages", factId: "wages", label: "Wages", kind: "document-detected", sourceType: "upload", value: "Original extracted source", confidence: "high", questionId: null, updatedAt: "2026-01-31T00:00:00Z", sourceDocumentIds: ["w2"], machineValue: { entryKind: "w2-summary", sourceFactsVersion: 2, employerName: "Actual Employer", employerEin: "12-3456789", wages: "50000.00", federalWithheld: "6000.00" } }];

it("keeps sparse evidence without calculating until complete actual facts are supplied", () => {
  const original = structuredClone(facts); const context = actualContext();
  expect(buildWorkspaceEnginePreview(documents, summary, facts, context.taxInput.taxpayer)).toBeNull();
  expect(buildWorkspaceEngineInput(documents, summary, facts, context.taxInput.taxpayer)).toBeNull();
  expect(buildWorkspaceEnginePreview(documents, summary, facts, context.taxInput.taxpayer, { ...context, allReturnFactsConfirmed: false })).toBeNull();
  expect(buildWorkspaceEnginePreview(documents, summary, facts, context.taxInput.taxpayer, { ...context, taxInput: { ...context.taxInput, standardDeductionFacts: undefined } })).toBeNull();
  expect(facts).toEqual(original);
  expect(facts[0]?.machineValue).not.toHaveProperty("socialSecurityWages");
});

it("calculates an independently known return from complete facts without changing original evidence", () => {
  const context = actualContext(); const original = structuredClone(facts);
  const input = buildWorkspaceEngineInput(documents, summary, facts, context.taxInput.taxpayer, context);
  expect(input?.taxInput).toEqual(context.taxInput);
  const preview = buildWorkspaceEnginePreview(documents, summary, facts, context.taxInput.taxpayer, context);
  expect(preview?.metrics).toMatchObject({ totalIncome: "50000", agi: "50000", taxableIncome: "34250", totalTax: "3875", totalPayments: "6000", refund: "2125", amountOwed: "0" });
  expect(preview?.sourceDocumentIds).toEqual(["w2"]);
  expect(facts).toEqual(original);
});

it("rejects conflicting source amounts identities years and duplicate bindings", () => {
  const context = actualContext();
  for (const patch of [{ wages: "50000.01" }, { employerEin: "98-7654321" }, { employerName: "Another Employer" }, { accountHolder: "spouse" as const }, { socialSecurityWages: "0" }]) {
    const changed = [{ ...facts[0]!, machineValue: { ...facts[0]!.machineValue!, ...patch } }];
    expect(buildWorkspaceEnginePreview(documents, summary, changed, context.taxInput.taxpayer, context)).toBeNull();
  }
  expect(buildWorkspaceEnginePreview([{ ...documents[0]!, taxYear: 2026 }], summary, facts, context.taxInput.taxpayer, context)).toBeNull();
  expect(buildWorkspaceEnginePreview(documents, summary, facts, context.taxInput.taxpayer, { ...context, sourceBindings: [] })).toBeNull();
  expect(buildWorkspaceEnginePreview(documents, summary, facts, context.taxInput.taxpayer, { ...context, sourceBindings: [...context.sourceBindings, ...context.sourceBindings] })).toBeNull();
  expect(buildWorkspaceEnginePreview(documents, summary, facts, context.taxInput.taxpayer, { ...context, sourceBindings: [{ ...context.sourceBindings[0]!, inputIndex: 1 }] })).toBeNull();
});

it("rejects unknown household and payroll facts before schema defaults", () => {
  for (const key of ["wages", "federalWithheld", "socialSecurityWages", "socialSecurityTips", "socialSecurityWithheld", "medicareWages", "medicareWithheld", "box10DependentCareBenefits", "box12CodeW"]) {
    const context = actualContext();
    delete (context.taxInput.w2s[0] as unknown as Record<string, unknown>)[key];
    expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, context), key).toBeNull();
  }
  const unknownDependents = actualContext();
  delete (unknownDependents.taxInput.taxpayer as unknown as Record<string, unknown>).dependents;
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, unknownDependents)).toBeNull();
  for (const key of ["qualifiesForCTC", "qualifiesForODC", "qualifiesForEIC"]) {
    const context = actualContext();
    context.taxInput.taxpayer.dependents = [{ firstName: "Actual", lastName: "Child", ssn: "900-70-0003", dateOfBirth: "2010-03-02", relationship: "child", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false }];
    delete (context.taxInput.taxpayer.dependents[0] as unknown as Record<string, unknown>)[key];
    expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, context), key).toBeNull();
  }
});

it("requires coherent state and HSA source facts while preserving explicit zero", () => {
  const context = actualContext();
  const noState = [{ ...facts[0]!, machineValue: { ...facts[0]!.machineValue!, stateTaxReporting: "none" as const, stateWithheld: "0", stateWages: "0" } }];
  context.taxInput.w2s[0]!.state = undefined;
  context.taxInput.w2s[0]!.stateTaxWithheld = "0.00";
  context.taxInput.w2s[0]!.stateWages = "0.00";
  expect(buildWorkspaceEngineInput(documents, summary, noState, undefined, context)).not.toBeNull();
  const inconsistent = structuredClone(context);
  inconsistent.taxInput.w2s[0]!.stateWages = "50000";
  expect(buildWorkspaceEngineInput(documents, summary, [{ ...noState[0]!, machineValue: { ...noState[0]!.machineValue, stateWages: "50000" } }], undefined, inconsistent)).toBeNull();
  for (const statePatch of [{ stateTaxReporting: "multiple" as const }, { stateTaxReporting: "single" as const, state: "" }, { stateTaxReporting: "none" as const, stateWithheld: "0.01" }]) {
    expect(buildWorkspaceEngineInput(documents, summary, [{ ...facts[0]!, machineValue: { ...facts[0]!.machineValue!, ...statePatch } }], undefined, context)).toBeNull();
  }
  const hsaContext = structuredClone(context);
  hsaContext.taxInput.w2s[0]!.box12CodeW = "100.10";
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, hsaContext)).toBeNull();
  hsaContext.taxInput.form8889 = TaxYearInputSchema.parse({ ...hsaContext.taxInput, form8889: { accountOwner: "primary", coverageByMonth: Array.from({ length: 12 }, () => "self_only"), isDependent: false, medicareMonths: [], useLastMonthRule: false, contributionsMade: "0", employerContributions: "100.10", qualifiedFundingDistribution: "0" } }).form8889;
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, hsaContext)?.taxInput.w2s[0]?.box12CodeW).toBe("100.10");
  hsaContext.taxInput.form8889!.accountOwner = "spouse";
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, hsaContext)).toBeNull();
});

it("binds complete household facts without supplying spouse identities or eligibility", () => {
  const joint = actualContext();
  joint.taxInput.taxpayer.filingStatus = "married_filing_jointly";
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, joint)).toBeNull();
  joint.taxInput.taxpayer.spouse = { firstName: "Actual", lastName: "Spouse", dateOfBirth: "1991-01-01", ssn: "900-70-0002" };
  Object.assign(joint.taxInput.standardDeductionFacts!, { spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeathDate: null });
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, joint)).not.toBeNull();
  const duplicate = structuredClone(joint);
  duplicate.taxInput.taxpayer.spouse!.ssn = duplicate.taxInput.taxpayer.primary.ssn;
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, duplicate)).toBeNull();
  const alien = structuredClone(joint);
  alien.taxInput.standardDeductionFacts!.nonresidentAlien = true;
  delete alien.taxInput.standardDeductionFacts!.residentJointElection;
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, alien)).toBeNull();
  alien.taxInput.standardDeductionFacts!.residentJointElection = false;
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, alien)).not.toBeNull();
  const separate = structuredClone(joint);
  separate.taxInput.taxpayer.filingStatus = "married_filing_separately";
  Object.assign(separate.taxInput.standardDeductionFacts!, { spouseItemizes: false, claimSpouseAdditionalDeduction: true });
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, separate)).toBeNull();
  Object.assign(separate.taxInput.standardDeductionFacts!, { spouseHasGrossIncome: false, spouseFilesReturn: false });
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, separate)).not.toBeNull();
  for (const dateOfBirth of ["2025-02-30", "2026-01-01", "1849-12-31"]) {
    const invalid = actualContext(); invalid.taxInput.taxpayer.primary.dateOfBirth = dateOfBirth;
    expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, invalid)).toBeNull();
  }
  const dependent = actualContext(); dependent.taxInput.standardDeductionFacts!.primaryCanBeClaimedAsDependent = true;
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, dependent)).toBeNull();
  dependent.taxInput.standardDeductionFacts!.dependentEarnedIncome = "0";
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, dependent)).not.toBeNull();
});

it("rejects malformed monetary evidence and conflicting bindings without changing originals", () => {
  for (const amount of ["NaN", "Infinity", "1e3", "-1", "", "50000.0001"]) {
    const source = [{ ...facts[0]!, machineValue: { ...facts[0]!.machineValue!, wages: amount } }];
    expect(buildWorkspaceEngineInput(documents, summary, source, undefined, actualContext()), amount).toBeNull();
  }
  const context = actualContext();
  for (const binding of [{ inputIndex: -1 }, { inputIndex: 0.5 }, { transactionIndex: 0 }, { sourceFactsConfirmed: false }, { inputCollection: "form1099Int" as const }, { sourceFactId: "different-source" }]) {
    expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, { ...context, sourceBindings: [{ ...context.sourceBindings[0]!, ...binding }] })).toBeNull();
  }
  expect(buildWorkspaceEngineInput([...documents, ...documents], summary, facts, undefined, context)).toBeNull();
  expect(buildWorkspaceEngineInput(documents, summary, [...facts, ...facts], undefined, context)).toBeNull();
  expect(buildWorkspaceEngineInput(documents, { ...summary, items: [...summary.items, ...summary.items] }, facts, undefined, context)).toBeNull();
  const second = { ...facts[0]!, id: "duplicate-source" };
  expect(buildWorkspaceEngineInput(documents, summary, [...facts, second], undefined, { ...context, sourceBindings: [...context.sourceBindings, { ...context.sourceBindings[0]!, sourceFactId: second.id }] })).toBeNull();
  expect(buildWorkspaceEngineInput(documents, summary, [{ ...facts[0]!, sourceDocumentIds: ["w2", "other"] }], undefined, context)).toBeNull();
  expect(buildWorkspaceEngineInput(documents, summary, [{ ...facts[0]!, factId: "taxable-interest" }], undefined, context)).toBeNull();
  expect(buildWorkspaceEngineInput(documents, summary, facts, { ...context.taxInput.taxpayer, primary: { ...context.taxInput.taxpayer.primary, firstName: "Different" } }, context)).toBeNull();
});

it("keeps missing and mixed source years blocked and does not open the 2026 preview gate", () => {
  const context = actualContext();
  for (const patch of [{ taxYear: null }, { taxYear: undefined }, { coverage: "partially-supported" as const }]) {
    expect(buildWorkspaceEngineInput([{ ...documents[0]!, ...patch }], summary, facts, undefined, context)).toBeNull();
  }
  expect(buildWorkspaceEngineInput([], summary, facts, undefined, context)).toBeNull();
  expect(buildWorkspaceEngineInput(documents, { ...summary, taxYearState: "mixed" }, facts, undefined, context)).toBeNull();
  const next = structuredClone(context);
  next.taxInput.taxpayer.taxYear = 2026;
  next.taxInput.w2s[0]!.taxYear = 2026;
  const nextDocuments = [{ ...documents[0]!, taxYear: 2026 }];
  const nextSummary = { ...summary, targetTaxYear: 2026 };
  expect(buildWorkspaceEngineInput(nextDocuments, nextSummary, facts, undefined, next)).not.toBeNull();
  expect(buildWorkspaceEnginePreview(nextDocuments, nextSummary, facts, undefined, next)).toBeNull();
});

it("requires actual retirement classification and basis facts rather than a default taxable amount", () => {
  const context = actualContext();
  context.taxInput.w2s = [];
  const retirement = { stateWithheld: "0", stateTaxWithheld: "0", stateDistribution: "0", localTaxWithheld: "0", eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "0", rothConversionAmount: "0", rothIraRolledOverAmount: "0", qualifiedCharitableDistribution: "0", retiredPublicSafetyOfficerInsurancePremiums: "0", eligibleGovernmental457bPlan: false, rothContributionOrConversionMadeBefore2021: false, qualifiedRothDistribution: false, qualifiedJointSurvivorAnnuity: false, returnedContributionByDueDate: false, excessContributionReturnedWithoutEarnings: false, separationFromServiceAfterAge55ExceptionApplies: false, qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: false, qualifiedDomesticRelationsOrderExceptionApplies: false, terminalIllnessExceptionApplies: false, disabilityPensionBeforeMinimumRetirementAge: false, militaryPensionOrSurvivorBenefit: false, payer: "Actual pension", accountHolder: "primary" as const, grossDistribution: "12000", federalWithheld: "300", distributionCode: "7", iraSepSimple: false, taxableAmountNotDetermined: true, employeeContributions: "2000" };
  context.taxInput.form1099R = [retirement as NonNullable<typeof context.taxInput.form1099R>[number]];
  const source = [{ ...facts[0]!, factId: "retirement-distribution-review" as const, machineValue: { entryKind: "1099-r-summary" as const, ...retirement } }];
  const sourceDocuments = [{ ...documents[0]!, kind: "1099-r" as const }];
  const sourceSummary = { ...summary, items: [{ ...summary.items[0]!, id: "retirement-distributions", relatedFactIds: ["retirement-distribution-review" as const] }] };
  const bound = { ...context, sourceBindings: [{ ...context.sourceBindings[0]!, inputCollection: "form1099R" as const }] };
  expect(buildWorkspaceEnginePreview(sourceDocuments, sourceSummary, source, undefined, bound)).toBeNull();
  // Actual annuity records: IRS Table1 age60 uses310 expected payments.
  // $62,000 cost /310 *10 payments = $2,000 tax-free recovery; $10,000 taxable.
  Object.assign(context.taxInput.form1099R[0]!, { simplifiedMethodCostInPlan: "62000", simplifiedMethodAnnuityStartingDate: "2025-03-01", simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60, simplifiedMethodPaymentsReceivedThisYear: 10, simplifiedMethodPriorYearRecovered: "0" });
  expect(buildWorkspaceEnginePreview(sourceDocuments, sourceSummary, source, undefined, bound)?.metrics).toMatchObject({ totalIncome: "10000", totalPayments: "300", refund: "300" });
  expect(source[0]?.machineValue).not.toHaveProperty("taxableAmount");
  for (const key of ["distributionCode", "iraSepSimple", "simplifiedMethodPriorYearRecovered", "stateWithheld", "localTaxWithheld", "qualifiedCharitableDistribution", "eligibleGovernmental457bPlan", "returnedContributionByDueDate"]) {
    const missing = structuredClone(bound); delete (missing.taxInput.form1099R![0] as unknown as Record<string, unknown>)[key];
    expect(buildWorkspaceEnginePreview(sourceDocuments, sourceSummary, source, undefined, missing), key).toBeNull();
  }
});

it("includes actual manual income in the complete return while binding selected document evidence", () => {
  const context = actualContext();
  context.taxInput.form1099Int = TaxYearInputSchema.parse({ ...context.taxInput, form1099Int: [{ ...actualInterestBoxes, payer: "Actual manual bank record", accountHolder: "primary", interestIncome: "100", federalWithheld: "0", earlyWithdrawalPenalty: "0", taxExemptInterest: "0", usSavingsBondInterest: "0" }] }).form1099Int;
  const preview = buildWorkspaceEnginePreview(documents, summary, facts, undefined, context);
  // Published2025single row34350-34400: $3,887. All actual income is included.
  expect(preview?.metrics).toMatchObject({ totalIncome: "50100", taxableIncome: "34350", totalTax: "3887", totalPayments: "6000", refund: "2113" });
  expect(preview?.sourceDocumentIds).toEqual(["w2"]);
  expect(preview?.title).toBe("Complete return recompute preview");
});

it("validates every actual income record including sources outside the selected uploads", () => {
  const context = actualContext();
  context.taxInput.w2s.push({ ...context.taxInput.w2s[0]!, employer: { name: "Second actual employer", ein: "98-7654321" } });
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, context)?.metrics.totalIncome).toBe("100000");
  for (const key of ["socialSecurityWages", "socialSecurityWithheld", "box12CodeW", "accountHolder", "stateWages", "stateTaxWithheld", "localWages", "localTaxWithheld", "box12CodeD", "box12CodeT"]) {
    const incomplete = structuredClone(context);
    delete (incomplete.taxInput.w2s[1] as unknown as Record<string, unknown>)[key];
    expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, incomplete), key).toBeNull();
  }
  const unknownBank = actualContext();
  unknownBank.taxInput.form1099Int = [{ payer: "Actual bank", interestIncome: "100" } as typeof unknownBank.taxInput.form1099Int[number]];
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, unknownBank)).toBeNull();
  expect(unknownBank.taxInput.form1099Int[0]).not.toHaveProperty("federalWithheld");
  const bank = actualContext();
  bank.taxInput.form1099Int = TaxYearInputSchema.parse({ ...bank.taxInput, form1099Int: [{ ...actualInterestBoxes, payer: "Actual bank", interestIncome: "100", federalWithheld: "0", foreignTaxPaid: "0" }] }).form1099Int;
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, bank)?.metrics.totalIncome).toBe("50100");
  delete (bank.taxInput.form1099Int[0] as unknown as Record<string, unknown>).foreignTaxPaid;
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, bank)).toBeNull();
  const dividend = actualContext();
  dividend.taxInput.form1099Div = TaxYearInputSchema.parse({ ...dividend.taxInput, form1099Div: [{ ...actualDividendBoxes, payer: "Actual fund", ordinaryDividends: "100", exemptInterestDividends: "0" }] }).form1099Div;
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, dividend)?.metrics.totalIncome).toBe("50100");
  delete (dividend.taxInput.form1099Div[0] as unknown as Record<string, unknown>).exemptInterestDividends;
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, dividend)).toBeNull();
});

it("keeps unvalidated additional source collections outside the document preview boundary", () => {
  const context = actualContext();
  context.taxInput.form1099Misc = TaxYearInputSchema.parse({ ...context.taxInput, form1099Misc: [{ payer: "Actual other payer", otherIncome: "500" }] }).form1099Misc;
  const original = structuredClone(context);
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, context)).toBeNull();
  expect(context).toEqual(original);
  context.taxInput.form1099Misc = [];
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, context)?.metrics.totalIncome).toBe("50000");
});

it("calculates actual OID sources while retaining incomplete legacy evidence as unqualified", () => {
  const context = actualContext();
  const oid = { payer: "Actual obligation issuer", sourceId: "actual-oid", taxYear: 2025,
    sourceFormRevision: "2024-01", sourceFactsConfirmed: true, recipientAmountsConfirmed: true,
    obligationType: "taxable", inflationIndexed: false, description: "Actual taxable obligation",
    originalIssueDiscount: "100", otherPeriodicInterest: "0", earlyWithdrawalPenalty: "0", federalWithheld: "0", marketDiscount: "0", acquisitionPremium: "0", treasuryOID: "0", investmentExpenses: "0", bondPremium: "0", taxExemptOID: "0", stateWithholding: [],
    oidReportedNetOfAcquisitionPremium: false, interestReportedNetOfBondPremium: false,
    marketDiscountElection: false, bondPremiumElection: false, modernBondPremiumRulesApply: true };
  context.taxInput.form1099OID = TaxYearInputSchema.parse({ ...context.taxInput, form1099OID: [oid] }).form1099OID;
  const preview = buildWorkspaceEnginePreview(documents, summary, facts, undefined, context);
  expect(preview?.metrics).toMatchObject({ totalIncome: "50100", taxableIncome: "34350", totalTax: "3887", refund: "2113" });
  const legacy = TaxYearInputSchema.parse({ ...context.taxInput, form1099OID: [{ payer: oid.payer, originalIssueDiscount: "100" }] });
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, { ...context, taxInput: legacy })).toBeNull();
});

// Spec: spec/federal/form-1099-b-withholding.yaml, document-completeness.
it('requires known Box4 for every actual brokerage preview source', () => {
  const context = actualContext();
  context.taxInput.form1099B = TaxYearInputSchema.parse({ ...context.taxInput, form1099B: [{ broker: 'Actual source broker', sourceId: 'Original statement', taxYear: 2025, accountHolder: 'primary', federalWithheld: '12.34', stateWithheld: '0', transactions: [{ description: 'Actual sold security', dateAcquired: '2024-01-02', dateSold: '2025-03-02', holdingPeriod: 'long', proceeds: '100', costBasis: '100', basisReportedToIRS: true, digitalAsset: false, washSale: false, washSaleDisallowed: '0', adjustments: '0' }] }] }).form1099B;
  const original = structuredClone(facts);
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, context)?.taxInput.form1099B[0]?.federalWithheld).toBe('12.34');
  expect(buildWorkspaceEnginePreview(documents, summary, facts, undefined, context)?.metrics.totalPayments).toBe('6012.34');
  const broker = context.taxInput.form1099B[0]; if (!broker) throw new Error('Missing source');
  delete broker.federalWithheld;
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, context)).toBeNull();
  expect(broker.federalWithheld).toBeUndefined();
  broker.federalWithheld = '0';
  expect(buildWorkspaceEngineInput(documents, summary, facts, undefined, context)?.taxInput.form1099B[0]?.federalWithheld).toBe('0');
  expect(facts).toEqual(original);
});
