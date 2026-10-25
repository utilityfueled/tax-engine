import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import {
  emptyScheduleCExpenses,
} from "../../../apps/web/src/lib/guided-interview-flow";
import {
  filterAttachedIncomeReviewDocuments,
  SectionSelfEmployment,
} from "../../../apps/web/src/components/guided-interview/section-self-employment";

function createWorkspace(): ReturnWorkspaceRecord {
  return {
    id: "workspace-self-employment",
    createdAt: "2026-03-27T05:00:00.000Z",
    updatedAt: "2026-03-27T05:00:00.000Z",
    storageMode: "local-browser",
    documents: [
      {
        id: "doc-income-1",
        name: "invoice-april.pdf",
        size: 10,
        uploadedAt: "2026-03-27T05:00:00.000Z",
        kind: "unknown",
        coverage: "reviewed",
        label: "Invoice - April retainer",
        notes: "Reviewed as an uploaded income-supporting document.",
        matchedFixtureId: null,
        seededFactIds: [],
      },
      {
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
      },
    ],
    summary: {
      totalDocuments: 1,
      officialFixtureMatches: 0,
      supportedDocuments: 1,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 0,
    },
    seededReturn: {
      status: "awaiting-interview",
      taxYearHints: [2025],
      facts: [],
      interviewQuestions: [],
      interviewQueue: [],
      nextQuestionId: null,
      reviewNotes: [],
    },
    structuredFacts: [
      {
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
        questionId: null,
        updatedAt: "2026-03-27T05:00:00.000Z",
      },
    ],
    returnSummary: {
      status: "awaiting-interview",
      targetTaxYear: 2025,
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

describe("section self-employment", () => {
  it("shows an unanswered participation choice and exact large monetary totals", () => {
    const html = renderToStaticMarkup(<SectionSelfEmployment workspace={createWorkspace()} necEntries={[]} manualGrossReceipts="9007199254740993.01" expenses={emptyScheduleCExpenses} bankStatementAnalyses={[]} incomeDocumentAnalyses={[]} onSectionChange={() => {}} />);
    expect(html).toContain("9,007,199,254,740,993");
    expect(html).toContain('<option value="" selected="">Confirm from actual records</option>');
    expect(html).not.toContain('<option value="true" selected="">');
    const knownNo = renderToStaticMarkup(<SectionSelfEmployment workspace={createWorkspace()} necEntries={[]} manualGrossReceipts="0" expenses={emptyScheduleCExpenses} bankStatementAnalyses={[]} incomeDocumentAnalyses={[]} qbiMateriallyParticipated={false} onSectionChange={() => {}} />);
    expect(knownNo).toContain('<option value="false" selected="">No</option>');
  });

  it("filters out attached income documents whose raw files are no longer cached", () => {
    const workspace = createWorkspace();

    const filtered = filterAttachedIncomeReviewDocuments(workspace.documents, new Set(["doc-income-1"]));

    expect(filtered.map((document) => document.id)).toEqual(["doc-income-1"]);
    expect(filtered.map((document) => document.label)).not.toContain("Form 1099-NEC (uploaded)");
  });

  it("shows attached 1099-NEC documents that can be copied into the section", () => {
    const html = renderToStaticMarkup(
      <SectionSelfEmployment
        workspace={createWorkspace()}
        necEntries={[]}
        manualGrossReceipts=""
        expenses={emptyScheduleCExpenses}
        bankStatementAnalyses={[]}
        incomeDocumentAnalyses={[]}
        onSectionChange={() => {}}
      />,
    );

    expect(html).not.toContain("Upload 1099-NEC PDFs");
    expect(html).toContain("Attached 1099-NEC documents");
    expect(html).toContain("Form 1099-NEC (uploaded)");
    expect(html).toContain("Northwind Studio");
    expect(html).toContain("Use attached document");
  });
});
