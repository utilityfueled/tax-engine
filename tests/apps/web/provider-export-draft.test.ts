import { describe, expect, it, vi } from "vitest";
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

function postSyntheticDraft(data: unknown, clientId: string, raw = false) {
  return POST(new Request("http://localhost/api/provider/export-draft", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": clientId },
    body: raw ? String(data) : JSON.stringify(data)
  }));
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

  const draftRequest = buildProviderExportDraftRequest(createWorkspace(), { now: "2026-03-12T00:00:00.000Z" });
  const draft = draftRequest.exportDraft;
  const preview = draft.enginePreview;
  if (!preview) throw new Error("The export draft fixture must include a preview.");
  it.each([
    ["missing checklist", { enginePreview: null }],
    ["object instead of array", { checklist: {}, enginePreview: null }],
    ["null checklist record", { checklist: [null], enginePreview: null }],
    ["noncanonical checklist status", { checklist: [{ id: "test", label: "Test", status: "pending" }], enginePreview: null }],
    ["missing preview", { checklist: [] }],
    ["truthy primitive preview", { checklist: [], enginePreview: true }],
    ["empty preview object", { checklist: [], enginePreview: {} }],
    ["unsupported preview year", { ...draft, enginePreview: { ...preview, taxYear: 2026 } }],
    ["invalid preview metric", { ...draft, enginePreview: { ...preview, metrics: { ...preview.metrics, totalTax: false } } }],
    ["invalid preview line", { ...draft, enginePreview: { ...preview, highlightedLines: [{}] } }]
  ])("rejects malformed nested summary input: %s", async (_label, exportDraft) => {
    const response = await postSyntheticDraft({ ...draftRequest, exportDraft }, "192.0.2.15");

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({ error: "Invalid provider export draft request." });
  });

  it("summarizes an explicit null preview with private responses", async () => {
    const response = await postSyntheticDraft({
      ...draftRequest,
      exportDraft: { checklist: draft.checklist, enginePreview: null }
    }, "192.0.2.16");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      provider: "mock-local", previewIncluded: false, remainingChecklistCount: 1,
      summary: "The supplied draft has no preview and 1 checklist item(s) still need attention."
    });

    const malformed = await postSyntheticDraft("{", "192.0.2.16", true);
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("cache-control")).toBe("no-store, private");

    for (let index = 0; index < 20; index += 1) {
      const allowed = await postSyntheticDraft(draftRequest, "192.0.2.17");
      expect(allowed.status).toBe(200);
    }
    const throttled = await postSyntheticDraft(draftRequest, "192.0.2.17");
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toMatch(/^\d+$/u);
    expect(throttled.headers.get("cache-control")).toBe("no-store, private");
  });

  it("rejects direct identifiers in unused envelope fields", async () => {
    const response = await postSyntheticDraft({
      ...draftRequest, unknown: { contact: "synthetic@example.com" }
    }, "192.0.2.18");

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      error: "Provider export draft request contains unredacted direct identifiers."
    });
  });

  it("scans deeply nested envelope fields and their property names", async () => {
    const serialized = JSON.stringify(draftRequest).slice(0, -1);
    const depth = 8_000;
    for (const [leaf, status] of [["null", 200], ['{"synthetic@example.com":null}', 400]] as const) {
      const body = `${serialized},"unknown":${"[".repeat(depth)}${leaf}${"]".repeat(depth)}}`;
      const response = await postSyntheticDraft(body, "192.0.2.19", true);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store, private");
      if (status === 400) {
        await expect(response.json()).resolves.toEqual({
          error: "Provider export draft request contains unredacted direct identifiers."
        });
      }
    }
  });

  it("preserves private hosted auth and shared-protection failures", async () => {
    vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID", undefined);
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.stubEnv("KV_REST_API_URL", undefined);
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    try {
      const anonymous = await postSyntheticDraft(draftRequest, "192.0.2.20");
      expect(anonymous.status).toBe(401);
      expect(anonymous.headers.get("cache-control")).toBe("no-store, private");
      vi.stubEnv("NODE_ENV", "production");
      const unavailable = await postSyntheticDraft(draftRequest, "192.0.2.20");
      expect(unavailable.status).toBe(503);
      expect(unavailable.headers.get("cache-control")).toBe("no-store, private");
      expect(unavailable.headers.get("retry-after")).toBe("5");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
