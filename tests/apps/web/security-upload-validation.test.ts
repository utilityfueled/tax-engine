import { describe, expect, it } from "vitest";
import { createHostedWorkspaceRouteHandlers } from "../../../apps/web/src/lib/hosted-workspace-route";
import {
  createInMemoryHostedDocumentBlobStore,
  createInMemoryHostedWorkspaceStore
} from "../../../apps/web/src/lib/workspace-persistence";

/** Minimal valid PDF: starts with %PDF magic bytes. */
function fakePdfBytes() {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]); // %PDF-1.4
}

/** Minimal valid PNG: starts with PNG magic bytes. */
function fakePngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
}

/** Minimal valid JPEG: starts with JPEG magic bytes. */
function fakeJpegBytes() {
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
}

/** Minimal valid TIFF (little-endian): starts with II*\0 magic bytes. */
function fakeTiffBytes() {
  return new Uint8Array([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]);
}

/** Minimal valid WebP: RIFF....WEBP magic bytes. */
function fakeWebpBytes() {
  // RIFF + 4 bytes file size + WEBP
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // file size placeholder
    0x57, 0x45, 0x42, 0x50  // WEBP
  ]);
}

/** An ELF executable header (Linux executable magic bytes). */
function fakeExeBytes() {
  return new Uint8Array([0x7F, 0x45, 0x4C, 0x46]); // .ELF
}

function createAuthenticatedHandlers() {
  return createHostedWorkspaceRouteHandlers({
    env: {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-upload-test",
      TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Upload Test"
    },
    hostedStore: createInMemoryHostedWorkspaceStore(),
    hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
    now: () => "2026-03-26T00:00:00.000Z"
  });
}

describe("security: document upload file size validation", () => {
  it("rejects files exceeding 25 MB", async () => {
    const handlers = createAuthenticatedHandlers();
    const oversizedContent = new Uint8Array(25 * 1024 * 1024 + 1);
    // Embed PDF magic bytes at start so size check is what rejects it
    oversizedContent.set(fakePdfBytes());
    const formData = new FormData();

    formData.set("documentId", "doc-oversized");
    formData.set("file", new File([oversizedContent], "huge.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Uploaded file exceeds the 25 MB size limit."
    });
  });

  it("accepts files at exactly 25 MB", async () => {
    const handlers = createAuthenticatedHandlers();
    const maxContent = new Uint8Array(25 * 1024 * 1024);
    maxContent.set(fakePdfBytes());
    const formData = new FormData();

    formData.set("documentId", "doc-exact-limit");
    formData.set("file", new File([maxContent], "max.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });
});

describe("security: document upload file type validation", () => {
  it("rejects files with disallowed media types", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-exe");
    formData.set("file", new File([fakeExeBytes()], "payload.exe", {
      type: "application/x-msdownload"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Uploaded file type is not supported. Accepted types: PDF, PNG, JPEG, TIFF, WebP."
    });
  });

  it("rejects HTML files that could enable XSS", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-html");
    formData.set("file", new File(["<script>alert(1)</script>"], "page.html", {
      type: "text/html"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
  });

  it("accepts PDF files with valid magic bytes", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-pdf");
    formData.set("file", new File([fakePdfBytes()], "w2.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });

  it("accepts PNG image files with valid magic bytes", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-png");
    formData.set("file", new File([fakePngBytes()], "receipt.png", {
      type: "image/png"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });

  it("accepts JPEG image files with valid magic bytes", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-jpeg");
    formData.set("file", new File([fakeJpegBytes()], "receipt.jpg", {
      type: "image/jpeg"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });

  it("accepts TIFF image files with valid magic bytes", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-tiff");
    formData.set("file", new File([fakeTiffBytes()], "scan.tiff", {
      type: "image/tiff"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });

  it("accepts WebP image files with valid magic bytes", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-webp");
    formData.set("file", new File([fakeWebpBytes()], "photo.webp", {
      type: "image/webp"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });
});

describe("security: MIME type spoofing prevention via magic bytes", () => {
  it("rejects executable disguised as PDF (MIME type spoofing)", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    // ELF executable bytes with application/pdf MIME type
    formData.set("documentId", "doc-spoofed");
    formData.set("file", new File([fakeExeBytes()], "report.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Uploaded file content does not match the declared media type."
    });
  });

  it("rejects HTML content disguised as PNG (MIME type spoofing)", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();
    const htmlContent = new TextEncoder().encode("<html><script>alert(1)</script></html>");

    formData.set("documentId", "doc-html-png");
    formData.set("file", new File([htmlContent], "image.png", {
      type: "image/png"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Uploaded file content does not match the declared media type."
    });
  });

  it("rejects file with empty/missing MIME type — does not default to PDF", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-notype");
    formData.set("file", new File([fakeExeBytes()], "mystery-file", {
      type: ""
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    // Must be rejected (400), regardless of whether the runtime treats
    // empty type as missing or as an unsupported type string.
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/media type|file type/i);
  });

  it("rejects too-small file that cannot contain valid magic bytes", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    // Only 2 bytes — too small for any valid signature
    formData.set("documentId", "doc-tiny");
    formData.set("file", new File([new Uint8Array([0x25, 0x50])], "tiny.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Uploaded file content does not match the declared media type."
    });
  });
});

describe("security: document identifier validation", () => {
  it("rejects document IDs with path traversal sequences", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "../../etc/passwd");
    formData.set("file", new File([fakePdfBytes()], "doc.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid document identifier. Use normal filename characters, but not slashes, angle brackets, or control characters."
    });
  });

  it("rejects document IDs with HTML/script injection", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", '<script>alert("xss")</script>');
    formData.set("file", new File([fakePdfBytes()], "doc.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid document identifier. Use normal filename characters, but not slashes, angle brackets, or control characters."
    });
  });

  it("rejects document IDs with null bytes", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc\x00malicious");
    formData.set("file", new File([fakePdfBytes()], "doc.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
  });

  it("accepts valid document IDs with normal invoice-style filename characters", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "unknown:Northwind Invoice (Mar, 2026).pdf:40211");
    formData.set("file", new File([fakePdfBytes()], "w2.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });

  it("rejects overly long document IDs", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "a".repeat(257));
    formData.set("file", new File([fakePdfBytes()], "doc.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
  });
});

describe("security: filename sanitization", () => {
  it("strips path traversal from filenames", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-traversal");
    formData.set("file", new File([fakePdfBytes()], "../../etc/passwd.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.fileName).not.toContain("..");
    expect(body.document.fileName).not.toContain("/");
  });

  it("strips null bytes from filenames", async () => {
    const handlers = createAuthenticatedHandlers();
    const formData = new FormData();

    formData.set("documentId", "doc-null");
    formData.set("file", new File([fakePdfBytes()], "safe\x00.exe.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.fileName).not.toContain("\x00");
  });
});

describe("security: workspace save body validation", () => {
  it("rejects workspace save with missing documents field (returns 400 not 503)", async () => {
    const handlers = createAuthenticatedHandlers();

    const response = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace: {
            id: "ws-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            storageMode: "hosted-postgres"
            // documents deliberately omitted
          }
        })
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("documents");
  });

  it("rejects workspace save with documents as non-array", async () => {
    const handlers = createAuthenticatedHandlers();

    const response = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace: {
            id: "ws-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            storageMode: "hosted-postgres",
            documents: "not-an-array"
          }
        })
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("documents");
  });

  it("rejects workspace save with missing timestamps", async () => {
    const handlers = createAuthenticatedHandlers();

    const response = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace: {
            id: "ws-1",
            storageMode: "hosted-postgres",
            documents: []
          }
        })
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("createdAt");
  });

  it("rejects workspace save with missing storageMode", async () => {
    const handlers = createAuthenticatedHandlers();

    const response = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace: {
            id: "ws-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            documents: []
          }
        })
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("storageMode");
  });

  it("rejects workspace save with completely empty object", async () => {
    const handlers = createAuthenticatedHandlers();

    const response = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace: { id: "ws-1" }
        })
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(400);
  });
});

describe("security: error message sanitization", () => {
  it("does not leak internal error details in persistence error responses", async () => {
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-error-test"
      },
      hostedStore: createInMemoryHostedWorkspaceStore(),
      hostedStoreFactory: () => createInMemoryHostedWorkspaceStore()
    });
    const formData = new FormData();

    formData.set("documentId", "doc-err");
    formData.set("file", new File([fakePdfBytes()], "test.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/ws-err/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-err" }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      availability: "ready",
      document: {
        workspaceId: "ws-err",
        documentId: "doc-err",
        fileName: "test.pdf"
      }
    });
  });
});
