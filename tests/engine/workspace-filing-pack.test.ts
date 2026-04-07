import { describe, expect, it } from "vitest";
import type {
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord,
  WorkspaceEnginePreview,
  WorkspaceReturnSummary
} from "@tax-engine/contracts";
import { buildWorkspaceFilingPack } from "@tax-engine/engine";

function createDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1",
    name: "irs-w2-2025.pdf",
    size: 10,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "w2",
    coverage: "supported",
    label: "2025 Form W-2",
    notes: "Fixture upload",
    matchedFixtureId: "irs-w2-2025",
    seededFactIds: ["wages", "withholding"],
    ...overrides
  };
}

function createSeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2025],
    facts: [
      {
        id: "wages",
        label: "Wages",
        status: "answered",
        answeredAt: "2026-03-12T00:00:00.000Z",
        answerText: "Final W-2 confirmed.",
        sourceDocumentIds: ["doc-1"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "answered",
        answeredAt: "2026-03-12T00:00:00.000Z",
        answerText: "Federal withholding confirmed.",
        sourceDocumentIds: ["doc-1"]
      }
    ],
    interviewQuestions: [
      {
        id: "wages",
        factId: "wages",
        prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
        status: "answered",
        answeredAt: "2026-03-12T00:00:00.000Z",
        answerText: "Final W-2 confirmed.",
        sourceDocumentIds: ["doc-1"]
      },
      {
        id: "withholding",
        factId: "withholding",
        prompt: "Confirm federal and state withholding amounts from each wage statement.",
        status: "answered",
        answeredAt: "2026-03-12T00:00:00.000Z",
        answerText: "Federal withholding confirmed.",
        sourceDocumentIds: ["doc-1"]
      }
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides
  };
}

function createReturnSummary(
  overrides: Partial<WorkspaceReturnSummary>
): WorkspaceReturnSummary {
  return {
    status: "ready-to-recompute",
    targetTaxYear: 2025,
    taxYearState: "single",
    answeredFactCount: 2,
    totalFactCount: 2,
    readyItemCount: 1,
    itemCount: 1,
    blockers: [],
    items: [
      {
        id: "wages-and-withholding",
        label: "Wages and withholding",
        status: "ready",
        engineTargets: ["Form 1040 Lines 1 and 25a"],
        relatedFactIds: ["wages", "withholding"],
        sourceDocumentIds: ["doc-1"],
        answeredFactCount: 2,
        factCount: 2
      }
    ],
    ...overrides
  };
}

function createEnginePreview(
  overrides: Partial<WorkspaceEnginePreview>
): WorkspaceEnginePreview {
  return {
    mode: "engine-recompute",
    title: "Deterministic engine recompute preview",
    taxYear: 2025,
    filingStatus: "single",
    sourceDocumentIds: ["doc-1"],
    sourceFixtureIds: ["irs-w2-2025"],
    assumptions: ["Preview uses the confirmed W-2 fixture facts."],
    metrics: {
      totalIncome: "52000",
      agi: "52000",
      taxableIncome: "37400",
      totalTax: "4202",
      totalPayments: "5000",
      refund: "798",
      amountOwed: "0"
    },
    highlightedLines: [
      {
        id: "1040:1",
        form: "1040",
        line: "1",
        label: "Wages",
        value: "52000",
        formula: "W-2 Box 1 total",
        sourceFactIds: ["wages:interview-answer"]
      }
    ],
    ...overrides
  };
}

function createWorkspace(overrides: Partial<ReturnWorkspaceRecord> = {}): ReturnWorkspaceRecord {
  return {
    id: "workspace-ready",
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    storageMode: "local-browser",
    documents: [createDocument({})],
    summary: {
      totalDocuments: 1,
      officialFixtureMatches: 1,
      supportedDocuments: 1,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 0
    },
    seededReturn: createSeededReturn({}),
    structuredFacts: [
      {
        id: "wages:interview-answer",
        factId: "wages",
        label: "Wages",
        kind: "interview-answer",
        value: "Final W-2 confirmed.",
        sourceType: "user-answer",
        confidence: "high",
        sourceDocumentIds: ["doc-1"],
        questionId: "wages",
        updatedAt: "2026-03-12T00:00:00.000Z"
      }
    ],
    returnSummary: createReturnSummary({}),
    enginePreview: createEnginePreview({}),
    checklist: [
      { id: "documents", label: "Upload tax documents", status: "ready" },
      { id: "coverage", label: "Check document support", status: "ready" },
      { id: "interview", label: "Answer missing questions", status: "ready" },
      { id: "review", label: "Review summary and completed return", status: "ready" }
    ],
    auditTrail: [
      {
        id: "interview-answered:wages",
        occurredAt: "2026-03-12T00:00:00.000Z",
        kind: "interview-answered",
        message: "Saved answer for Wages.",
        documentIds: ["doc-1"],
        questionId: "wages",
        answerText: "Final W-2 confirmed."
      }
    ],
    ...overrides
  };
}

describe("workspace filing pack", () => {
  it("builds a deterministic local filing pack for ready-to-recompute workspaces", () => {
    const filingPack = buildWorkspaceFilingPack(createWorkspace({}));

    expect(filingPack.manifest).toEqual({
      schemaVersion: 1,
      workspaceId: "workspace-ready",
      generatedAt: "2026-03-12T00:00:00.000Z",
      storageMode: "local-browser",
      targetTaxYear: 2025,
      returnStatus: "ready-to-recompute",
      downloadFileName: "workspace-ready-2025-tax-return.json",
      localOnly: true,
      fileCount: 6,
      files: [
        { path: "00-manifest.json", mediaType: "application/json" },
        { path: "01-return-summary.json", mediaType: "application/json" },
        { path: "02-supporting-forms.json", mediaType: "application/json" },
        { path: "03-checklist.json", mediaType: "application/json" },
        { path: "04-filing-instructions.txt", mediaType: "text/plain" },
        { path: "07-audit-trail.json", mediaType: "application/json" }
      ]
    });
    expect(filingPack.files.map((file) => file.path)).toEqual([
      "00-manifest.json",
      "01-return-summary.json",
      "02-supporting-forms.json",
      "03-checklist.json",
      "04-filing-instructions.txt",
      "07-audit-trail.json"
    ]);
    expect(filingPack.files[4]?.contents).toContain("Deterministic recompute is ready for tax year 2025.");
    expect(filingPack.files[4]?.contents).toContain("Current engine preview refund: $798.");
    expect(filingPack.files[5]?.contents).toContain("\"auditTrail\"");
  });

  it("includes missing-items and unsupported-situation notes for incomplete workspaces", () => {
    const filingPack = buildWorkspaceFilingPack(createWorkspace({
      id: "workspace-review",
      documents: [
        createDocument({
          id: "doc-review",
          name: "broker-export.pdf",
          coverage: "unsupported",
          label: "Unclassified upload",
          matchedFixtureId: null,
          seededFactIds: []
        })
      ],
      summary: {
        totalDocuments: 1,
        officialFixtureMatches: 0,
        supportedDocuments: 0,
        pendingReviewDocuments: 1,
        interviewQuestionsRemaining: 1
      },
      seededReturn: createSeededReturn({
        status: "needs-review",
        facts: [],
        interviewQuestions: [
          {
            id: "withholding",
            factId: "withholding",
            prompt: "Confirm federal and state withholding amounts from each wage statement.",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-review"]
          }
        ],
        interviewQueue: ["Confirm federal and state withholding amounts from each wage statement."],
        nextQuestionId: "withholding",
        reviewNotes: ["Unknown uploads stay metadata-only until manual mapping is added."]
      }),
      structuredFacts: [],
      returnSummary: createReturnSummary({
        status: "needs-review",
        targetTaxYear: null,
        taxYearState: "missing",
        answeredFactCount: 0,
        totalFactCount: 0,
        readyItemCount: 0,
        itemCount: 0,
        blockers: [
          {
            id: "needs-review:unmapped-documents",
            message: "1 uploaded document still needs manual coverage review before deterministic recompute can run.",
            relatedFactIds: [],
            sourceDocumentIds: ["doc-review"]
          }
        ],
        items: []
      }),
      enginePreview: null,
      checklist: [
        { id: "documents", label: "Upload tax documents", status: "ready" },
        { id: "coverage", label: "Check document support", status: "blocked" },
        { id: "interview", label: "Answer missing questions", status: "blocked" },
        { id: "review", label: "Review summary and completed return", status: "blocked" }
      ],
      auditTrail: []
    }));

    expect(filingPack.manifest.downloadFileName).toBe("workspace-review-draft-tax-return.json");
    expect(filingPack.manifest.fileCount).toBe(8);
    expect(filingPack.manifest.files).toEqual([
      { path: "00-manifest.json", mediaType: "application/json" },
      { path: "01-return-summary.json", mediaType: "application/json" },
      { path: "02-supporting-forms.json", mediaType: "application/json" },
      { path: "03-checklist.json", mediaType: "application/json" },
      { path: "04-filing-instructions.txt", mediaType: "text/plain" },
      { path: "05-missing-items-memo.txt", mediaType: "text/plain" },
      { path: "06-unsupported-situations.txt", mediaType: "text/plain" },
      { path: "07-audit-trail.json", mediaType: "application/json" }
    ]);
    expect(filingPack.files.map((file) => file.path)).toEqual([
      "00-manifest.json",
      "01-return-summary.json",
      "02-supporting-forms.json",
      "03-checklist.json",
      "04-filing-instructions.txt",
      "05-missing-items-memo.txt",
      "06-unsupported-situations.txt",
      "07-audit-trail.json"
    ]);
    expect(filingPack.files[5]?.contents).toContain("Confirm federal and state withholding amounts from each wage statement.");
    expect(filingPack.files[5]?.contents).toContain("[BLOCKED] Check document support");
    expect(filingPack.files[6]?.contents).toContain("Unclassified upload (unsupported) :: broker-export.pdf");
    expect(filingPack.files[6]?.contents).toContain("manual coverage review before deterministic recompute can run");
    expect(filingPack.files[6]?.contents).toContain("Recommended next actions:");
    expect(filingPack.files[6]?.contents).toContain("[NOW] Answer remaining questions:");
    expect(filingPack.files[6]?.contents).toContain("[NEXT] Download your draft return packet:");
    expect(filingPack.files[6]?.contents).toContain("[LATER] Consider a professional review:");
  });

  it("includes route trace for unsupported tax years in the unsupported-situations notes", () => {
    const filingPack = buildWorkspaceFilingPack(createWorkspace({
      id: "workspace-unsupported-tax-year",
      documents: [
        createDocument({
          id: "doc-2026",
          name: "irs-w2-2026.pdf",
          label: "2026 Form W-2 (official info-copy PDF)",
          matchedFixtureId: "irs-w2-2026"
        })
      ],
      summary: {
        totalDocuments: 1,
        officialFixtureMatches: 1,
        supportedDocuments: 1,
        pendingReviewDocuments: 0,
        interviewQuestionsRemaining: 0
      },
      seededReturn: createSeededReturn({
        taxYearHints: [2026],
        facts: [
          {
            id: "wages",
            label: "Wages",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Final W-2 confirmed.",
            sourceDocumentIds: ["doc-2026"]
          },
          {
            id: "withholding",
            label: "Federal withholding",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Federal withholding confirmed.",
            sourceDocumentIds: ["doc-2026"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null
      }),
      returnSummary: createReturnSummary({
        status: "needs-review",
        targetTaxYear: 2026,
        blockers: [
          {
            id: "unsupported-tax-year",
            message: "Tax year 2026 is not available for deterministic recompute yet. Latest supported engine year: 2025.",
            relatedFactIds: [],
            sourceDocumentIds: []
          }
        ],
        items: [
          {
            id: "wages-and-withholding",
            label: "Wages and withholding",
            status: "ready",
            engineTargets: ["Form 1040 Lines 1 and 25a"],
            relatedFactIds: ["wages", "withholding"],
            sourceDocumentIds: ["doc-2026"],
            answeredFactCount: 2,
            factCount: 2
          }
        ]
      }),
      enginePreview: null,
      checklist: [
        { id: "documents", label: "Upload tax documents", status: "ready" },
        { id: "coverage", label: "Check document support", status: "ready" },
        { id: "interview", label: "Answer missing questions", status: "ready" },
        { id: "review", label: "Review summary and completed return", status: "blocked" }
      ]
    }));

    const unsupportedNotes = filingPack.files.find((file) => file.path === "06-unsupported-situations.txt");

    expect(unsupportedNotes?.contents).toContain("[NOW] Download your draft return packet:");
    expect(unsupportedNotes?.contents).toContain("reasons: Tax year 2026 is not available for deterministic recompute yet. Latest supported engine year: 2025.");
    expect(unsupportedNotes?.contents).toContain("related facts: Wages, Federal withholding");
    expect(unsupportedNotes?.contents).toContain("source documents: 2026 Form W-2 (official info-copy PDF) :: irs-w2-2026.pdf");
    expect(unsupportedNotes?.contents).toContain("[LATER] Consider a professional review:");
  });
});
