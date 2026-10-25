// Spec: spec/federal/guided-input.yaml
import { describe, expect, it } from "vitest";
import { extractExplicitDocumentTaxYear, parseUploadedDocumentText, parseUploadedW2Text } from "@/lib/uploaded-document-detection";
import { buildWorkspaceEngineInput } from "@tax-engine/engine";
import type { WorkspaceDocumentRecord, WorkspaceReturnSummary, WorkspaceStructuredFactRecord } from "@tax-engine/contracts";
import { workspaceTaxpayerFixture } from "../helpers/workspace-taxpayer";
import { buildGuidedSyntheticDocuments } from "@/lib/guided-interview-bridge";
import { initialGuidedFlowState, emptyW2Entry } from "@/lib/guided-interview-flow";

const document: WorkspaceDocumentRecord = { id: "w2", name: "2025 wages.pdf", taxYear: 2025, size: 1, uploadedAt: "2026-01-31T00:00:00Z", kind: "w2", coverage: "supported", label: "W-2", notes: "Synthetic", matchedFixtureId: null, seededFactIds: ["wages", "withholding"] };
const summary: WorkspaceReturnSummary = { status: "ready-to-recompute", targetTaxYear: 2025, taxYearState: "single", answeredFactCount: 2, totalFactCount: 2, readyItemCount: 1, itemCount: 1, blockers: [], items: [{ id: "wages-and-withholding", label: "Wages", status: "ready", engineTargets: [], relatedFactIds: ["wages", "withholding"], sourceDocumentIds: ["w2"], answeredFactCount: 2, factCount: 2 }] };
const fact: WorkspaceStructuredFactRecord = { id: "source-wages", factId: "wages", label: "Wages", kind: "document-detected", sourceType: "upload", value: "confirmed", confidence: "high", questionId: null, updatedAt: "2026-01-31T00:00:00Z", sourceDocumentIds: ["w2"], machineValue: { entryKind: "w2-summary", employerName: "Actual Employer", employerEin: "12-3456789", wages: "10000", federalWithheld: "1000", socialSecurityWages: "0", medicareWages: "10000" } };

describe("document source fidelity", () => {
  it("carries the selected guided year without supplying a missing one", () => {
    const state = { ...initialGuidedFlowState, taxYear: 2026, sectionData: { "income-w2": { entries: [{ ...emptyW2Entry, wages: "100" }] } } };
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
  });
  it("preserves a known zero but rejects conflicting years and duplicated source identities", () => {
    expect(buildWorkspaceEngineInput([document], summary, [fact], workspaceTaxpayerFixture())?.taxInput.w2s[0].socialSecurityWages).toBe("0");
    expect(buildWorkspaceEngineInput([{ ...document, taxYear: 2026 }], summary, [fact], workspaceTaxpayerFixture())).toBeNull();
    expect(buildWorkspaceEngineInput([{ ...document, taxYear: null }], summary, [fact], workspaceTaxpayerFixture())).toBeNull();
    expect(buildWorkspaceEngineInput([document, document], summary, [fact], workspaceTaxpayerFixture())).toBeNull();
    expect(buildWorkspaceEngineInput([document], summary, [fact, fact], workspaceTaxpayerFixture())).toBeNull();
    expect(buildWorkspaceEngineInput([document], { ...summary, taxYearState: "multiple" }, [fact], workspaceTaxpayerFixture())).toBeNull();
  });
  it("rejects a spouse-owned source on a return without spouse facts", () => {
    const spouseFact = { ...fact, machineValue: { ...fact.machineValue!, accountHolder: "spouse" as const } };
    expect(buildWorkspaceEngineInput([document], summary, [spouseFact], workspaceTaxpayerFixture())).toBeNull();
  });
});
