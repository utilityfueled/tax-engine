import { describe, expect, it } from "vitest";
import type {
  PartnerReviewConsentRecord,
  ProviderDirectIdentifier,
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord
} from "@tax-engine/contracts";
import { buildProviderFacingPartnerReviewPayload } from "@tax-engine/engine";

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
      "Call Jane Doe at 512-555-0100 before sending anything to 12 Main Street, Austin TX 78701."
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
    documents: [
      createDocument({}),
      createDocument({
        id: "doc-2",
        kind: "unknown",
        coverage: "unsupported",
        label: "Jane Doe broker packet",
        notes: "Manual review required for Jane Doe before filing.",
        matchedFixtureId: null,
        seededFactIds: []
      })
    ],
    summary: {
      totalDocuments: 2,
      officialFixtureMatches: 1,
      supportedDocuments: 1,
      pendingReviewDocuments: 1,
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
      blockers: [
        {
          id: "unsupported:broker-packet",
          message: "Jane Doe broker packet needs manual review before filing.",
          relatedFactIds: [],
          sourceDocumentIds: ["doc-2"]
        }
      ],
      items: [
        {
          id: "wages-and-review",
          label: "Wages and review",
          status: "needs-review",
          engineTargets: ["Form 1040 Line 1"],
          relatedFactIds: ["wages"],
          sourceDocumentIds: ["doc-1", "doc-2"],
          answeredFactCount: 1,
          factCount: 1
        }
      ]
    },
    enginePreview: {
      mode: "engine-recompute",
      title: "Jane Doe 2025 filing preview",
      taxYear: 2025,
      filingStatus: "single",
      sourceDocumentIds: ["doc-1"],
      sourceFixtureIds: ["irs-w2-2026"],
      assumptions: [
        "Call Jane Doe at 512-555-0100 before mailing anything."
      ],
      metrics: {
        totalIncome: "52000",
        agi: "52000",
        taxableIncome: "38150",
        totalTax: "4300",
        totalPayments: "5000",
        refund: "700",
        amountOwed: "0"
      },
      highlightedLines: [
        {
          id: "form-1040-line-1",
          form: "Form 1040",
          line: "1",
          label: "Wages",
          value: "52000",
          formula: "W-2 Box 1 total",
          sourceFactIds: ["wages:interview-answer"]
        }
      ]
    },
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

function createDirectIdentifiers(): ProviderDirectIdentifier[] {
  return [
    { kind: "person-name", value: "Jane Doe" },
    { kind: "street-address", value: "12 Main Street" },
    { kind: "postal-code", value: "78701" }
  ];
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

describe("provider-facing partner-review payload", () => {
  it("requires explicit consent before generating a partner-review request", () => {
    expect(() =>
      buildProviderFacingPartnerReviewPayload(createWorkspace(), {
        consent: createConsent({
          acknowledgeSeparateProfessionalEngagement: false
        }),
        directIdentifiers: createDirectIdentifiers()
      })
    ).toThrow("separate professional engagement boundary");
  });

  it("builds a redacted partner-review request bundle", () => {
    const payload = buildProviderFacingPartnerReviewPayload(createWorkspace(), {
      consent: createConsent(),
      directIdentifiers: createDirectIdentifiers()
    });

    expect(payload.reviewRequest.requestKind).toBe("partner-review");
    expect(payload.reviewRequest.workspaceId).toBe("workspace-[person-name-1]-review");
    expect(payload.reviewRequest.documents).toEqual([
      {
        id: "doc-1",
        kind: "w2",
        coverage: "supported",
        label: "2026 Form W-2 for [person-name-1]",
        matchedFixtureId: "irs-w2-2026",
        seededFactIds: ["wages", "withholding"]
      },
      {
        id: "doc-2",
        kind: "unknown",
        coverage: "unsupported",
        label: "[person-name-1] broker packet",
        matchedFixtureId: null,
        seededFactIds: []
      }
    ]);
    expect(payload.reviewRequest.reviewNotes).toEqual([
      "Call [person-name-1] at [phone-1] before sending anything to [street-address-1], Austin TX [postal-code-1]."
    ]);
    expect(payload.reviewRequest.unsupportedRoutes).toEqual([
      {
        id: "review-filing-pack",
        urgency: "now",
        title: "Download your draft return packet",
        description: "Download your draft return packet. Any items still needing attention are noted in the export.",
        blockerIds: ["unsupported:broker-packet"],
        relatedFactIds: [],
        sourceDocumentIds: ["doc-2"],
        reasons: [
          "[person-name-1] broker packet needs manual review before filing.",
          "[person-name-1] broker packet is marked unsupported."
        ]
      },
      {
        id: "partner-review-later",
        urgency: "later",
        title: "Consider a professional review",
        description: "Download a summary you can share with a tax professional. This app does not contact, assign, or engage a reviewer for you.",
        blockerIds: ["unsupported:broker-packet"],
        relatedFactIds: [],
        sourceDocumentIds: ["doc-2"],
        reasons: [
          "[person-name-1] broker packet needs manual review before filing.",
          "[person-name-1] broker packet is marked unsupported."
        ]
      }
    ]);
    expect(payload.reviewRequest.consent).toEqual(createConsent());
    expect(payload.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[email-1]", kind: "email" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[postal-code-1]", kind: "postal-code" },
      { token: "[phone-1]", kind: "phone" }
    ]);

    const serializedPayload = JSON.stringify(payload.reviewRequest);
    expect(serializedPayload).not.toContain("Jane Doe");
    expect(serializedPayload).not.toContain("123-45-6789");
    expect(serializedPayload).not.toContain("jane.doe@example.com");
    expect(serializedPayload).not.toContain("512-555-0100");
    expect(serializedPayload).not.toContain("12 Main Street");
    expect(serializedPayload).not.toContain("78701");
  });
});
