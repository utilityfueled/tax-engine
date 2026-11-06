vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { safeParseJsonBody, safeReadTextBody } from "../../../apps/web/src/lib/safe-body-parser";
import { createProviderWorkspaceRouteHandlers } from "../../../apps/web/src/lib/provider-workspace-route";
import { createHostedWorkspaceRouteHandlers } from "../../../apps/web/src/lib/hosted-workspace-route";
import { createHostedBillingCheckoutRouteHandlers } from "../../../apps/web/src/lib/hosted-billing";
import {
  createInMemoryHostedDocumentBlobStore,
  createInMemoryHostedWorkspaceStore
} from "../../../apps/web/src/lib/workspace-persistence";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";

const NOW = "2026-03-27T00:00:00.000Z";

function jsonRequest(url: string, body: unknown, contentType = "application/json") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body)
  });
}

function rawRequest(url: string, body: string, contentType?: string) {
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["content-type"] = contentType;
  }

  return new Request(url, {
    method: "POST",
    headers,
    body
  });
}

// ---------------------------------------------------------------------------
// Content-Type enforcement
// ---------------------------------------------------------------------------

describe("security: Content-Type enforcement on JSON routes", () => {
  it("rejects requests without Content-Type header (HTTP 415)", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", '{"valid": true}')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(415);
      expect(result.error).toBe("Content-Type must be application/json.");
    }
  });

  it("rejects text/plain Content-Type — blocks CSRF via form enctype=text/plain", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", '{"valid": true}', "text/plain")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(415);
    }
  });

  it("rejects application/x-www-form-urlencoded — blocks CSRF via default form POST", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", "key=value", "application/x-www-form-urlencoded")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(415);
    }
  });

  it("rejects multipart/form-data Content-Type on JSON routes", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", "data", "multipart/form-data; boundary=abc")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(415);
    }
  });

  it("accepts application/json Content-Type", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", '{"valid": true}', "application/json")
    );

    expect(result.ok).toBe(true);
  });

  it("accepts application/json with charset parameter", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", '{"valid": true}', "application/json; charset=utf-8")
    );

    expect(result.ok).toBe(true);
  });

  it("accepts application/json case-insensitively", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", '{"valid": true}', "Application/JSON")
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Content-Type enforcement on actual routes
// ---------------------------------------------------------------------------

describe("security: Content-Type enforcement on provider workspace route", () => {
  it("rejects provider request with text/plain content type", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "self-host" }
    });

    const response = await POST(
      rawRequest("http://localhost/api/provider/workspace", '{"task":"workspace-summary"}', "text/plain")
    );

    expect(response.status).toBe(415);
    const body = await response.json();
    expect(body.error).toBe("Content-Type must be application/json.");
  });
});

describe("security: Content-Type enforcement on billing checkout route", () => {
  it("rejects checkout request with missing content type", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
      }
    });

    const response = await POST(
      rawRequest("http://localhost/api/billing/checkout", '{"planId":"starter"}')
    );

    expect(response.status).toBe(415);
  });
});

describe("security: Content-Type enforcement on workspace save route", () => {
  it("rejects workspace save with text/plain content type", async () => {
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
      },
      hostedStore: createInMemoryHostedWorkspaceStore(),
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    const response = await handlers.save(
      rawRequest("http://localhost/api/hosted/workspaces/ws-1", '{"workspace":{}}', "text/plain"),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(415);
  });
});

// ---------------------------------------------------------------------------
// JSON body size limits
// ---------------------------------------------------------------------------

describe("security: JSON body size limits", () => {
  it("rejects body exceeding default 1 MB limit on standard routes", async () => {
    const result = await safeParseJsonBody(
      rawRequest(
        "http://localhost/api/test",
        `{"data":"${"x".repeat(1024 * 1024 + 1)}"}`,
        "application/json"
      )
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error).toContain("1 MB");
    }
  });

  it("rejects body exceeding 5 MB limit on workspace save routes", async () => {
    const result = await safeParseJsonBody(
      rawRequest(
        "http://localhost/api/test",
        `{"data":"${"x".repeat(5 * 1024 * 1024 + 1)}"}`,
        "application/json"
      ),
      5 * 1024 * 1024
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });

  it("rejects when content-length header declares oversized body before reading", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(100 * 1024 * 1024)
      },
      body: '{"small": true}'
    });

    const result = await safeParseJsonBody(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid JSON handling
// ---------------------------------------------------------------------------

describe("security: invalid JSON handling", () => {
  it("rejects syntactically invalid JSON", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", "{not valid json}", "application/json")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe("Invalid JSON in request body.");
    }
  });

  it("rejects empty body", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", "", "application/json")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe("Invalid JSON in request body.");
    }
  });

  it("rejects truncated JSON", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", '{"key": "val', "application/json")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// Webhook body size limit (safeReadTextBody)
// ---------------------------------------------------------------------------

describe("security: webhook raw body size limits", () => {
  it("rejects raw body exceeding 64 KB webhook limit", async () => {
    const WEBHOOK_MAX = 64 * 1024;
    const result = await safeReadTextBody(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        body: "x".repeat(WEBHOOK_MAX + 1)
      }),
      WEBHOOK_MAX
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });
});

// ---------------------------------------------------------------------------
// Workspace ID validation
// ---------------------------------------------------------------------------

describe("security: workspace ID input validation", () => {
  const handlers = createHostedWorkspaceRouteHandlers({
    env: {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
    },
    hostedStore: createInMemoryHostedWorkspaceStore(),
    hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
    now: () => NOW
  });

  it("rejects workspace ID with path traversal (../)", async () => {
    const response = await handlers.get(
      new Request("http://localhost/api/hosted/workspaces/../admin"),
      { workspaceId: "../admin" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid workspace identifier.");
  });

  it("rejects workspace ID with special characters", async () => {
    const response = await handlers.get(
      new Request("http://localhost/api/hosted/workspaces/<script>"),
      { workspaceId: "<script>" }
    );

    expect(response.status).toBe(400);
  });

  it("rejects workspace ID with spaces", async () => {
    const response = await handlers.get(
      new Request("http://localhost/api/hosted/workspaces/ws%20injected"),
      { workspaceId: "ws injected" }
    );

    expect(response.status).toBe(400);
  });

  it("rejects empty workspace ID", async () => {
    const response = await handlers.get(
      new Request("http://localhost/api/hosted/workspaces/"),
      { workspaceId: "" }
    );

    expect(response.status).toBe(400);
  });

  it("rejects workspace ID exceeding 128 characters", async () => {
    const longId = "a".repeat(129);
    const response = await handlers.get(
      new Request(`http://localhost/api/hosted/workspaces/${longId}`),
      { workspaceId: longId }
    );

    expect(response.status).toBe(400);
  });

  it("accepts valid workspace ID with alphanumeric, hyphens, underscores", async () => {
    const response = await handlers.get(
      new Request("http://localhost/api/hosted/workspaces/ws-test_123"),
      { workspaceId: "ws-test_123" }
    );

    // Should not be 400 — may be 200 (not found) but passes validation
    expect(response.status).not.toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Provider route type guard validation
// ---------------------------------------------------------------------------

describe("security: provider workspace route rejects malformed payloads", () => {
  const createHandlers = () =>
    createProviderWorkspaceRouteHandlers({
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "self-host" }
    });

  it("rejects non-object body (string)", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/provider/workspace", "just a string")
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid provider workspace request.");
  });

  it("rejects non-object body (array)", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/provider/workspace", [1, 2, 3])
    );

    expect(response.status).toBe(400);
  });

  it("rejects non-object body (number)", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/provider/workspace", 42)
    );

    expect(response.status).toBe(400);
  });

  it("rejects non-object body (null)", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/provider/workspace", null)
    );

    expect(response.status).toBe(400);
  });

  it("rejects object with wrong task value", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/provider/workspace", {
        task: "evil-task",
        requestId: "req-1",
        requestedAt: NOW,
        workspace: {},
        unsupportedRoutes: [],
        redactions: [],
        replacementCount: 0
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects object with missing required fields", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/provider/workspace", {
        task: "workspace-summary"
        // missing requestId, requestedAt, workspace, etc.
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects object with wrong type for required fields", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/provider/workspace", {
        task: "workspace-summary",
        requestId: 12345, // should be string
        requestedAt: NOW,
        workspace: {},
        unsupportedRoutes: [],
        redactions: [],
        replacementCount: "not-a-number" // should be number
      })
    );

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Workspace save payload validation
// ---------------------------------------------------------------------------

describe("security: workspace save rejects malformed payloads", () => {
  const createHandlers = () =>
    createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
      },
      hostedStore: createInMemoryHostedWorkspaceStore(),
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

  it("rejects save when workspace object is missing", async () => {
    const handlers = createHandlers();
    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", { noWorkspace: true }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("workspace snapshot");
  });

  it("rejects save when workspace is a string instead of object", async () => {
    const handlers = createHandlers();
    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", { workspace: "not-an-object" }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
  });

  it("rejects save when workspace ID does not match route parameter", async () => {
    const handlers = createHandlers();
    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", {
        workspace: {
          id: "ws-DIFFERENT",
          documents: [],
          createdAt: NOW,
          updatedAt: NOW,
          storageMode: "hosted-postgres"
        }
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("must match");
  });

  it("rejects save when documents is not an array", async () => {
    const handlers = createHandlers();
    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", {
        workspace: {
          id: "ws-1",
          documents: "not-an-array",
          createdAt: NOW,
          updatedAt: NOW,
          storageMode: "hosted-postgres"
        }
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("documents array");
  });

  it("rejects save when timestamps are missing", async () => {
    const handlers = createHandlers();
    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", {
        workspace: {
          id: "ws-1",
          documents: [],
          storageMode: "hosted-postgres"
        }
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("createdAt and updatedAt");
  });

  it("rejects save when storageMode is missing", async () => {
    const handlers = createHandlers();
    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", {
        workspace: {
          id: "ws-1",
          documents: [],
          createdAt: NOW,
          updatedAt: NOW
        }
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("storageMode");
  });
});

// ---------------------------------------------------------------------------
// Billing checkout input validation
// ---------------------------------------------------------------------------

describe("security: billing checkout rejects malformed payloads", () => {
  const createHandlers = () =>
    createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1",
        TAX_ENGINE_APP_URL: "https://tax.example.com"
      }
    });

  it("rejects checkout with invalid plan ID", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "nonexistent-plan",
        successUrl: "https://tax.example.com/success",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid hosted billing checkout request.");
  });

  it("rejects checkout with external redirect URL (open redirect prevention)", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "starter",
        successUrl: "https://evil.com/steal-tokens",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects checkout with javascript: protocol in redirect URL", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "starter",
        successUrl: "javascript:alert(1)",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects checkout with data: URI in redirect URL", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "starter",
        successUrl: "data:text/html,<script>alert(1)</script>",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects checkout with empty body", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {})
    );

    expect(response.status).toBe(400);
  });

  it("rejects checkout with invalid workspaceId format (path traversal)", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "starter",
        workspaceId: "../../../etc/passwd",
        successUrl: "https://tax.example.com/success",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid hosted billing checkout request.");
  });

  it("rejects checkout with workspaceId containing special characters", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "starter",
        workspaceId: "ws<script>alert(1)</script>",
        successUrl: "https://tax.example.com/success",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects checkout with oversized workspaceId", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "starter",
        workspaceId: "x".repeat(200),
        successUrl: "https://tax.example.com/success",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    expect(response.status).toBe(400);
  });

  it("accepts checkout with valid workspaceId format", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "starter",
        workspaceId: "ws-valid_123",
        successUrl: "https://tax.example.com/success",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    // Should not be 400 — the workspaceId is valid
    expect(response.status).not.toBe(400);
  });

  it("accepts checkout without workspaceId (optional field)", async () => {
    const { POST } = createHandlers();
    const response = await POST(
      jsonRequest("http://localhost/api/billing/checkout", {
        planId: "starter",
        successUrl: "https://tax.example.com/success",
        cancelUrl: "https://tax.example.com/cancel"
      })
    );

    expect(response.status).not.toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Error messages do not leak internal details
// ---------------------------------------------------------------------------

describe("security: error messages are generic and safe", () => {
  it("safeParseJsonBody error for invalid JSON does not include the payload content", async () => {
    const sensitivePayload = 'SSN: 123-45-6789, password: hunter2';
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", sensitivePayload, "application/json")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("123-45-6789");
      expect(result.error).not.toContain("hunter2");
      expect(result.error).toBe("Invalid JSON in request body.");
    }
  });

  it("Content-Type error does not reveal which types are accepted", async () => {
    const result = await safeParseJsonBody(
      rawRequest("http://localhost/api/test", '{}', "text/xml")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Message says what's required but doesn't enumerate all rejected types
      expect(result.error).toBe("Content-Type must be application/json.");
    }
  });
});

// ---------------------------------------------------------------------------
// Streaming body size enforcement (aborts mid-stream, does not buffer all)
// ---------------------------------------------------------------------------

describe("security: streaming body size enforcement", () => {
  it("rejects oversized body via streaming when Content-Length is absent", async () => {
    // Simulate a request without Content-Length whose body exceeds the limit.
    // The streaming reader should abort as soon as cumulative bytes exceed the limit,
    // rather than buffering the entire body into memory first.
    const maxSize = 1024; // 1 KB
    const oversizedBody = "x".repeat(maxSize + 500);

    // Create a ReadableStream that delivers the body in small chunks
    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(oversizedBody);
    let offset = 0;
    const chunkSize = 256;

    const stream = new ReadableStream({
      pull(controller) {
        if (offset >= fullBytes.length) {
          controller.close();
          return;
        }

        const end = Math.min(offset + chunkSize, fullBytes.length);
        controller.enqueue(fullBytes.slice(offset, end));
        offset = end;
      }
    });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: stream,
      // @ts-expect-error -- duplex is needed for streaming bodies in Node.js
      duplex: "half"
    });

    // Remove Content-Length so the pre-check doesn't catch it
    // (Request constructor may or may not set it depending on runtime)
    const result = await safeReadTextBody(request, maxSize);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error).toContain("too large");
    }
  });

  it("accepts body within streaming limit when Content-Length is absent", async () => {
    const maxSize = 1024;
    const body = "x".repeat(maxSize - 10);

    const result = await safeReadTextBody(
      new Request("http://localhost/api/test", {
        method: "POST",
        body
      }),
      maxSize
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe(body);
    }
  });
});

describe("security: body read timeout (slow loris protection)", () => {
  it("rejects body reads that exceed the timeout", async () => {
    // Simulate a request whose .text() never resolves within the timeout
    const neverResolves = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" }
    });

    // Override .text() to return a promise that never settles (within our short timeout)
    const originalText = neverResolves.text.bind(neverResolves);
    Object.defineProperty(neverResolves, "text", {
      value: () => new Promise<string>(() => {
        // Intentionally never resolves
      })
    });

    const result = await safeReadTextBody(neverResolves, 1024 * 1024, 50);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Failed to read request body.");
      expect(result.status).toBe(400);
    }
  });

  it("succeeds when body arrives within the timeout", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"hello":"world"}'
    });

    const result = await safeReadTextBody(request, 1024 * 1024, 5000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe('{"hello":"world"}');
    }
  });
});

// ---------------------------------------------------------------------------
// Resource exhaustion: document count per workspace
// ---------------------------------------------------------------------------

describe("security: document count limit per workspace", () => {
  function createHandlers() {
    return createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
      },
      hostedStore: createInMemoryHostedWorkspaceStore(),
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });
  }

  it("rejects workspace save with more than 500 documents", async () => {
    const handlers = createHandlers();
    const documents = Array.from({ length: 501 }, (_, i) => ({
      id: `doc-${i}`,
      label: `Document ${i}`,
      kind: "w-2" as const
    }));

    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", {
        workspace: {
          id: "ws-1",
          documents,
          createdAt: NOW,
          updatedAt: NOW,
          storageMode: "hosted-postgres"
        }
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("document limit");
    expect(body.error).toContain("500");
  });

  it("accepts workspace save with exactly 500 documents", async () => {
    const handlers = createHandlers();
    const documents = Array.from({ length: 500 }, (_, i) => ({
      id: `doc-${i}`,
      label: `Document ${i}`,
      kind: "w-2" as const
    }));

    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", {
        workspace: {
          id: "ws-1",
          documents,
          createdAt: NOW,
          updatedAt: NOW,
          storageMode: "hosted-postgres"
        }
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });

  it("accepts workspace save with zero documents", async () => {
    const handlers = createHandlers();

    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-1", {
        workspace: {
          id: "ws-1",
          documents: [],
          createdAt: NOW,
          updatedAt: NOW,
          storageMode: "hosted-postgres"
        }
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Resource exhaustion: workspace count per user
// ---------------------------------------------------------------------------

describe("security: workspace count limit per user", () => {
  it("rejects creating a new workspace via save when user has 200 workspaces", async () => {
    const store = createInMemoryHostedWorkspaceStore();

    // Pre-populate 200 workspaces for the test actor
    for (let i = 0; i < 200; i++) {
      store.save("actor-limit", createWorkspaceRecord(`ws-existing-${i}`, {
        now: NOW,
        storageMode: "hosted-postgres"
      }));
    }

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-limit"
      },
      hostedStore: store,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    // Try to create workspace #201
    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-new-201", {
        workspace: {
          id: "ws-new-201",
          documents: [],
          createdAt: NOW,
          updatedAt: NOW,
          storageMode: "hosted-postgres"
        }
      }),
      { workspaceId: "ws-new-201" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("maximum number of returns");
    expect(body.error).toContain("200");
  });

  it("allows updating an existing workspace when user has 200 workspaces", async () => {
    const store = createInMemoryHostedWorkspaceStore();

    // Pre-populate 200 workspaces for the test actor
    for (let i = 0; i < 200; i++) {
      store.save("actor-limit", createWorkspaceRecord(`ws-existing-${i}`, {
        now: NOW,
        storageMode: "hosted-postgres"
      }));
    }

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-limit"
      },
      hostedStore: store,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    // Updating an existing workspace should still work
    const response = await handlers.save(
      jsonRequest("http://localhost/api/hosted/workspaces/ws-existing-0", {
        workspace: {
          id: "ws-existing-0",
          documents: [],
          createdAt: NOW,
          updatedAt: NOW,
          storageMode: "hosted-postgres"
        }
      }),
      { workspaceId: "ws-existing-0" }
    );

    expect(response.status).toBe(200);
  });

  it("rejects auto-creating a workspace via get?create=1 when user has 200 workspaces", async () => {
    const store = createInMemoryHostedWorkspaceStore();

    for (let i = 0; i < 200; i++) {
      store.save("actor-limit", createWorkspaceRecord(`ws-existing-${i}`, {
        now: NOW,
        storageMode: "hosted-postgres"
      }));
    }

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-limit"
      },
      hostedStore: store,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    const response = await handlers.get(
      new Request("http://localhost/api/hosted/workspaces/ws-auto-new?create=1"),
      { workspaceId: "ws-auto-new" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("maximum number of returns");
  });

  it("allows auto-creating when user has fewer than 200 workspaces", async () => {
    const store = createInMemoryHostedWorkspaceStore();

    store.save("actor-ok", createWorkspaceRecord("ws-1", {
      now: NOW,
      storageMode: "hosted-postgres"
    }));

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-ok"
      },
      hostedStore: store,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    const response = await handlers.get(
      new Request("http://localhost/api/hosted/workspaces/ws-auto-new?create=1"),
      { workspaceId: "ws-auto-new" }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workspace).not.toBeNull();
    expect(body.workspace.id).toBe("ws-auto-new");
  });
});
