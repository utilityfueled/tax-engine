import { describe, expect, it } from "vitest";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import {
  formatFixtureDocumentCount,
  formatMatchedDocumentStatus,
  formatPendingW2SuggestionValueLabel,
  formatStructuredFactSourceType,
  formatWorkspaceDocumentSummary,
  formatW2SuggestionActionLabel,
  formatW2SuggestionOrigin,
  resolveW2SuggestionSourceType,
} from "../../../apps/web/src/lib/document-fixture-copy";
import {
  buildReturnAssistantReply,
  collectNecSuggestions,
  collectW2Suggestions,
} from "../../../apps/web/src/lib/workspace-assistant";

function createWorkspace(): ReturnWorkspaceRecord {
  return {
    id: "workspace-1",
    createdAt: "2026-03-27T05:00:00.000Z",
    updatedAt: "2026-03-27T05:00:00.000Z",
    storageMode: "local-browser",
    documents: [
      {
        id: "doc-1",
        name: "irs-w2-2026.pdf",
        size: 10,
        uploadedAt: "2026-03-27T05:00:00.000Z",
        kind: "w2",
        coverage: "supported",
        label: "2026 Form W-2 (official info-copy PDF)",
        notes: "Core wage flow and withholding-driven returns are supported by the current engine.",
        matchedFixtureId: "irs-w2-2026",
        seededFactIds: ["wages", "withholding"],
      }
    ],
    summary: {
      totalDocuments: 1,
      officialFixtureMatches: 1,
      supportedDocuments: 1,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 2,
    },
    seededReturn: {
      status: "awaiting-interview",
      taxYearHints: [2026],
      facts: [],
      interviewQuestions: [],
      interviewQueue: [],
      nextQuestionId: "wages",
      reviewNotes: [],
    },
    structuredFacts: [
      {
        id: "wages:fixture-wages",
        factId: "wages",
        label: "Wages",
        kind: "fixture-derived",
        value: "Official fixture wages: Form W-2 box 1 wages $52,000 and box 2 federal withholding $5,000.",
        machineValue: {
          entryKind: "w2-summary",
          employerName: "Official fixture employer",
          employerEin: "12-3456789",
          wages: "52000",
          federalWithheld: "5000",
        },
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1"],
        updatedAt: "2026-03-27T05:00:00.000Z",
      }
    ],
    returnSummary: {
      status: "awaiting-interview",
      targetTaxYear: 2026,
      taxYearState: "single",
      answeredFactCount: 0,
      totalFactCount: 2,
      readyItemCount: 0,
      itemCount: 1,
      blockers: [],
      items: [],
    },
    enginePreview: null,
    checklist: [],
    auditTrail: [],
  };
}

describe("document fixture copy helpers", () => {
  it("labels official fixtures as sample data instead of recognized documents", () => {
    expect(formatStructuredFactSourceType("official-fixture")).toBe("IRS sample document");
    expect(formatMatchedDocumentStatus({
      id: "doc-1",
      name: "irs-w2-2026.pdf",
      notes: "Core wage flow and withholding-driven returns are supported by the current engine.",
      matchedFixtureId: "irs-w2-2026",
    })).toBe("Matched IRS sample document");
    expect(formatFixtureDocumentCount(2)).toBe("2 IRS sample documents");
    expect(formatW2SuggestionActionLabel("official-fixture")).toBe("Insert sample values");
    expect(formatW2SuggestionOrigin("2026 Form W-2 (official info-copy PDF)", "official-fixture")).toBe(
      "Sample values from 2026 Form W-2 (official info-copy PDF)."
    );
    expect(formatPendingW2SuggestionValueLabel([
      { sourceLabel: "2026 Form W-2 (official info-copy PDF)", sourceType: "official-fixture" },
    ], 1)).toBe("sample value");
    expect(formatPendingW2SuggestionValueLabel([
      { sourceLabel: "2026 Form W-2 (official info-copy PDF)" },
      { sourceLabel: "2026 Form W-2 (official info-copy PDF)" },
    ], 2)).toBe("sample values");
  });

  it("falls back to neutral pending-review copy for mixed W-2 suggestion sources", () => {
    expect(formatPendingW2SuggestionValueLabel([
      { sourceLabel: "2026 Form W-2 (official info-copy PDF)", sourceType: "official-fixture" },
      { sourceLabel: "Uploaded W-2.pdf", sourceType: "upload" },
    ], 2)).toBe("suggested values");
  });

  it("labels guided documents as guided interview entries instead of unrecognized uploads", () => {
    expect(formatMatchedDocumentStatus({
      id: "guided:w2",
      name: "Guided Interview — W-2",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
    })).toBe("Added from guided interview");
  });

  it("keeps workspace summaries product-facing when no sample documents are involved", () => {
    expect(formatWorkspaceDocumentSummary(0, 0, 0)).toBe("No documents added yet");
    expect(formatWorkspaceDocumentSummary(1, 0, 0)).toBe("1 document uploaded");
    expect(formatWorkspaceDocumentSummary(2, 1, 0)).toBe("1 IRS sample document loaded");
    expect(formatWorkspaceDocumentSummary(3, 1, 2)).toBe("1 IRS sample document loaded · 2 documents still need review");
  });

  it("backfills missing guided suggestion source types from the current workspace suggestions", () => {
    const workspace = createWorkspace();
    const suggestions = collectW2Suggestions(workspace.documents, workspace.structuredFacts);

    expect(
      resolveW2SuggestionSourceType(
        "2026 Form W-2 (official info-copy PDF)",
        undefined,
        suggestions
      )
    ).toBe("official-fixture");
  });

  it("recognizes official sample fixture labels even when no workspace suggestions are available", () => {
    expect(
      resolveW2SuggestionSourceType(
        "2026 Form W-2 (official info-copy PDF)",
        undefined,
        []
      )
    ).toBe("official-fixture");
  });
});

describe("workspace assistant fixture messaging", () => {
  it("preserves exact source cents beyond the safe-integer range in review copy", () => {
    const workspace = createWorkspace();
    workspace.structuredFacts[0]!.machineValue = { entryKind: "w2-summary", employerName: "Actual Employer", employerEin: "12-3456789", wages: "9007199254740993.01", federalWithheld: "0", socialSecurityWages: "0", socialSecurityWithheld: "0" };
    const reply = buildReturnAssistantReply(workspace, { mode: "guided", currentSectionId: "income-w2" }, "Review my W-2");
    expect(reply.bullets[0]).toContain("$9,007,199,254,740,993.01");
    expect(reply.bullets[0]).toContain("Box 2 $0");
    expect(collectW2Suggestions(workspace.documents, workspace.structuredFacts)[0]?.summary.socialSecurityWithheld).toBe("0");
  });
  it("treats official fixture W-2 suggestions as sample values", () => {
    const workspace = createWorkspace();
    const suggestions = collectW2Suggestions(workspace.documents, workspace.structuredFacts);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.sourceType).toBe("official-fixture");

    const reply = buildReturnAssistantReply(workspace, {
      mode: "guided",
      currentSectionId: "income-w2",
      currentSectionLabel: "W-2 Wages",
    }, "Can you help me fill my W-2?");

    expect(reply.title).toBe("Sample W-2 values are ready");
    expect(reply.summary).toContain("sample W-2 values");
    expect(reply.bullets.at(-1)).toBe("IRS sample values stay marked until you confirm them one field at a time.");
  });

  it("drops implausible extra W-2 box suggestions instead of surfacing stale parser fallbacks", () => {
    const workspace = createWorkspace();
    workspace.documents = [{
      ...workspace.documents[0]!,
      matchedFixtureId: null,
      label: "Uploaded W-2",
      notes: "Parsed W-2 wage and withholding boxes from an uploaded W-2 PDF.",
    }];
    workspace.structuredFacts = [{
      ...workspace.structuredFacts[0]!,
      sourceType: "upload",
      machineValue: {
        entryKind: "w2-summary",
        employerName: "Uploaded employer",
        employerEin: "12-3456789",
        wages: "107175.28",
        federalWithheld: "15251.46",
        socialSecurityWages: "107175.28",
        socialSecurityWithheld: "107175.28",
        medicareWages: "107175.28",
        medicareWithheld: "107175.28",
        stateWages: "5111787107175.28",
        stateWithheld: "107175.28",
      },
    }];

    const suggestions = collectW2Suggestions(workspace.documents, workspace.structuredFacts);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.summary.socialSecurityWages).toBe("107175.28");
    expect(suggestions[0]?.summary.socialSecurityWithheld).toBeUndefined();
    expect(suggestions[0]?.summary.medicareWages).toBe("107175.28");
    expect(suggestions[0]?.summary.medicareWithheld).toBeUndefined();
    expect(suggestions[0]?.summary.stateWages).toBeUndefined();
    expect(suggestions[0]?.summary.stateWithheld).toBeUndefined();
  });

  it("collects attached 1099-NEC suggestions from existing workspace documents", () => {
    const workspace = createWorkspace();
    workspace.documents = [{
      id: "doc-nec-1",
      name: "1099-nec.pdf",
      size: 10,
      uploadedAt: "2026-03-27T05:00:00.000Z",
      kind: "1099-nec",
      coverage: "supported",
      label: "Form 1099-NEC (uploaded)",
      notes: "Parsed nonemployee compensation from an uploaded 1099-NEC PDF.",
      matchedFixtureId: null,
      seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
    }];
    workspace.structuredFacts = [{
      id: "nonemployee-compensation:upload-nec",
      factId: "nonemployee-compensation",
      label: "1099-NEC income classification",
      kind: "document-detected",
      value: "Parsed uploaded 1099-NEC: nonemployee compensation $18,000 with no withholding.",
      machineValue: {
        entryKind: "1099-nec-summary",
        payer: "Northwind Studio",
        nonemployeeCompensation: "18000",
        federalWithheld: "0",
      },
      sourceType: "upload",
      confidence: "high",
      sourceDocumentIds: ["doc-nec-1"],
      updatedAt: "2026-03-27T05:00:00.000Z",
    }];

    const suggestions = collectNecSuggestions(workspace.documents, workspace.structuredFacts);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      documentId: "doc-nec-1",
      documentLabel: "Form 1099-NEC (uploaded)",
      sourceType: "upload",
      summary: {
        payer: "Northwind Studio",
        nonemployeeCompensation: "18000",
        federalWithheld: "0",
      },
    });
  });
});
