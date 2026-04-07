import { describe, expect, it } from "vitest";
import {
  cacheWorkspaceDocumentFiles,
  getCachedWorkspaceDocumentFile,
  hasCachedWorkspaceDocumentFile,
} from "../../../apps/web/src/lib/workspace-document-file-cache";

describe("workspace document file cache", () => {
  it("stores and retrieves cached files by workspace and document id", async () => {
    const file = new File(["hello world"], "invoice.pdf", { type: "application/pdf" });

    await cacheWorkspaceDocumentFiles("workspace-1", [
      {
        documentId: "doc-1",
        uploadedAt: "2026-04-04T05:00:00.000Z",
        file,
      },
    ]);

    const restoredFile = await getCachedWorkspaceDocumentFile("workspace-1", "doc-1");

    expect(restoredFile).not.toBeNull();
    expect(restoredFile?.name).toBe("invoice.pdf");
    expect(restoredFile?.type).toBe("application/pdf");
    await expect(restoredFile?.text()).resolves.toBe("hello world");
  });

  it("reports whether a cached file is available", async () => {
    const file = new File(["cached"], "paystub.pdf", { type: "application/pdf" });

    await cacheWorkspaceDocumentFiles("workspace-2", [
      {
        documentId: "doc-2",
        uploadedAt: "2026-04-04T05:00:00.000Z",
        file,
      },
    ]);

    await expect(hasCachedWorkspaceDocumentFile("workspace-2", "doc-2")).resolves.toBe(true);
    await expect(hasCachedWorkspaceDocumentFile("workspace-2", "missing-doc")).resolves.toBe(false);
  });
});
