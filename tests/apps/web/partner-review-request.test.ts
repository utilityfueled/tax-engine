import { describe, expect, it } from "vitest";
import type {
  PartnerReviewConsentRecord,
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord
} from "@tax-engine/contracts";
import {
  buildProviderPartnerReviewRequestBundle,
  buildProviderPartnerReviewRequestDownload
} from "../../../apps/web/src/lib/partner-review-request";
import { containsUnsafeDirectIdentifier } from "../../../apps/web/src/lib/provider-request-privacy";

function createDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1",
    name: "jane-doe-123-45-6789-w2.pdf",
    size: 10,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "w2",
    coverage: "supported",
    label: "2026 Form W-2 for Jane Doe",
    notes: "Uploaded by Jane Doe from jane.doe@example.com.",
    matchedFixtureId: "irs-w2-2026",
    seededFactIds: ["wages", "withholding"],
    ...overrides
  };
}

function createSeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "needs-review",
    taxYearHints: [2026],
    facts: [
      {
        id: "wages",
        label: "Wages",
        status: "answered",
        answeredAt: "2026-03-12T00:00:00.000Z",
        answerText: "Jane Doe confirmed the W-2 is final.",
        sourceDocumentIds: ["doc-1"]
      }
    ],
    interviewQuestions: [],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [
      "Mail the reviewer follow-up to Jane Doe at 12 Main Street, Austin TX 78701."
    ],
    ...overrides
  };
}

function createWorkspace(overrides: Partial<ReturnWorkspaceRecord> = {}): ReturnWorkspaceRecord {
  return {
    id: "workspace-jane-doe-review",
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
        value: "Jane Doe confirmed the W-2 is final.",
        sourceType: "user-answer",
        confidence: "high",
        sourceDocumentIds: ["doc-1"],
        questionId: "wages",
        updatedAt: "2026-03-12T00:00:00.000Z"
      }
    ],
    returnSummary: {
      status: "needs-review",
      targetTaxYear: 2025,
      taxYearState: "single",
      answeredFactCount: 1,
      totalFactCount: 1,
      readyItemCount: 0,
      itemCount: 1,
      blockers: [],
      items: [
        {
          id: "wages-and-review",
          label: "Wages and review",
          status: "needs-review",
          engineTargets: ["Form 1040 Line 1"],
          relatedFactIds: ["wages"],
          sourceDocumentIds: ["doc-1"],
          answeredFactCount: 1,
          factCount: 1
        }
      ]
    },
    enginePreview: null,
    checklist: [
      { id: "documents", label: "Upload tax documents", status: "ready" },
      { id: "review", label: "Review summary and completed return", status: "needs-input" }
    ],
    auditTrail: [
      {
        id: "interview-answered:wages",
        occurredAt: "2026-03-12T00:00:00.000Z",
        kind: "interview-answered",
        message: "Jane Doe answered the wage confirmation call from 512-555-0100.",
        documentIds: ["doc-1"],
        questionId: "wages",
        answerText: "Jane Doe confirmed the W-2 is final."
      }
    ],
    ...overrides
  };
}

function createConsent(
  overrides: Partial<PartnerReviewConsentRecord> = {}
): PartnerReviewConsentRecord {
  return {
    shareRedactedDataWithPartner: true,
    acknowledgeSoftwareOnlyService: true,
    acknowledgeSeparateProfessionalEngagement: true,
    capturedAt: "2026-03-12T00:00:00.000Z",
    ...overrides
  };
}

describe("partner-review request bundle", () => {
  it("derives local direct identifiers automatically and keeps the bundle provider-safe", () => {
    const request = buildProviderPartnerReviewRequestBundle(createWorkspace(), {
      consent: createConsent(),
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(request.requestId).toBe(
      "partner-review:workspace-[person-name-1]-review:2026-03-12T00:00:00.000Z"
    );
    expect(request.reviewRequest.workspaceId).toBe("workspace-[person-name-1]-review");
    expect(request.redactions).toEqual(expect.arrayContaining([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[email-1]", kind: "email" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[postal-code-1]", kind: "postal-code" },
      { token: "[phone-1]", kind: "phone" }
    ]));
    expect(containsUnsafeDirectIdentifier(request)).toBe(false);
  });

  it("serializes the local partner-review handoff bundle to a deterministic download payload", () => {
    const download = buildProviderPartnerReviewRequestDownload(createWorkspace(), {
      consent: createConsent(),
      now: "2026-03-12T00:00:00.000Z"
    });
    const parsed = JSON.parse(download.contents);

    expect(download.fileName).toBe(
      "workspace-person-name-1-review-2026-03-12-partner-review-request.json"
    );
    expect(download.contents.endsWith("\n")).toBe(true);
    expect(parsed.task).toBe("partner-review");
    expect(parsed.requestId).toBe(
      "partner-review:workspace-[person-name-1]-review:2026-03-12T00:00:00.000Z"
    );
    expect(parsed.reviewRequest.consent).toEqual(createConsent());
    expect(parsed.redactions).toEqual(expect.arrayContaining([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[email-1]", kind: "email" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[postal-code-1]", kind: "postal-code" },
      { token: "[phone-1]", kind: "phone" }
    ]));
    expect(containsUnsafeDirectIdentifier(parsed)).toBe(false);
  });

  it("protects business identifiers and employer tax IDs inside the downloaded bundle", () => {
    const workspace = createWorkspace({
      documents: [
        createDocument({
          name: "2025-northwind-w2.pdf",
          label: "NORTHWIND CONSULTING LLC W-2",
          notes: "Employer EIN 12-3456789."
        })
      ],
      structuredFacts: [
        {
          id: "wages:machine-value",
          factId: "wages",
          label: "Employer EIN",
          kind: "machine-value",
          value: "12-3456789",
          sourceType: "document-parser",
          confidence: "high",
          sourceDocumentIds: ["doc-1"],
          updatedAt: "2026-03-12T00:00:00.000Z"
        }
      ]
    });

    const download = buildProviderPartnerReviewRequestDownload(workspace, {
      consent: createConsent(),
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(download.contents).not.toContain("Northwind");
    expect(download.contents).not.toContain("12-3456789");
    expect(download.bundle.redactions.some((entry) => entry.kind === "other")).toBe(true);
    expect(containsUnsafeDirectIdentifier(JSON.parse(download.contents))).toBe(false);
  });
});
