import { describe, expect, it } from "vitest";
import type {
  ProviderDirectIdentifier,
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord
} from "@tax-engine/contracts";
import {
  buildProviderFacingExportDraftPayload,
  buildProviderFacingInterviewPayload,
  buildProviderFacingWorkspacePayload,
  collectProviderDirectIdentifiersFromWorkspace,
  collectProviderDirectIdentifiersFromTaxInput
} from "@tax-engine/engine";
import type { TaxYearInput } from "@/models/inputs.js";

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
    label: "2026 Form W-2 (official info-copy PDF)",
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
    status: "ready-for-interview",
    taxYearHints: [2026],
    facts: [
      {
        id: "wages",
        label: "Wages",
        status: "answered",
        answeredAt: "2026-03-12T00:00:00.000Z",
        answerText: "Jane Doe confirmed the W-2 is final.",
        sourceDocumentIds: ["doc-1"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "answered",
        answeredAt: "2026-03-12T00:00:00.000Z",
        answerText: "Federal withholding matches the statement for SSN 123-45-6789.",
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
        answerText: "Jane Doe confirmed the W-2 is final.",
        sourceDocumentIds: ["doc-1"]
      },
      {
        id: "withholding",
        factId: "withholding",
        prompt: "Confirm federal and state withholding amounts from each wage statement.",
        status: "answered",
        answeredAt: "2026-03-12T00:00:00.000Z",
        answerText: "Federal withholding matches the statement for SSN 123-45-6789 and phone 512-555-0100.",
        sourceDocumentIds: ["doc-1"]
      }
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [
      "Mail a follow-up summary to Jane Doe at 12 Main Street, Austin TX 78701."
    ],
    ...overrides
  };
}

function createWorkspace(overrides: Partial<ReturnWorkspaceRecord> = {}): ReturnWorkspaceRecord {
  return {
    id: "workspace-jane-doe",
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
      ]
    },
    enginePreview: null,
    checklist: [
      { id: "documents", label: "Upload tax documents", status: "ready" },
      { id: "coverage", label: "Check document support", status: "ready" }
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

describe("provider-facing workspace payload", () => {
  it("derives local person-name identifiers from workspace strings before provider redaction", () => {
    const workspace = createWorkspace({
      auditTrail: [
        {
          id: "interview-answered:dependent",
          occurredAt: "2026-03-12T00:00:00.000Z",
          kind: "interview-answered",
          message: "Jane Doe confirmed dependent Alex Doe uses SSN 222-33-4444 and DOB 2018-05-01.",
          documentIds: ["doc-1"],
          questionId: "wages",
          answerText: "Dependent Alex Doe matches the uploaded records."
        }
      ]
    });

    expect(collectProviderDirectIdentifiersFromWorkspace(workspace)).toEqual([
      { kind: "person-name", value: "Jane Doe" },
      { kind: "person-name", value: "Alex Doe" }
    ]);
  });

  it("tokenizes direct identifiers before a workspace payload is sent to a model provider", () => {
    const workspace = createWorkspace();
    const payload = buildProviderFacingWorkspacePayload(workspace, {
      directIdentifiers: createDirectIdentifiers()
    });

    expect(payload.workspace.id).toBe("workspace-[person-name-1]");
    expect(payload.workspace.documents[0]?.name).toBe("[person-name-1]-[ssn-1]-w2.pdf");
    expect(payload.workspace.documents[0]?.notes).toBe(
      "Uploaded by [person-name-1] from [email-1]."
    );
    expect(payload.workspace.seededReturn.reviewNotes).toEqual([
      "Mail a follow-up summary to [person-name-1] at [street-address-1], Austin TX [postal-code-1]."
    ]);
    expect(payload.workspace.auditTrail[0]?.message).toBe(
      "[person-name-1] answered the wage confirmation call from [phone-1]."
    );
    expect(payload.unsupportedRoutes).toEqual([]);
    expect(payload.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[email-1]", kind: "email" },
      { token: "[phone-1]", kind: "phone" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[postal-code-1]", kind: "postal-code" }
    ]);

    const serializedPayload = JSON.stringify(payload.workspace);
    expect(serializedPayload).not.toContain("Jane Doe");
    expect(serializedPayload).not.toContain("123-45-6789");
    expect(serializedPayload).not.toContain("jane.doe@example.com");
    expect(serializedPayload).not.toContain("512-555-0100");
    expect(serializedPayload).not.toContain("12 Main Street");
    expect(serializedPayload).not.toContain("78701");

    expect(workspace.documents[0]?.name).toBe("jane-doe-123-45-6789-w2.pdf");
    expect(workspace.auditTrail[0]?.message).toBe(
      "Jane Doe answered the wage confirmation call from 512-555-0100."
    );
  });

  it("derives unsupported routes from the redacted workspace payload", () => {
    const workspace = createWorkspace({
      id: "workspace-jane-doe-review",
      documents: [
        createDocument({}),
        createDocument({
          id: "doc-2",
          name: "jane-doe-broker-export.pdf",
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
        interviewQuestionsRemaining: 1
      },
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
            id: "needs-answer:wages-and-withholding",
            message: "Wages and withholding still has 1 unanswered interview confirmation(s).",
            relatedFactIds: ["wages", "withholding"],
            sourceDocumentIds: ["doc-1"]
          },
          {
            id: "needs-review:manual-mapping",
            message: "Jane Doe uploaded a broker packet that still needs manual coverage review before deterministic recompute can run.",
            relatedFactIds: [],
            sourceDocumentIds: ["doc-2"]
          }
        ],
        items: [
          {
            id: "wages-and-withholding",
            label: "Wages and withholding",
            status: "needs-answer",
            engineTargets: ["Form 1040 Lines 1 and 25a"],
            relatedFactIds: ["wages", "withholding"],
            sourceDocumentIds: ["doc-1"],
            answeredFactCount: 1,
            factCount: 2
          }
        ]
      }
    });

    const payload = buildProviderFacingWorkspacePayload(workspace, {
      directIdentifiers: createDirectIdentifiers()
    });

    expect(payload.unsupportedRoutes).toEqual([
      {
        id: "continue-interview",
        urgency: "now",
        title: "Answer remaining questions",
        description: "Finish answering the remaining questions so your return is as complete as possible.",
        blockerIds: ["needs-answer:wages-and-withholding"],
        relatedFactIds: ["wages", "withholding"],
        sourceDocumentIds: ["doc-1"],
        reasons: [
          "Wages and withholding still has 1 unanswered interview confirmation(s)."
        ]
      },
      {
        id: "review-filing-pack",
        urgency: "now",
        title: "Download your draft return packet",
        description: "Download your draft return packet. Any items still needing attention are noted in the export.",
        blockerIds: ["needs-answer:wages-and-withholding", "needs-review:manual-mapping"],
        relatedFactIds: ["wages", "withholding"],
        sourceDocumentIds: ["doc-1", "doc-2"],
        reasons: [
          "Wages and withholding still has 1 unanswered interview confirmation(s).",
          "[person-name-1] uploaded a broker packet that still needs manual coverage review before deterministic recompute can run.",
          "[person-name-1] broker packet is marked unsupported."
        ]
      },
      {
        id: "partner-review-later",
        urgency: "later",
        title: "Consider a professional review",
        description: "Download a summary you can share with a tax professional. This app does not contact, assign, or engage a reviewer for you.",
        blockerIds: ["needs-review:manual-mapping"],
        relatedFactIds: [],
        sourceDocumentIds: ["doc-2"],
        reasons: [
          "[person-name-1] uploaded a broker packet that still needs manual coverage review before deterministic recompute can run.",
          "[person-name-1] broker packet is marked unsupported."
        ]
      }
    ]);

    const serializedPayload = JSON.stringify(payload);
    expect(serializedPayload).not.toContain("Jane Doe");
    expect(serializedPayload).toContain("[person-name-1]");
  });

  it("uses regex redaction fallbacks for direct identifiers that were not supplied explicitly", () => {
    const workspace = createWorkspace({
      seededReturn: createSeededReturn({
        reviewNotes: [
          "Reach the filer at 415-555-0133 or jane.alt@example.com before the deadline."
        ]
      })
    });

    const payload = buildProviderFacingWorkspacePayload(workspace);

    expect(payload.workspace.seededReturn.reviewNotes).toEqual([
      "Reach the filer at [phone-2] or [email-2] before the deadline."
    ]);
    expect(payload.redactions).toEqual([
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[email-1]", kind: "email" },
      { token: "[phone-1]", kind: "phone" },
      { token: "[email-2]", kind: "email" },
      { token: "[phone-2]", kind: "phone" }
    ]);
  });

  it("redacts employer tax IDs and business-style document identifiers before provider handoff", () => {
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

    const payload = buildProviderFacingWorkspacePayload(workspace, {
      directIdentifiers: collectProviderDirectIdentifiersFromWorkspace(workspace)
    });

    const serializedPayload = JSON.stringify(payload.workspace);
    expect(serializedPayload).not.toContain("Northwind");
    expect(serializedPayload).not.toContain("12-3456789");
    expect(payload.redactions.some((entry) => entry.kind === "other")).toBe(true);
  });

  it("redacts undelimited SSNs in provider-facing strings with locally derived name identifiers", () => {
    const workspace = createWorkspace({
      documents: [
        createDocument({
          name: "jane-doe-123456789-w2.pdf",
          notes: "Uploaded from local scan 123456789."
        })
      ],
      seededReturn: createSeededReturn({
        facts: [
          {
            id: "wages",
            label: "Wages",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Jane Doe confirmed filer copy 123456789 is final.",
            sourceDocumentIds: ["doc-1"]
          },
          {
            id: "withholding",
            label: "Federal withholding",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Federal withholding matches statement copy 123456789.",
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
            answerText: "Jane Doe confirmed filer copy 123456789 is final.",
            sourceDocumentIds: ["doc-1"]
          },
          {
            id: "withholding",
            factId: "withholding",
            prompt: "Confirm federal and state withholding amounts from each wage statement.",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Federal withholding matches statement copy 123456789.",
            sourceDocumentIds: ["doc-1"]
          }
        ],
        reviewNotes: [
          "Reach Jane Doe after verifying copy 123456789."
        ]
      }),
      structuredFacts: [
        {
          id: "wages:interview-answer",
          factId: "wages",
          label: "Wages",
          kind: "interview-answer",
          value: "Jane Doe confirmed filer copy 123456789 is final.",
          sourceType: "user-answer",
          confidence: "high",
          sourceDocumentIds: ["doc-1"],
          questionId: "wages",
          updatedAt: "2026-03-12T00:00:00.000Z"
        }
      ],
      auditTrail: [
        {
          id: "interview-answered:wages",
          occurredAt: "2026-03-12T00:00:00.000Z",
          kind: "interview-answered",
          message: "Jane Doe confirmed copy 123456789 during review.",
          documentIds: ["doc-1"],
          questionId: "wages",
          answerText: "Jane Doe confirmed filer copy 123456789 is final."
        }
      ]
    });

    const payload = buildProviderFacingWorkspacePayload(workspace, {
      directIdentifiers: collectProviderDirectIdentifiersFromWorkspace(workspace)
    });

    expect(payload.workspace.documents[0]?.name).toBe("[person-name-1]-[ssn-1]-w2.pdf");
    expect(payload.workspace.documents[0]?.notes).toBe(
      "Uploaded from local scan [ssn-1]."
    );
    expect(payload.workspace.seededReturn.reviewNotes).toEqual([
      "Reach [person-name-1] after verifying copy [ssn-1]."
    ]);
    expect(payload.workspace.auditTrail[0]?.message).toBe(
      "[person-name-1] confirmed copy [ssn-1] during review."
    );
    expect(payload.redactions).toContainEqual({ token: "[ssn-1]", kind: "ssn" });

    const serializedPayload = JSON.stringify(payload.workspace);
    expect(serializedPayload).not.toContain("123456789");
  });

  it("derives provider-facing direct identifiers from structured tax input", () => {
    const workspace = createWorkspace({
      seededReturn: createSeededReturn({
        reviewNotes: [
          "Verify Jane Doe date of birth 1988-02-14 and mail the follow-up summary to 12 Main Street, Austin TX 78701."
        ]
      }),
      auditTrail: [
        {
          id: "interview-answered:dependent",
          occurredAt: "2026-03-12T00:00:00.000Z",
          kind: "interview-answered",
          message: "Jane Doe confirmed dependent Alex Doe uses SSN 222-33-4444 and DOB 2018-05-01.",
          documentIds: ["doc-1"],
          questionId: "wages",
          answerText: "Dependent Alex Doe matches the uploaded records."
        }
      ]
    });

    const taxInput: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Jane",
          lastName: "Doe",
          ssn: "123-45-6789",
          dateOfBirth: "1988-02-14"
        },
        address: {
          street: "12 Main Street",
          city: "Austin",
          state: "TX",
          zip: "78701"
        },
        dependents: [
          {
            firstName: "Alex",
            lastName: "Doe",
            ssn: "222-33-4444",
            relationship: "Child",
            dateOfBirth: "2018-05-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true
          }
        ]
      },
      w2s: [],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [],
      rentalProperties: [],
      savingsBondRedemptions: []
    };

    const payload = buildProviderFacingWorkspacePayload(workspace, {
      directIdentifiers: collectProviderDirectIdentifiersFromTaxInput(taxInput)
    });

    expect(payload.workspace.seededReturn.reviewNotes).toEqual([
      "Verify [person-name-1] date of birth [date-of-birth-1] and mail the follow-up summary to [street-address-1], Austin TX [postal-code-1]."
    ]);
    expect(payload.workspace.auditTrail[0]?.message).toBe(
      "[person-name-1] confirmed dependent [person-name-2] uses SSN [ssn-2] and DOB [date-of-birth-2]."
    );
    expect(payload.workspace.auditTrail[0]?.answerText).toBe(
      "Dependent [person-name-2] matches the uploaded records."
    );

    const serializedPayload = JSON.stringify(payload.workspace);
    expect(serializedPayload).not.toContain("Jane Doe");
    expect(serializedPayload).not.toContain("Alex Doe");
    expect(serializedPayload).not.toContain("123-45-6789");
    expect(serializedPayload).not.toContain("222-33-4444");
    expect(serializedPayload).not.toContain("1988-02-14");
    expect(serializedPayload).not.toContain("2018-05-01");
    expect(serializedPayload).not.toContain("12 Main Street");
    expect(serializedPayload).not.toContain("78701");

    expect(payload.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[email-1]", kind: "email" },
      { token: "[phone-1]", kind: "phone" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[date-of-birth-1]", kind: "date-of-birth" },
      { token: "[postal-code-1]", kind: "postal-code" },
      { token: "[ssn-2]", kind: "ssn" },
      { token: "[date-of-birth-2]", kind: "date-of-birth" },
      { token: "[person-name-2]", kind: "person-name" }
    ]);
  });
});

describe("provider-facing interview payload", () => {
  it("builds a redacted interview request shape without raw workspace documents", () => {
    const workspace = createWorkspace();
    const payload = buildProviderFacingInterviewPayload(workspace, {
      directIdentifiers: createDirectIdentifiers()
    });

    expect(payload.interview.workspaceId).toBe("workspace-[person-name-1]");
    expect(payload.interview.questions[0]?.answerText).toBe(
      "[person-name-1] confirmed the W-2 is final."
    );
    expect(payload.interview.questions[1]?.answerText).toBe(
      "Federal withholding matches the statement for SSN [ssn-1] and phone [phone-1]."
    );
    expect(payload.interview.structuredFacts[0]?.value).toBe(
      "[person-name-1] confirmed the W-2 is final."
    );
    expect(payload.interview.auditTrail[0]?.message).toBe(
      "[person-name-1] answered the wage confirmation call from [phone-1]."
    );
    expect("documents" in payload.interview).toBe(false);

    const serializedPayload = JSON.stringify(payload.interview);
    expect(serializedPayload).not.toContain("Jane Doe");
    expect(serializedPayload).not.toContain("123-45-6789");
    expect(serializedPayload).not.toContain("512-555-0100");
  });

  it("uses defensive fallback redaction for structured identifiers in interview payload strings", () => {
    const workspace = createWorkspace({
      structuredFacts: [
        {
          id: "withholding:interview-answer",
          factId: "withholding",
          label: "Federal withholding",
          kind: "interview-answer",
          value: "Mail the follow-up to 12 Main Street and confirm DOB 1988-02-14 before review.",
          sourceType: "user-answer",
          confidence: "high",
          sourceDocumentIds: ["doc-1"],
          questionId: "withholding",
          updatedAt: "2026-03-12T00:00:00.000Z"
        }
      ],
      auditTrail: [
        {
          id: "interview-answered:withholding",
          occurredAt: "2026-03-12T00:00:00.000Z",
          kind: "interview-answered",
          message: "Confirmed DOB 1988-02-14 before mailing the packet to 12 Main Street.",
          documentIds: ["doc-1"],
          questionId: "withholding",
          answerText: "Mail the packet to 12 Main Street after DOB 1988-02-14 is confirmed."
        }
      ]
    });

    const payload = buildProviderFacingInterviewPayload(workspace);

    expect(payload.interview.structuredFacts[0]?.value).toBe(
      "Mail the follow-up to [street-address-1] and confirm DOB [date-of-birth-1] before review."
    );
    expect(payload.interview.auditTrail[0]?.message).toBe(
      "Confirmed DOB [date-of-birth-1] before mailing the packet to [street-address-1]."
    );
    expect(payload.interview.auditTrail[0]?.answerText).toBe(
      "Mail the packet to [street-address-1] after DOB [date-of-birth-1] is confirmed."
    );
    expect(payload.redactions).toEqual([
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[phone-1]", kind: "phone" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[date-of-birth-1]", kind: "date-of-birth" }
    ]);

    const serializedPayload = JSON.stringify(payload.interview);
    expect(serializedPayload).not.toContain("12 Main Street");
    expect(serializedPayload).not.toContain("1988-02-14");
  });

  it("redacts slash-formatted DOB strings in interview payload fallbacks", () => {
    const workspace = createWorkspace({
      structuredFacts: [
        {
          id: "withholding:interview-answer",
          factId: "withholding",
          label: "Federal withholding",
          kind: "interview-answer",
          value: "Mail the follow-up to 12 Main Street and confirm DOB 2/14/1988 before review.",
          sourceType: "user-answer",
          confidence: "high",
          sourceDocumentIds: ["doc-1"],
          questionId: "withholding",
          updatedAt: "2026-03-12T00:00:00.000Z"
        }
      ],
      auditTrail: [
        {
          id: "interview-answered:withholding",
          occurredAt: "2026-03-12T00:00:00.000Z",
          kind: "interview-answered",
          message: "Confirmed date of birth: 02/14/1988 before mailing the packet to 12 Main Street.",
          documentIds: ["doc-1"],
          questionId: "withholding",
          answerText: "Mail the packet to 12 Main Street after birth date 2/14/1988 is confirmed."
        }
      ]
    });

    const payload = buildProviderFacingInterviewPayload(workspace);

    expect(payload.interview.structuredFacts[0]?.value).toBe(
      "Mail the follow-up to [street-address-1] and confirm DOB [date-of-birth-1] before review."
    );
    expect(payload.interview.auditTrail[0]?.message).toBe(
      "Confirmed date of birth: [date-of-birth-1] before mailing the packet to [street-address-1]."
    );
    expect(payload.interview.auditTrail[0]?.answerText).toBe(
      "Mail the packet to [street-address-1] after birth date [date-of-birth-1] is confirmed."
    );
    expect(payload.redactions).toEqual([
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[phone-1]", kind: "phone" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[date-of-birth-1]", kind: "date-of-birth" }
    ]);

    const serializedPayload = JSON.stringify(payload.interview);
    expect(serializedPayload).not.toContain("12 Main Street");
    expect(serializedPayload).not.toContain("2/14/1988");
    expect(serializedPayload).not.toContain("02/14/1988");
  });
});

describe("provider-facing export draft payload", () => {
  it("redacts names and fallback identifiers in export-adjacent request payloads", () => {
    const workspace = createWorkspace({
      enginePreview: {
        mode: "engine-recompute",
        title: "Jane Doe 2025 filing preview",
        taxYear: 2025,
        filingStatus: "single",
        sourceDocumentIds: ["doc-1"],
        sourceFixtureIds: ["irs-w2-2026"],
        assumptions: [
          "Call Jane Doe at 512-555-0100 before mailing the packet to 12 Main Street, Austin TX 78701.",
          "Do not include SSN 123-45-6789 in the packet cover note."
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
            sourceFactIds: []
          }
        ]
      }
    });

    const payload = buildProviderFacingExportDraftPayload(workspace, {
      directIdentifiers: createDirectIdentifiers()
    });

    expect(payload.exportDraft.workspaceId).toBe("workspace-[person-name-1]");
    expect(payload.exportDraft.enginePreview?.title).toBe(
      "[person-name-1] 2025 filing preview"
    );
    expect(payload.exportDraft.enginePreview?.assumptions).toEqual([
      "Call [person-name-1] at [phone-1] before mailing the packet to [street-address-1], Austin TX [postal-code-1].",
      "Do not include SSN [ssn-1] in the packet cover note."
    ]);
    expect(payload.exportDraft.auditTrail[0]?.answerText).toBe(
      "[person-name-1] confirmed the W-2 is final."
    );

    const serializedPayload = JSON.stringify(payload.exportDraft);
    expect(serializedPayload).not.toContain("Jane Doe");
    expect(serializedPayload).not.toContain("123-45-6789");
    expect(serializedPayload).not.toContain("512-555-0100");
    expect(serializedPayload).not.toContain("12 Main Street");
    expect(serializedPayload).not.toContain("78701");
  });
});
