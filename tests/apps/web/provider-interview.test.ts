import { describe, expect, it } from "vitest";
import type {
  ProviderDirectIdentifier,
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord
} from "@tax-engine/contracts";
import { POST } from "../../../apps/web/src/app/api/provider/interview/route";
import {
  buildProviderInterviewAssistRequest,
  requestInterviewAssist
} from "../../../apps/web/src/lib/provider-interview-request";

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
        status: "pending",
        answeredAt: null,
        answerText: null,
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
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["doc-1"]
      }
    ],
    interviewQueue: ["Confirm federal and state withholding amounts from each wage statement."],
    nextQuestionId: "withholding",
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
      interviewQuestionsRemaining: 1
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
      status: "awaiting-interview",
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
    },
    enginePreview: null,
    checklist: [
      { id: "documents", label: "Upload tax documents", status: "ready" },
      { id: "coverage", label: "Check document support", status: "ready" },
      { id: "interview", label: "Answer missing questions", status: "needs-input" }
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

describe("provider interview request path", () => {
  it("derives local direct identifiers automatically before sending the provider request", async () => {
    const workspace = createWorkspace();
    let capturedBody = "";

    const fetchFn: typeof fetch = async (input, init) => {
      capturedBody = typeof init?.body === "string" ? init.body : "";
      return POST(new Request(typeof input === "string" ? input : input.url, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body
      }));
    };

    const result = await requestInterviewAssist(workspace, {
      endpoint: "http://localhost/api/provider/interview",
      fetchFn,
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.interview.workspaceId).toBe("workspace-[person-name-1]");
    expect(result.request.requestId).toBe("provider-interview:workspace-[person-name-1]:2026-03-12T00:00:00.000Z");
    expect(result.request.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[phone-1]", kind: "phone" }
    ]);
    expect(capturedBody).not.toContain("Jane Doe");
    expect(capturedBody).not.toContain("workspace-jane-doe");
    expect(capturedBody).not.toContain("123-45-6789");
    expect(capturedBody).not.toContain("jane.doe@example.com");
    expect(capturedBody).not.toContain("12 Main Street");
    expect(capturedBody).not.toContain("78701");
    expect(capturedBody).not.toContain("512-555-0100");
    expect(result.response.provider).toBe("mock-local");
    expect(result.response.recommendedNextQuestionId).toBe("withholding");
    expect(result.response.pendingQuestionCount).toBe(1);
  });

  it("sends a redacted interview payload through the app request path", async () => {
    const workspace = createWorkspace();
    let capturedBody = "";

    const fetchFn: typeof fetch = async (input, init) => {
      capturedBody = typeof init?.body === "string" ? init.body : "";
      return POST(new Request(typeof input === "string" ? input : input.url, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body
      }));
    };

    const result = await requestInterviewAssist(workspace, {
      endpoint: "http://localhost/api/provider/interview",
      directIdentifiers: createDirectIdentifiers(),
      fetchFn,
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.interview.workspaceId).toBe("workspace-[person-name-1]");
    expect(result.request.requestId).toBe("provider-interview:workspace-[person-name-1]:2026-03-12T00:00:00.000Z");
    expect(result.request.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[phone-1]", kind: "phone" }
    ]);
    expect(capturedBody).not.toContain("Jane Doe");
    expect(capturedBody).not.toContain("workspace-jane-doe");
    expect(capturedBody).not.toContain("jane.doe@example.com");
    expect(capturedBody).not.toContain("12 Main Street");
    expect(capturedBody).not.toContain("78701");
    expect(capturedBody).not.toContain("512-555-0100");
    expect(result.response.provider).toBe("mock-local");
    expect(result.response.recommendedNextQuestionId).toBe("withholding");
    expect(result.response.pendingQuestionCount).toBe(1);
  });

  it("rejects interview requests that still contain raw direct-identifier patterns", async () => {
    const unsafeRequest = buildProviderInterviewAssistRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.interview.questions[0] = {
      ...unsafeRequest.interview.questions[0]!,
      answerText: "Call Jane Doe at 512-555-0100 or email jane.doe@example.com."
    };
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/interview", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider interview request contains unredacted direct identifiers."
    });
  });

  it("rejects interview requests that contain unredacted structured identifiers like DOBs and street addresses", async () => {
    const unsafeRequest = buildProviderInterviewAssistRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.interview.auditTrail[0] = {
      ...unsafeRequest.interview.auditTrail[0]!,
      message: "Mail the follow-up packet to 12 Main Street after confirming DOB 1988-02-14."
    };
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/interview", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider interview request contains unredacted direct identifiers."
    });
  });

  it("rejects interview requests that leak direct identifiers in the request envelope", async () => {
    const unsafeRequest = buildProviderInterviewAssistRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.requestId = "provider-interview:jane.doe@example.com:2026-03-12T00:00:00.000Z";
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/interview", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider interview request contains unredacted direct identifiers."
    });
  });
});
