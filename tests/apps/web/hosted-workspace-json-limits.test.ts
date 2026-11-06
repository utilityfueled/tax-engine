import { describe, expect, it, vi } from "vitest";
import { createHostedWorkspaceRouteHandlers } from "../../../apps/web/src/lib/hosted-workspace-route";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";
import {
  createInMemoryHostedDocumentBlobStore,
  createInMemoryHostedWorkspaceStore,
  savePersistedWorkspace
} from "../../../apps/web/src/lib/workspace-persistence";

// Spec: federal/hosted-workspace-json-limits.yaml
const FOUR_MIB = 4 * 1024 * 1024;
const FIVE_MIB = 5 * 1024 * 1024;
const url = "https://tax.example/api/hosted/workspaces/json-bounds";
const context = { workspaceId: "json-bounds" };
function fixture() {
  return createWorkspaceRecord(context.workspaceId, {
    now: "2026-11-04T00:00:00.000Z",
    storageMode: "local-browser",
    createdMessage: "Actual synthetic local source; preserve exactly."
  });
}
function setup(vercel?: string) {
  const store = createInMemoryHostedWorkspaceStore();
  const blobs = createInMemoryHostedDocumentBlobStore();
  const save = vi.spyOn(store, "save");
  const reconcile = vi.spyOn(blobs, "reconcileWorkspace");
  const handlers = createHostedWorkspaceRouteHandlers({
    env: {
      NODE_ENV: "development",
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "json-boundary-owner",
      ...(vercel === undefined ? {} : { VERCEL: vercel })
    },
    hostedStore: store,
    hostedDocumentBlobStore: blobs
  });
  return { handlers, save, reconcile };
}
function bodyOfSize(bytes: number, multibyte = false) {
  const base = JSON.stringify({ workspace: fixture(), padding: "" });
  const remaining = bytes - Buffer.byteLength(base);
  expect(remaining).toBeGreaterThan(0);
  // Exact UTF8 count, even when each padding character occupies two bytes.
  const padding = multibyte
    ? "é".repeat(Math.floor(remaining / 2)) + " ".repeat(remaining % 2)
    : " ".repeat(remaining);
  const body = JSON.stringify({ workspace: fixture(), padding });
  expect(Buffer.byteLength(body)).toBe(bytes);
  return body;
}
function request(body: string) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}

describe("workspace JSON transport limits", () => {
  it.each([
    ["exact limit", FOUR_MIB, false, 200],
    ["one byte over", FOUR_MIB + 1, false, 413],
    ["multibyte one byte over", FOUR_MIB + 1, true, 413]
  ] as const)("Vercel workspace JSON enforces exact UTF8 byte bounds %s", async (_label, bytes, multibyte, status) => {
    const { handlers, save, reconcile } = setup("1");
    const body = bodyOfSize(bytes, multibyte);
    if (multibyte) expect(body.length).toBeLessThan(FOUR_MIB);
    const response = await handlers.save(request(body), context);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(save).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    expect(reconcile).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    if (status === 413) await expect(response.json()).resolves.toEqual({
      error: "Request body too large. Maximum allowed size is 4 MB."
    });
  });

  it.each([undefined, "0", "true"])("other workspace servers retain the existing five MiB boundary %s", async vercel => {
    const { handlers, save, reconcile } = setup(vercel);
    const atLimit = await handlers.save(request(bodyOfSize(FIVE_MIB)), context);
    expect(atLimit.status).toBe(200);
    const overLimit = await handlers.save(request(bodyOfSize(FIVE_MIB + 1)), context);
    expect(overLimit.status).toBe(413);
    expect(save).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("declared oversized Vercel workspace JSON rejects before reading or writing", async () => {
    const { handlers, save, reconcile } = setup("1");
    const req = request("{}");
    req.headers.set("content-length", String(FOUR_MIB + 1));
    const body = req.body;
    if (!body) throw new Error("Boundary fixture requires an actual request stream.");
    const read = vi.spyOn(body, "getReader");
    const response = await handlers.save(req, context);
    expect(response.status).toBe(413);
    expect(read).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it.each([
    ["text/plain", "FUNCTION_PAYLOAD_TOO_LARGE PRIVATE-SERVER-MARKER"],
    ["text/html", "<html>PRIVATE-SERVER-MARKER</html>"],
    ["application/json", '{"error":"PRIVATE-SERVER-MARKER"}']
  ])("workspace save handles a platform413 without reading its body %s", async (contentType, body) => {
    const workspace = fixture();
    const original = structuredClone(workspace);
    const response = new Response(body, { status: 413, headers: { "content-type": contentType } });
    const json = vi.spyOn(response, "json");
    const text = vi.spyOn(response, "text");
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(savePersistedWorkspace({ deploymentMode: "hosted", workspace, fetchFn })).rejects.toThrow(
      "This return is too large for the server to save. Export a full backup to keep your facts and documents."
    );
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(workspace).toEqual(original);
  });

  it("large self-host workspace stays local with all facts preserved", async () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: key => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); }
    };
    const workspace = fixture();
    const event = workspace.auditTrail[0];
    if (!event) throw new Error("Local snapshot fixture requires its actual creation event.");
    const message = "Actual local source ".repeat(300000);
    event.message = message;
    const original = structuredClone(workspace);
    expect(Buffer.byteLength(JSON.stringify(workspace))).toBeGreaterThan(FIVE_MIB);
    const fetchFn = vi.fn<typeof fetch>();
    const saved = await savePersistedWorkspace({ deploymentMode: "self-host", workspace, browserStorage: storage, fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(workspace).toEqual(original);
    expect(saved.workspace.auditTrail[0]?.message).toBe(message);
    expect([...values.values()].some(value => value.includes(message))).toBe(true);
  });
});
