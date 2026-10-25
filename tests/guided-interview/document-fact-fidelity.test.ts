// Spec: spec/federal/guided-input.yaml
import { describe, expect, it } from "vitest";
import { extractExplicitDocumentTaxYear, parseUploadedDocumentText, parseUploadedW2Text } from "@/lib/uploaded-document-detection";
import { buildWorkspaceEngineInput } from "@tax-engine/engine";
import type { WorkspaceDocumentRecord, WorkspaceReturnSummary, WorkspaceStructuredFactRecord, WorkspaceStructuredFactMachineValue } from "@tax-engine/contracts";
import { workspaceScenarioContext } from "../helpers/workspace-calculation-context";
import { workspaceTaxpayerFixture } from "../helpers/workspace-taxpayer";
import { buildGuidedSyntheticDocuments } from "@/lib/guided-interview-bridge";
import { initialFlowState, emptyW2Entry } from "@/lib/guided-interview-flow";

function completeInput(...args: Parameters<typeof buildWorkspaceEngineInput>) {
  const taxpayer = args[3];
  return buildWorkspaceEngineInput(...args.slice(0, 4) as [typeof args[0], typeof args[1], typeof args[2], typeof args[3]], taxpayer ? workspaceScenarioContext(args[2], taxpayer) : undefined);
}

const document: WorkspaceDocumentRecord = { id: "w2", name: "2025 wages.pdf", taxYear: 2025, size: 1, uploadedAt: "2026-01-31T00:00:00Z", kind: "w2", coverage: "supported", label: "W-2", notes: "Synthetic", matchedFixtureId: null, seededFactIds: ["wages", "withholding"] };
const summary: WorkspaceReturnSummary = { status: "ready-to-recompute", targetTaxYear: 2025, taxYearState: "single", answeredFactCount: 2, totalFactCount: 2, readyItemCount: 1, itemCount: 1, blockers: [], items: [{ id: "wages-and-withholding", label: "Wages", status: "ready", engineTargets: [], relatedFactIds: ["wages", "withholding"], sourceDocumentIds: ["w2"], answeredFactCount: 2, factCount: 2 }] };
const fact: WorkspaceStructuredFactRecord = { id: "source-wages", factId: "wages", label: "Wages", kind: "document-detected", sourceType: "upload", value: "confirmed", confidence: "high", questionId: null, updatedAt: "2026-01-31T00:00:00Z", sourceDocumentIds: ["w2"], machineValue: { entryKind: "w2-summary", stateTaxReporting: "none", socialSecurityTips: "0", box10DependentCareBenefits: "0", employerName: "Actual Employer", employerEin: "12-3456789", wages: "10000", federalWithheld: "1000", socialSecurityWages: "0", socialSecurityWithheld: "0", medicareWages: "10000", medicareWithheld: "145" } };

describe("document source fidelity", () => {
  it("keeps sparse interest boxes unknown and never uses the filename as payer identity", () => {
    const parsed = parseUploadedDocumentText("2025 Form 1099-INT\n1 Interest Income $ 0.00\n2 Early withdrawal penalty\n4 Federal Income Tax Withheld $ 12.34", "Invented Bank.pdf");
    const entry = parsed?.detectedFacts[0]?.machineValue;
    expect(entry).toMatchObject({ entryKind: "1099-int-summary", interestIncome: "0.00", federalWithheld: "12.34", payer: "" });
    expect(entry).not.toHaveProperty("earlyWithdrawalPenalty");
    expect(entry).not.toHaveProperty("taxExemptInterest");
    expect(entry).not.toHaveProperty("usSavingsBondInterest");
    expect(parsed?.coverage).toBe("partially-supported");
  });
  it("keeps composite box values in their own source section and preserves explicit zero", () => {
    const parsed = parseUploadedDocumentText("FORM 1099 COMPOSITE\nPayer: Actual Brokerage\n2025 Form 1099-DIV\n1a Total Ordinary Dividends $ 10.00\n1b Qualified Dividends\n4 Federal Income Tax Withheld $ 1.00\n2025 Form 1099-INT\n1 Interest Income $ 0.00\n2 Early withdrawal penalty $ 0.00\n3 Interest on U.S. Savings Bonds and Treasury Obligations $ 0.00\n4 Federal Income Tax Withheld $ 2.00\n8 Tax-Exempt Interest $ 0.00", "schwab.pdf");
    const interest = parsed?.detectedFacts.find((item) => item.machineValue?.entryKind === "1099-int-summary")?.machineValue;
    const dividend = parsed?.detectedFacts.find((item) => item.machineValue?.entryKind === "1099-div-summary")?.machineValue;
    expect(interest).toMatchObject({ payer: "Actual Brokerage", federalWithheld: "2.00", earlyWithdrawalPenalty: "0.00", taxExemptInterest: "0.00", usSavingsBondInterest: "0.00" });
    expect(dividend).toMatchObject({ payer: "Actual Brokerage", ordinaryDividends: "10.00", federalWithheld: "1.00" });
    expect(dividend).not.toHaveProperty("qualifiedDividends");
    expect(dividend).not.toHaveProperty("capitalGainDistributions");
  });
  it("does not invent digital asset broker basis status adjustments or holding period", () => {
    const parsed = parseUploadedDocumentText("2025 Form 1099-DA\nETH / X9J9K872S\n04/02/25 0.2 0.20 03/01/25 0.35 -0.15", "coinbase.pdf");
    const entry = parsed?.detectedFacts[0]?.machineValue;
    expect(entry).toMatchObject({ description: "ETH", proceeds: "0.20", costBasis: "0.35", dateAcquired: "2025-03-01", dateSold: "2025-04-02", digitalAsset: true });
    for (const field of ["basisReportedToIRS", "holdingPeriod", "adjustments", "washSale", "washSaleDisallowed"]) expect(entry).not.toHaveProperty(field);
    expect(parsed?.coverage).toBe("partially-supported");
  });
  it("blocks incomplete source boxes before the engine can apply zero defaults", () => {
    const base = { entryKind: "1099-int-summary" as const, payer: "Actual Bank", interestIncome: "100", earlyWithdrawalPenalty: "0", federalWithheld: "0", taxExemptInterest: "0", usSavingsBondInterest: "0" };
    const doc = { ...document, kind: "1099-int" as const };
    const interestSummary = { ...summary, items: [{ ...summary.items[0], id: "interest-income", relatedFactIds: ["taxable-interest" as const] }] };
    const interestFact = { ...fact, factId: "taxable-interest" as const, machineValue: base };
    expect(completeInput([doc], interestSummary, [interestFact], workspaceTaxpayerFixture())?.taxInput.form1099Int[0].federalWithheld).toBe("0");
    for (const field of ["earlyWithdrawalPenalty", "federalWithheld", "taxExemptInterest", "usSavingsBondInterest", "payer"]) {
      const incomplete: Record<string, unknown> = { ...base };
      delete incomplete[field];
      expect(completeInput([doc], interestSummary, [{ ...interestFact, machineValue: incomplete as unknown as WorkspaceStructuredFactMachineValue }], workspaceTaxpayerFixture())).toBeNull();
    }
    expect(completeInput([doc], interestSummary, [{ ...interestFact, id: "taxable-interest:parsed-1099-int-summary" }], workspaceTaxpayerFixture())).toBeNull();
    expect(completeInput([doc], interestSummary, [{ ...interestFact, id: "taxable-interest:parsed-1099-int-summary", machineValue: { ...base, sourceFactsVersion: 2 } }], workspaceTaxpayerFixture())).not.toBeNull();
    expect(completeInput([{ ...doc, coverage: "partially-supported" }], interestSummary, [{ ...interestFact, id: "taxable-interest:parsed-1099-int-summary", machineValue: { ...base, sourceFactsVersion: 2 } }], workspaceTaxpayerFixture())).toBeNull();
  });
  it("requires actual dividend boxes and transaction classification even after a ready summary is restored", () => {
    const dividend = { entryKind: "1099-div-summary" as const, payer: "Actual Broker", ordinaryDividends: "100", qualifiedDividends: "0", capitalGainDistributions: "0", federalWithheld: "0", section199ADividends: "0", foreignTaxPaid: "0" };
    const transaction = { entryKind: "1099-b-transaction" as const, description: "Actual Security", dateAcquired: "2024-01-01", dateSold: "2025-04-01", proceeds: "100", costBasis: "100", adjustments: "0", holdingPeriod: "long" as const, basisReportedToIRS: false, washSale: false, washSaleDisallowed: "0" };
    for (const [machineValue, kind, itemId, factId, required] of [
      [dividend, "1099-div", "dividend-income", "ordinary-dividends", ["payer", "ordinaryDividends", "qualifiedDividends", "capitalGainDistributions", "federalWithheld", "section199ADividends", "foreignTaxPaid"]],
      [transaction, "1099-b", "capital-gains", "broker-proceeds", ["description", "dateAcquired", "adjustments", "holdingPeriod", "basisReportedToIRS", "washSale", "washSaleDisallowed"]],
    ] as const) {
      const doc = { ...document, kind };
      const restoredSummary = { ...summary, items: [{ ...summary.items[0], id: itemId, relatedFactIds: [factId] }] };
      const source = { ...fact, factId, machineValue };
      expect(completeInput([doc], restoredSummary, [source], workspaceTaxpayerFixture())).not.toBeNull();
      for (const field of required) {
        const incomplete: Record<string, unknown> = { ...machineValue }; delete incomplete[field];
        expect(completeInput([doc], restoredSummary, [{ ...source, machineValue: incomplete as unknown as WorkspaceStructuredFactMachineValue }], workspaceTaxpayerFixture())).toBeNull();
      }
    }
  });
  it("leaves conflicting repeated boxes unknown instead of selecting an arbitrary copy", () => {
    const parsed = parseUploadedDocumentText("2025 Form 1099-INT\nPayer: Actual Bank\n1 Interest Income $ 10.00\n4 Federal Income Tax Withheld $ 1.00\n4 Federal Income Tax Withheld $ 2.00");
    expect(parsed?.detectedFacts[0]?.machineValue).not.toHaveProperty("federalWithheld");
    expect(parsed?.coverage).toBe("partially-supported");
  });
  it("does not collapse multiple source identities or sections into a supported single statement", () => {
    const boxes = "\n1 Interest Income $ 10.00\n2 Early withdrawal penalty $ 0.00\n3 Interest on U.S. Savings Bonds and Treasury Obligations $ 0.00\n4 Federal Income Tax Withheld $ 0.00\n8 Tax-Exempt Interest $ 0.00";
    const parsed = parseUploadedDocumentText(`FORM 1099 COMPOSITE\nPayer: First Bank\n2025 Form 1099-INT${boxes}\nPayer: Second Bank\n2025 Form 1099-INT${boxes}`);
    expect(parsed?.detectedFacts[0]?.machineValue).toHaveProperty("payer", "");
    expect(parsed?.coverage).toBe("partially-supported");
  });
  it("keeps digital asset descriptions attached to their own transaction rows", () => {
    const parsed = parseUploadedDocumentText("2025 Form 1099-DA\nETH / X9J9K872S\n04/02/25 0.2 0.20 03/01/25 0.35 -0.15\nBTC / B9J9K872S\n04/03/25 0.2 0.40 03/01/25 0.30 0.10");
    expect(parsed?.detectedFacts.filter((entry) => entry.machineValue?.entryKind === "1099-b-transaction").map((entry) => entry.machineValue)).toMatchObject([{ description: "ETH", proceeds: "0.20" }, { description: "BTC", proceeds: "0.40" }]);
  });
  it("carries the selected guided year without supplying a missing one", () => {
    const state = { ...initialFlowState, taxYear: 2026, sectionData: { "income-w2": { entries: [{ ...emptyW2Entry, wages: "100" }] } } };
    expect(buildGuidedSyntheticDocuments(state)[0].taxYear).toBe(2026);
    expect(buildGuidedSyntheticDocuments({ ...state, taxYear: null })[0].taxYear).toBeNull();
  });
  it("does not infer document year from a filename or transaction date", () => {
    expect(extractExplicitDocumentTaxYear("Tax year 2026\nDistribution date 2025-12-31")).toBe(2026);
    expect(extractExplicitDocumentTaxYear("For calendar year 2025")).toBe(2025);
    expect(extractExplicitDocumentTaxYear("2025 Form 1099-INT")).toBe(2025);
    expect(extractExplicitDocumentTaxYear("Tax year 2025\nTax year 2026")).toBeNull();
    expect(extractExplicitDocumentTaxYear("Sold 2025-12-31")).toBeNull();
    const parsed = parseUploadedDocumentText("Form 1099-INT\n1 Interest Income $ 10.00", "2025 interest.pdf");
    expect(parsed?.taxYear ?? null).toBeNull();
  });
  it("keeps an unreported W-2 payroll box unknown despite matching payroll tax", () => {
    const parsed = parseUploadedW2Text("Form W-2\n1 Wages, tips, other comp.\n10000.00\n2 Federal income tax withheld\n1000.00\n4 Social security tax withheld\n620.00\n5 Medicare wages and tips\n10000.00\n6 Medicare tax withheld\n145.00", "2025 wages.pdf");
    const entry = parsed?.detectedFacts.find((item) => item.machineValue?.entryKind === "w2-summary")?.machineValue;
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("socialSecurityWages");
    expect(entry).toHaveProperty("employerName", "");
    expect(parsed?.coverage).toBe("partially-supported");
    expect(completeInput([document], summary, [{ ...fact, machineValue: { ...fact.machineValue!, employerName: "" } as WorkspaceStructuredFactMachineValue }], workspaceTaxpayerFixture())).toBeNull();
    expect(completeInput([document], summary, [{ ...fact, machineValue: { ...fact.machineValue!, socialSecurityWithheld: undefined } as WorkspaceStructuredFactMachineValue }], workspaceTaxpayerFixture())).toBeNull();
  });
  it("preserves a known zero but rejects conflicting years and duplicated source identities", () => {
    expect(completeInput([document], summary, [fact], workspaceTaxpayerFixture())?.taxInput.w2s[0].socialSecurityWages).toBe("0");
    expect(completeInput([{ ...document, taxYear: 2026 }], summary, [fact], workspaceTaxpayerFixture())).toBeNull();
    expect(completeInput([{ ...document, taxYear: null }], summary, [fact], workspaceTaxpayerFixture())).toBeNull();
    expect(completeInput([document, document], summary, [fact], workspaceTaxpayerFixture())).toBeNull();
    expect(completeInput([document], summary, [fact, fact], workspaceTaxpayerFixture())).toBeNull();
    expect(completeInput([document], { ...summary, taxYearState: "multiple" }, [fact], workspaceTaxpayerFixture())).toBeNull();
  });
  it("rejects a spouse-owned source on a return without spouse facts", () => {
    const spouseFact = { ...fact, machineValue: { ...fact.machineValue!, accountHolder: "spouse" as const } };
    expect(completeInput([document], summary, [spouseFact], workspaceTaxpayerFixture())).toBeNull();
  });
  it("requires source state and joint-return ownership before schema defaults can hide them", () => {
    const source = { ...fact.machineValue!, stateTaxReporting: "single" as const, state: "NY", stateWages: "10000", stateWithheld: "0.01" } as WorkspaceStructuredFactMachineValue;
    expect(completeInput([document], summary, [{ ...fact, machineValue: source }], workspaceTaxpayerFixture())?.taxInput.w2s[0]).toMatchObject({ state: "NY", stateTaxWithheld: "0.01" });
    // A separately supplied actual context can complete missing extracted facts,
    // but omission from that context cannot be replaced by schema zero defaults.
    const sourceFact = { ...fact, machineValue: source };
    for (const field of ["state", "stateWages", "stateTaxWithheld"]) {
      const context = workspaceScenarioContext([sourceFact], workspaceTaxpayerFixture());
      delete (context.taxInput.w2s[0] as unknown as Record<string, unknown>)[field];
      expect(buildWorkspaceEngineInput([document], summary, [sourceFact], undefined, context)).toBeNull();
    }
    const sparse = { ...fact, machineValue: { ...fact.machineValue!, stateTaxReporting: undefined } as WorkspaceStructuredFactMachineValue };
    const actualPrimary = workspaceScenarioContext([sparse], workspaceTaxpayerFixture());
    expect(buildWorkspaceEngineInput([document], summary, [sparse], undefined, actualPrimary)).not.toBeNull();
    expect(sparse.machineValue?.stateTaxReporting).toBeUndefined();
    const primary = workspaceTaxpayerFixture(); const joint = { ...primary, filingStatus: "married_filing_jointly" as const, spouse: { ...primary.primary, ssn: "900-70-0002", firstName: "Alex" } };
    const unknownOwner = workspaceScenarioContext([sourceFact], joint);
    delete unknownOwner.taxInput.w2s[0]!.accountHolder;
    expect(buildWorkspaceEngineInput([document], summary, [sourceFact], joint, unknownOwner)).toBeNull();
    expect(completeInput([document], summary, [{ ...fact, machineValue: { ...source, accountHolder: "spouse" } as WorkspaceStructuredFactMachineValue }], joint)?.taxInput.w2s[0].accountHolder).toBe("spouse");
    expect(completeInput([document], summary, [{ ...fact, machineValue: { ...source, stateTaxReporting: "none" } as WorkspaceStructuredFactMachineValue }], primary)).toBeNull();
  });
});
