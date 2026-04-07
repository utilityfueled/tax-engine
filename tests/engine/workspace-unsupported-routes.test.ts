import { describe, expect, it } from "vitest";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { buildWorkspaceUnsupportedRoutes } from "@tax-engine/engine";

function createBaseWorkspace(): ReturnWorkspaceRecord {
  return {
    id: "workspace-routing",
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    storageMode: "local-browser",
    documents: [
      {
        id: "doc-1099b",
        name: "f1099b--2025.pdf",
        size: 12,
        uploadedAt: "2026-03-12T00:00:00.000Z",
        kind: "1099-b",
        coverage: "supported",
        label: "2025 Form 1099-B",
        notes: "Fixture",
        matchedFixtureId: "irs-1099-b-2025",
        seededFactIds: ["broker-proceeds", "cost-basis-review"]
      }
    ],
    summary: {
      totalDocuments: 1,
      officialFixtureMatches: 1,
      supportedDocuments: 1,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 1
    },
    seededReturn: {
      status: "needs-review",
      taxYearHints: [2025],
      facts: [
        {
          id: "broker-proceeds",
          label: "Broker sale proceeds",
          status: "answered",
          answeredAt: "2026-03-12T00:00:00.000Z",
          answerText: "All broker proceeds belong on Form 8949.",
          sourceDocumentIds: ["doc-1099b"]
        },
        {
          id: "cost-basis-review",
          label: "Cost basis and adjustments review",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["doc-1099b"]
        }
      ],
      interviewQuestions: [
        {
          id: "cost-basis-review",
          factId: "cost-basis-review",
          prompt: "Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B.",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["doc-1099b"]
        }
      ],
      interviewQueue: [
        "Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B."
      ],
      nextQuestionId: "cost-basis-review",
      reviewNotes: []
    },
    structuredFacts: [],
    returnSummary: {
      status: "needs-review",
      targetTaxYear: 2025,
      taxYearState: "single",
      answeredFactCount: 1,
      totalFactCount: 2,
      readyItemCount: 0,
      itemCount: 1,
      blockers: [
        {
          id: "needs-answer:capital-gains",
          message: "Capital gains and basis review still has 1 unanswered interview confirmation(s).",
          relatedFactIds: ["broker-proceeds", "cost-basis-review"],
          sourceDocumentIds: ["doc-1099b"]
        }
      ],
      items: [
        {
          id: "capital-gains",
          label: "Capital gains and basis review",
          status: "needs-answer",
          engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"],
          relatedFactIds: ["broker-proceeds", "cost-basis-review"],
          sourceDocumentIds: ["doc-1099b"],
          answeredFactCount: 1,
          factCount: 2
        }
      ]
    },
    enginePreview: null,
    checklist: [
      { id: "documents", label: "Upload tax documents", status: "ready" },
      { id: "coverage", label: "Check document support", status: "blocked" },
      { id: "interview", label: "Answer missing questions", status: "needs-input" },
      { id: "review", label: "Review summary and completed return", status: "blocked" }
    ],
    auditTrail: []
  };
}

describe("workspace unsupported routes", () => {
  it("routes mixed interview and manual-review blockers into ordered next actions", () => {
    const baseWorkspace = createBaseWorkspace();
    const workspace: ReturnWorkspaceRecord = {
      ...baseWorkspace,
      documents: [
        ...baseWorkspace.documents,
        {
          id: "doc-review",
          name: "broker-export.pdf",
          size: 20,
          uploadedAt: "2026-03-12T00:00:00.000Z",
          kind: "unknown",
          coverage: "unsupported",
          label: "Unclassified upload",
          notes: "Manual review required.",
          matchedFixtureId: null,
          seededFactIds: []
        }
      ],
      summary: {
        totalDocuments: 2,
        officialFixtureMatches: 1,
        supportedDocuments: 1,
        pendingReviewDocuments: 1,
        interviewQuestionsRemaining: 1
      },
      returnSummary: {
        ...baseWorkspace.returnSummary,
        blockers: [
          ...baseWorkspace.returnSummary.blockers,
          {
            id: "needs-review:unmapped-documents",
            message: "1 uploaded document still needs manual coverage review before deterministic recompute can run.",
            relatedFactIds: [],
            sourceDocumentIds: ["doc-review"]
          }
        ]
      }
    };

    expect(buildWorkspaceUnsupportedRoutes(workspace)).toEqual([
      {
        id: "continue-interview",
        urgency: "now",
        title: "Answer remaining questions",
        description: "You have 1 unanswered question that may affect your return.",
        blockerIds: ["needs-answer:capital-gains"],
        relatedFactIds: ["broker-proceeds", "cost-basis-review"],
        sourceDocumentIds: ["doc-1099b"],
        reasons: [
          "Capital gains and basis review still has 1 unanswered interview confirmation(s).",
          "Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B."
        ]
      },
      {
        id: "review-filing-pack",
        urgency: "next",
        title: "Download your draft return packet",
        description: "Re-download your draft packet after making changes so the notes and action items stay up to date.",
        blockerIds: ["needs-answer:capital-gains", "needs-review:unmapped-documents"],
        relatedFactIds: ["broker-proceeds", "cost-basis-review"],
        sourceDocumentIds: ["doc-1099b", "doc-review"],
        reasons: [
          "Capital gains and basis review still has 1 unanswered interview confirmation(s).",
          "1 uploaded document still needs manual coverage review before deterministic recompute can run.",
          "Unclassified upload is marked unsupported."
        ]
      },
      {
        id: "partner-review-later",
        urgency: "later",
        title: "Consider a professional review",
        description: "Download a summary you can share with a tax professional. This app does not contact, assign, or engage a reviewer for you.",
        blockerIds: ["needs-review:unmapped-documents"],
        relatedFactIds: [],
        sourceDocumentIds: ["doc-review"],
        reasons: [
          "1 uploaded document still needs manual coverage review before deterministic recompute can run.",
          "Unclassified upload is marked unsupported."
        ]
      }
    ]);
  });

  it("routes unsupported tax years directly to filing-pack review and later handoff", () => {
    const baseWorkspace = createBaseWorkspace();
    const workspace: ReturnWorkspaceRecord = {
      ...baseWorkspace,
      summary: {
        totalDocuments: 1,
        officialFixtureMatches: 1,
        supportedDocuments: 1,
        pendingReviewDocuments: 0,
        interviewQuestionsRemaining: 0
      },
      seededReturn: {
        ...baseWorkspace.seededReturn,
        taxYearHints: [2026],
        facts: baseWorkspace.seededReturn.facts.map((fact) => ({
          ...fact,
          status: "answered",
          answeredAt: "2026-03-12T00:00:00.000Z",
          answerText: fact.answerText ?? "Confirmed."
        })),
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null
      },
      returnSummary: {
        ...baseWorkspace.returnSummary,
        targetTaxYear: 2026,
        answeredFactCount: 2,
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
            id: "capital-gains",
            label: "Capital gains and basis review",
            status: "ready",
            engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"],
            relatedFactIds: ["broker-proceeds", "cost-basis-review"],
            sourceDocumentIds: ["doc-1099b"],
            answeredFactCount: 2,
            factCount: 2
          }
        ]
      }
    };

    expect(buildWorkspaceUnsupportedRoutes(workspace)).toEqual([
      {
        id: "review-filing-pack",
        urgency: "now",
        title: "Download your draft return packet",
        description: "Download your draft return packet. Any items still needing attention are noted in the export.",
        blockerIds: ["unsupported-tax-year"],
        relatedFactIds: ["broker-proceeds", "cost-basis-review"],
        sourceDocumentIds: ["doc-1099b"],
        reasons: [
          "Tax year 2026 is not available for deterministic recompute yet. Latest supported engine year: 2025."
        ]
      },
      {
        id: "partner-review-later",
        urgency: "later",
        title: "Consider a professional review",
        description: "Download a summary you can share with a tax professional. This app does not contact, assign, or engage a reviewer for you.",
        blockerIds: ["unsupported-tax-year"],
        relatedFactIds: ["broker-proceeds", "cost-basis-review"],
        sourceDocumentIds: ["doc-1099b"],
        reasons: [
          "Tax year 2026 is not available for deterministic recompute yet. Latest supported engine year: 2025."
        ]
      }
    ]);
  });

  it("returns no unsupported routes for supported interview-only workspaces", () => {
    const baseWorkspace = createBaseWorkspace();

    expect(buildWorkspaceUnsupportedRoutes({
      ...baseWorkspace,
      returnSummary: {
        ...baseWorkspace.returnSummary,
        status: "awaiting-interview"
      }
    })).toEqual([]);
  });

  it("returns no unsupported routes for an empty workspace before uploads begin", () => {
    const baseWorkspace = createBaseWorkspace();

    expect(buildWorkspaceUnsupportedRoutes({
      ...baseWorkspace,
      documents: [],
      summary: {
        totalDocuments: 0,
        officialFixtureMatches: 0,
        supportedDocuments: 0,
        pendingReviewDocuments: 0,
        interviewQuestionsRemaining: 0
      },
      seededReturn: {
        ...baseWorkspace.seededReturn,
        status: "empty",
        taxYearHints: [],
        facts: [],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null
      },
      returnSummary: {
        status: "empty",
        targetTaxYear: null,
        taxYearState: "missing",
        answeredFactCount: 0,
        totalFactCount: 0,
        readyItemCount: 0,
        itemCount: 0,
        blockers: [
          {
            id: "missing-tax-year",
            message: "No tax year hint detected from the current workspace documents.",
            relatedFactIds: [],
            sourceDocumentIds: []
          }
        ],
        items: []
      }
    })).toEqual([]);
  });
});
