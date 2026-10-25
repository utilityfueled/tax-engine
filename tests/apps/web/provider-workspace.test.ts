vi.mock("server-only", () => ({}));
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ProviderDirectIdentifier,
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord
} from "@tax-engine/contracts";
import { POST } from "../../../apps/web/src/app/api/provider/workspace/route";
import { createProviderWorkspaceRouteHandlers } from "../../../apps/web/src/lib/provider-workspace-route";
import {
  buildProviderWorkspaceRequest,
  ProviderWorkspaceRequestError,
  requestProviderWorkspaceHelp,
  requestProviderWorkspace
} from "../../../apps/web/src/lib/provider-workspace-request";

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

describe("provider workspace request path", () => {
  it("keeps default local-only summaries entirely offline", async () => {
    const fetchFn = vi.fn();
    const result = await requestProviderWorkspace(createWorkspace(), { fetchFn });
    expect(result.response.provider).toBe("mock-local");
    expect(result.request.optedOut).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

    const result = await requestProviderWorkspace(workspace, {
      optedOut: false,
      endpoint: "http://localhost/api/provider/workspace",
      fetchFn,
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.workspace.id).toBe("workspace-[person-name-1]");
    expect(result.request.requestId).toBe("provider-workspace:workspace-[person-name-1]:2026-03-12T00:00:00.000Z");
    expect(result.request.unsupportedRoutes).toEqual([]);
    expect(result.request.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[email-1]", kind: "email" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[postal-code-1]", kind: "postal-code" },
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
    expect(result.response.totalDocuments).toBe(1);
    expect(result.response.pendingQuestionCount).toBe(1);
    expect(result.response.readyForRecompute).toBe(false);
  });

  it("sends a redacted workspace payload through the app request path", async () => {
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

    const result = await requestProviderWorkspace(workspace, {
      optedOut: false,
      endpoint: "http://localhost/api/provider/workspace",
      directIdentifiers: createDirectIdentifiers(),
      fetchFn,
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.workspace.id).toBe("workspace-[person-name-1]");
    expect(result.request.requestId).toBe("provider-workspace:workspace-[person-name-1]:2026-03-12T00:00:00.000Z");
    expect(result.request.unsupportedRoutes).toEqual([]);
    expect(result.request.redactions).toEqual([
      { token: "[person-name-1]", kind: "person-name" },
      { token: "[ssn-1]", kind: "ssn" },
      { token: "[email-1]", kind: "email" },
      { token: "[street-address-1]", kind: "street-address" },
      { token: "[postal-code-1]", kind: "postal-code" },
      { token: "[phone-1]", kind: "phone" }
    ]);
    expect(capturedBody).not.toContain("Jane Doe");
    expect(capturedBody).not.toContain("workspace-jane-doe");
    expect(capturedBody).not.toContain("jane.doe@example.com");
    expect(capturedBody).not.toContain("12 Main Street");
    expect(capturedBody).not.toContain("78701");
    expect(capturedBody).not.toContain("512-555-0100");
    expect(result.response.provider).toBe("mock-local");
    expect(result.response.totalDocuments).toBe(1);
    expect(result.response.pendingQuestionCount).toBe(1);
  });

  it("forwards redacted unsupported routes and summarizes the primary blocker", async () => {
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
    let capturedBody = "";

    const fetchFn: typeof fetch = async (input, init) => {
      capturedBody = typeof init?.body === "string" ? init.body : "";
      return POST(new Request(typeof input === "string" ? input : input.url, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body
      }));
    };

    const result = await requestProviderWorkspace(workspace, {
      optedOut: false,
      endpoint: "http://localhost/api/provider/workspace",
      directIdentifiers: createDirectIdentifiers(),
      fetchFn,
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.unsupportedRoutes).toEqual([
      {
        id: "continue-interview",
        urgency: "now",
        title: "Answer remaining questions",
        description: "You have 1 unanswered question that may affect your return.",
        blockerIds: ["needs-answer:wages-and-withholding"],
        relatedFactIds: ["wages", "withholding"],
        sourceDocumentIds: ["doc-1"],
        reasons: [
          "Wages and withholding still has 1 unanswered interview confirmation(s).",
          "Confirm federal and state withholding amounts from each wage statement."
        ]
      },
      {
        id: "review-filing-pack",
        urgency: "next",
        title: "Download your draft return packet",
        description: "Re-download your draft packet after making changes so the notes and action items stay up to date.",
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
        title: "Consider outside review",
        description: "Download a summary you can share with a tax professional or other advisor you engage separately. This app does not contact, assign, or engage a reviewer for you.",
        blockerIds: ["needs-review:manual-mapping"],
        relatedFactIds: [],
        sourceDocumentIds: ["doc-2"],
        reasons: [
          "[person-name-1] uploaded a broker packet that still needs manual coverage review before deterministic recompute can run.",
          "[person-name-1] broker packet is marked unsupported."
        ]
      }
    ]);
    expect(capturedBody).toContain("\"unsupportedRoutes\"");
    expect(capturedBody).not.toContain("Jane Doe");
    expect(capturedBody).not.toContain("workspace-jane-doe-review");
    expect(result.response.provider).toBe("mock-local");
    expect(result.response.summary).toBe(
      "Workspace has 3 active unsupported route(s). Start with Answer remaining questions. Primary blocker: Wages and withholding still has 1 unanswered interview confirmation(s)."
    );
    expect(result.response.totalDocuments).toBe(2);
    expect(result.response.pendingQuestionCount).toBe(1);
    expect(result.response.readyForRecompute).toBe(false);
  });

  it("includes selected document context in redacted helper requests", () => {
    const workspace = createWorkspace({
      documents: [
        createDocument({}),
        createDocument({
          id: "doc-2",
          name: "1099-int-jane-doe.pdf",
          kind: "1099-int",
          label: "2026 Form 1099-INT",
          notes: "Uploaded by Jane Doe with taxable interest details.",
          matchedFixtureId: "irs-1099-int-2026",
          seededFactIds: ["taxable-interest"]
        })
      ]
    });

    const request = buildProviderWorkspaceRequest(workspace, {
      task: "workspace-help",
      question: "How does this 1099-INT affect this page?",
      selectedDocumentIds: ["doc-2"],
      assistantContext: {
        mode: "guided",
        currentSectionId: "income-investments",
        currentSectionLabel: "Investments",
        conversation: []
      },
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(request.assistantContext?.selectedDocuments).toHaveLength(1);
    expect(request.assistantContext?.selectedDocuments?.[0]).toMatchObject({
      label: "2026 Form 1099-INT",
      kind: "1099-int",
      matchedFixtureId: "irs-1099-int-2026"
    });
    expect(JSON.stringify(request.assistantContext?.selectedDocuments)).not.toContain("Jane Doe");
  });

  it("keeps configured but unqualified provider routes deterministic", async () => {
    const fetchFn = vi.fn();
    const { POST: route } = createProviderWorkspaceRouteHandlers({ env: { OPENAI_API_KEY: "synthetic", GEMINI_API_KEY: "synthetic", MODEL_PROVIDER_MODEL: "gpt-5-mini" }, fetchFn });
    const response = await route(new Request("http://localhost/api/provider/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildProviderWorkspaceRequest(createWorkspace())) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "mock-local", modelId: null });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends minimal redacted workflow facts through the explicit Luna evaluation route", async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json({ status: "completed", usage: { input_tokens: 120, output_tokens: 48 },
      output_text: JSON.stringify({ disposition: "answer", summary: "Review the withholding question.", sourceIds: ["workspace:questions"] }) }));
    const { POST: route } = createProviderWorkspaceRouteHandlers({ execution: { mode: "evaluation", syntheticFixtureId: "workspace-synthetic", apiKey: "fixture-key" }, fetchFn });
    const response = await route(new Request("http://localhost/api/provider/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildProviderWorkspaceRequest(createWorkspace())) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "openai-responses", modelId: "gpt-6-luna", summary: "Review the withholding question.", sourceIds: ["workspace:questions"] });
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse(options.body)).toMatchObject({ store: false, reasoning: { effort: "high" }, prompt_cache_options: { mode: "explicit" } });
    expect(options.body).not.toContain("Jane Doe");
    expect(options.body).not.toContain("123-45-6789");
    expect(options.body).not.toContain("workspace-jane-doe");
    expect(options.body).not.toContain("enginePreview");
  });

  it("uses Gemini only when the trusted evaluation explicitly selects it", async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ disposition: "answer", summary: "Review the withholding question.", sourceIds: ["workspace:questions"] }) }] } }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 48, thoughtsTokenCount: 20 } }));
    const { POST: route } = createProviderWorkspaceRouteHandlers({ execution: { mode: "evaluation", provider: "google", syntheticFixtureId: "workspace-synthetic", apiKey: "fixture-key" }, fetchFn });
    const response = await route(new Request("http://localhost/api/provider/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildProviderWorkspaceRequest(createWorkspace())) }));
    expect(await response.json()).toMatchObject({ provider: "gemini", modelId: "gemini-3.8-flash" });
    expect(fetchFn.mock.calls[0][0]).toContain("gemini-3.8-flash:generateContent");
    expect(fetchFn.mock.calls[0][0]).not.toContain("fixture-key");
  });

  it("requires server-verified year-specific citations for Sol tax explanations", async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json({ status: "completed", usage: { input_tokens: 120, output_tokens: 48 },
      output_text: JSON.stringify({ disposition: "answer", answer: "The verified audit shows $2,200.", sourceIds: ["spec:ctc", "audit:ctc"], engineValues: [{ id: "audit:ctc", value: "2200" }] }) }));
    const request = buildProviderWorkspaceRequest(createWorkspace(), { task: "workspace-help", question: "Explain the credit." });
    const deps = { execution: { mode: "evaluation" as const, syntheticFixtureId: "workspace-help-synthetic", apiKey: "fixture-key" }, fetchFn };
    const first = createProviderWorkspaceRouteHandlers(deps);
    expect(await (await first.POST(new Request("http://localhost/api/provider/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }))).json()).toMatchObject({ provider: "mock-local" });
    expect(fetchFn).not.toHaveBeenCalled();
    const second = createProviderWorkspaceRouteHandlers({ ...deps, resolveTaxContext: () => ({ taxYear: 2025, ruleVersion: "2025.3", excerpts: [{ id: "spec:ctc", taxYear: 2025, text: "Synthetic reviewed source." }],
      auditEntries: [{ id: "audit:ctc", taxYear: 2025, value: "2200", explanation: "Synthetic verified engine output." }] }) });
    const response = await second.POST(new Request("http://localhost/api/provider/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }));
    expect(await response.json()).toMatchObject({ provider: "openai-responses", modelId: "gpt-6.1-sol", usage: { providerCostUsd: "0.00072", usageKind: "reported" } });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).reasoning).toEqual({ effort: "low" });
  });

  it("surfaces structured provider request errors to the client", async () => {
    const workspace = createWorkspace({
      storageMode: "hosted-postgres"
    });

    await expect(requestProviderWorkspaceHelp(workspace, "What should I do next?", {
      optedOut: false,
      endpoint: "http://localhost/api/provider/workspace",
      fetchFn: async () => new Response(JSON.stringify({
        error: "AI helper access requires an active Starter or Plus plan.",
        code: "paid_plan_required",
        billingUrl: "/billing"
      }), {
        status: 403,
        headers: {
          "content-type": "application/json"
        }
      }),
      now: "2026-03-12T00:00:00.000Z",
      assistantContext: {
        mode: "guided",
        currentSectionId: "income-self-employment",
        currentSectionLabel: "Self-Employment",
        conversation: []
      }
    })).rejects.toMatchObject<ProviderWorkspaceRequestError>({
      name: "ProviderWorkspaceRequestError",
      status: 403,
      code: "paid_plan_required",
      billingUrl: "/billing",
      message: "AI helper access requires an active Starter or Plus plan."
    });
  });

  it("allows localhost AI summaries for hosted-saved workspaces when the request is forced into local mode", async () => {
    vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("NODE_ENV", "development");

    const workspace = createWorkspace({
      storageMode: "hosted-postgres"
    });

    const result = await requestProviderWorkspace(workspace, {
      optedOut: false,
      endpoint: "http://localhost/api/provider/workspace",
      fetchFn: async (input, init) => POST(new Request(typeof input === "string" ? input : input.url, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body
      })),
      workspaceStorageModeOverride: "local-browser",
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.workspace.storageMode).toBe("local-browser");
    expect(result.response.provider).toBe("mock-local");
    expect(result.response.totalDocuments).toBe(1);
  });

  it("does not infer filing or download readiness from advisory-only routes", async () => {
    const workspace = createWorkspace({
      summary: {
        totalDocuments: 2,
        officialFixtureMatches: 1,
        supportedDocuments: 1,
        pendingReviewDocuments: 1,
        interviewQuestionsRemaining: 0
      },
      seededReturn: createSeededReturn({
        facts: [
          {
            id: "wages",
            label: "Wages",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "W-2 is final.",
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
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null
      }),
      documents: [
        createDocument({}),
        createDocument({
          id: "doc-2",
          name: "jane-doe-amex-summary.pdf",
          kind: "unknown",
          coverage: "unsupported",
          label: "Year-end card summary",
          notes: "Manual review required for statement details.",
          matchedFixtureId: null,
          seededFactIds: []
        })
      ],
      returnSummary: {
        status: "needs-review",
        targetTaxYear: 2025,
        taxYearState: "single",
        answeredFactCount: 2,
        totalFactCount: 2,
        readyItemCount: 1,
        itemCount: 1,
        blockers: [
          {
            id: "needs-review:unmapped-documents",
            message: "1 uploaded document still needs manual coverage review before deterministic recompute can run.",
            relatedFactIds: [],
            sourceDocumentIds: ["doc-2"]
          }
        ],
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
      }
    });

    const result = await requestProviderWorkspace(workspace, {
      optedOut: false,
      endpoint: "http://localhost/api/provider/workspace",
      fetchFn: async (input, init) => POST(new Request(typeof input === "string" ? input : input.url, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body
      })),
      now: "2026-03-12T00:00:00.000Z"
    });

    expect(result.request.unsupportedRoutes.map((route) => route.id)).toEqual([
      "review-filing-pack",
      "partner-review-later"
    ]);
    expect(result.response.provider).toBe("mock-local");
    expect(result.response.summary).not.toContain("ready to download");
    expect(result.response.summary).toContain("unsupported route");
    expect(result.response.readyForRecompute).toBe(false);
  });

  it("rejects workspace requests that still contain raw direct-identifier patterns", async () => {
    const unsafeRequest = buildProviderWorkspaceRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.workspace.auditTrail[0] = {
      ...unsafeRequest.workspace.auditTrail[0]!,
      message: "Call Jane Doe at 512-555-0100 or email jane.doe@example.com."
    };
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider workspace request contains unredacted direct identifiers."
    });
  });

  it("returns 502 when a configured provider call fails", async () => {
    const request = buildProviderWorkspaceRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });
    const { POST: providerRoute } = createProviderWorkspaceRouteHandlers({
      execution: { mode: "evaluation", syntheticFixtureId: "failure-fixture" },
      env: {
        MODEL_PROVIDER_API_KEY: "test-provider-key"
      },
      fetchFn: async () => new Response("upstream error", { status: 500 })
    });

    const response = await providerRoute(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Configured provider workspace request failed."
    });
  });

  it("rejects workspace requests that contain unredacted structured identifiers like DOBs and street addresses", async () => {
    const unsafeRequest = buildProviderWorkspaceRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.workspace.seededReturn.reviewNotes = [
      "Verify date of birth: 1988-02-14 and mail the summary to 12 Main Street, Austin TX 78701."
    ];
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider workspace request contains unredacted direct identifiers."
    });
  });

  it("rejects workspace requests that leak undelimited SSNs in filenames or notes", async () => {
    const unsafeRequest = buildProviderWorkspaceRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.workspace.documents[0] = {
      ...unsafeRequest.workspace.documents[0]!,
      name: "redacted-holder-123456789-w2.pdf",
      notes: "Reach the filer after verifying copy 123456789."
    };
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider workspace request contains unredacted direct identifiers."
    });
  });

  it("rejects workspace requests that leak raw person names without other identifier patterns", async () => {
    const unsafeRequest = buildProviderWorkspaceRequest(createWorkspace(), {
      now: "2026-03-12T00:00:00.000Z"
    });

    unsafeRequest.requestId = "provider-workspace:workspace-jane-doe:2026-03-12T00:00:00.000Z";
    unsafeRequest.workspace.auditTrail[0] = {
      ...unsafeRequest.workspace.auditTrail[0]!,
      message: "Jane Doe confirmed the withholding amount."
    };
    unsafeRequest.redactions = [];
    unsafeRequest.replacementCount = 0;

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(unsafeRequest)
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provider workspace request contains unredacted direct identifiers."
    });
  });
});
