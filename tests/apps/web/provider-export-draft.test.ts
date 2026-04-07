import { describe, expect, it } from "vitest";
import type {
  ProviderDirectIdentifier,
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord
} from "@tax-engine/contracts";
import { POST } from "../../../apps/web/src/app/api/provider/export-draft/route";
import {
  buildProviderExportDraftRequest,
  requestProviderExportDraft
} from "../../../apps/web/src/lib/provider-export-draft-request";

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
        answerText: "Federal withholding matches the Jane Doe copy mailed to 12 Main Street.",
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
        answerText: "Federal withholding matches the Jane Doe copy mailed to 12 Main Street.",
        sourceDocumentIds: ["doc-1"]
      }
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [
      "Mail a copy to Jane Doe at 12 Main Street, Austin TX 78701."
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
        id: "withholding:interview-answer",
        factId: "withholding",
        label: "Federal withholding",
        kind: "interview-answer",
        value: "Federal withholding matches Jane Doe at 12 Main Street.",
        sourceType: "user-answer",
        confidence: "high",
        sourceDocumentIds: ["doc-1"],
        questionId: "withholding",
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
    enginePreview: {
      mode: "engine-recompute",
      title: "Jane Doe 2025 filing preview",
      taxYear: 2025,
      filingStatus: "single",
      sourceDocumentIds: ["doc-1"],
      sourceFixtureIds: ["irs-w2-2026"],
      assumptions: [
        "Call Jane Doe at 512-555-0100 before mailing the packet to 12 Main Street, Austin TX 78701."
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
    },
    checklist: [
      { id: "documents", label: "Upload tax documents", status: "ready" },
      { id: "coverage", label: "Check document support", status: "ready" },
      { id: "review", label: "Review summary and completed return", status: "needs-input" }
    ],
    auditTrail: [
      {
        id: "interview-answered:withholding",
        occurredAt: "2026-03-12T00:00:00.000Z",
        kind: "interview-answered",
        message: "Jane Doe confirmed the mailing copy should go to 12 Main Street.",
        documentIds: ["doc-1"],
        questionId: "withholding",
        answerText: "Mail the packet to Jane Doe at 12 Main Street."
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

describe("provider export-draft request path", () => {
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

    const result = await requestProviderExportDraft(workspace, {
      endpoint: "http://localhost/api/provider/export-draft",
      fetchFn,
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.exportDraft.workspaceId).toBe("workspace-[person-name-1]");
    expect(result.request.requestId).toBe("provider-export-draft:workspace-[person-name-1]:2026-03-12T00:00:00.000Z");
    expect(result.request.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[phone-1]", kind: "phone" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[postal-code-1]", kind: "postal-code" },
      { token: "[other-1]", kind: "other" }
    ]);
    expect(capturedBody).not.toContain("Jane Doe");
    expect(capturedBody).not.toContain("workspace-jane-doe");
    expect(capturedBody).not.toContain("123-45-6789");
    expect(capturedBody).not.toContain("jane.doe@example.com");
    expect(capturedBody).not.toContain("12 Main Street");
    expect(capturedBody).not.toContain("78701");
    expect(capturedBody).not.toContain("512-555-0100");
    expect(result.response.provider).toBe("mock-local");
    expect(result.response.previewIncluded).toBe(true);
    expect(result.response.remainingChecklistCount).toBe(1);
  });

  it("sends a redacted export-draft payload through the app request path", async () => {
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

    const result = await requestProviderExportDraft(workspace, {
      endpoint: "http://localhost/api/provider/export-draft",
      directIdentifiers: createDirectIdentifiers(),
      fetchFn,
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.exportDraft.workspaceId).toBe("workspace-[person-name-1]");
    expect(result.request.requestId).toBe("provider-export-draft:workspace-[person-name-1]:2026-03-12T00:00:00.000Z");
    expect(result.request.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[postal-code-1]", kind: "postal-code" },
      { token: "[phone-1]", kind: "phone" },
      { token: "[other-1]", kind: "other" }
    ]);
    expect(capturedBody).not.toContain("Jane Doe");
    expect(capturedBody).not.toContain("workspace-jane-doe");
    expect(capturedBody).not.toContain("123-45-6789");
    expect(capturedBody).not.toContain("jane.doe@example.com");
    expect(capturedBody).not.toContain("12 Main Street");
    expect(capturedBody).not.toContain("78701");
    expect(capturedBody).not.toContain("512-555-0100");
    expect(result.response.provider).toBe("mock-local");
    expect(result.response.previewIncluded).toBe(true);
    expect(result.response.remainingChecklistCount).toBe(1);
  });

  it("rejects export-draft requests that still contain raw direct-identifier patterns", async () => {
    const unsafeRequest = buildProviderExportDraftRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.exportDraft.auditTrail[0] = {
      ...unsafeRequest.exportDraft.auditTrail[0]!,
      message: "Call Jane Doe at 512-555-0100 or email jane.doe@example.com before filing."
    };
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/export-draft", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider export draft request contains unredacted direct identifiers."
    });
  });

  it("rejects export-draft requests that contain unredacted structured identifiers like DOBs and street addresses", async () => {
    const unsafeRequest = buildProviderExportDraftRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.exportDraft.enginePreview = {
      ...unsafeRequest.exportDraft.enginePreview!,
      assumptions: ["Mail the packet to 12 Main Street after confirming DOB 1988-02-14."]
    };
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/export-draft", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider export draft request contains unredacted direct identifiers."
    });
  });

  it("rejects export-draft requests that leak direct identifiers in the request envelope", async () => {
    const unsafeRequest = buildProviderExportDraftRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.requestId = "provider-export-draft:jane.doe@example.com:2026-03-12T00:00:00.000Z";
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/export-draft", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider export draft request contains unredacted direct identifiers."
    });
  });
});
