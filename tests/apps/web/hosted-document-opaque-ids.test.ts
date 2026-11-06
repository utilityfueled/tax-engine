import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialFlowState } from "../../../apps/web/src/lib/guided-interview-flow";
import { createHostedPostgresWorkspaceStoreFactory } from "../../../apps/web/src/lib/hosted-postgres-workspace-store";
import { isWorkspaceShellPersistable, sanitizeWorkspaceForHostedStorage } from "../../../apps/web/src/lib/hosted-privacy";
import { containsUnsafeDirectIdentifier } from "../../../apps/web/src/lib/provider-request-privacy";
import { getHostedPersistenceRuntimeConfig, loadPersistedWorkspace, savePersistedWorkspace } from "../../../apps/web/src/lib/workspace-persistence";
import { reconcileWorkspaceGuidedState } from "../../../apps/web/src/lib/workspace-guided-state";
import { exportWorkspaceRecovery, importWorkspaceRecovery, type RecoveryDocumentStore } from "../../../apps/web/src/lib/workspace-recovery";
import { answerWorkspaceInterviewQuestion, createWorkspaceRecord, getWorkspace, ingestFilesIntoWorkspace, saveWorkspaceSnapshot, syncGuidedFlowToWorkspace, WORKSPACE_STORAGE_KEY } from "../../../apps/web/src/lib/workspace-storage";

// spec: spec/federal/hosted-document-opaque-ids.yaml
// No future identity-helper import. All observations go through existing APIs.
const expected = {
  "ordinary": "hdoc:v1:a0:3d:88:79:f2:8d:01:a3:80:8c:26:5b:91:b8:4a:d0:c9:65:09:e0:d0:ef:bb:65:c4:5d:36:f3:42:81:e6:9c",
  "filename": "hdoc:v1:ca:83:e3:de:11:38:42:ee:84:bf:67:94:ae:2c:d4:43:db:1c:70:47:62:a5:fe:3d:15:15:34:80:73:56:76:98",
  "private-filename": "hdoc:v1:ef:69:ed:c0:2d:f8:e3:cd:d9:3a:a4:c7:b8:c5:33:cf:e3:b6:b6:77:cf:33:48:40:0e:03:e2:2e:9f:54:91:89",
  "unicode-filename": "hdoc:v1:55:9b:3d:64:71:3c:c4:79:94:f4:c8:f1:a5:85:d0:9d:7e:ce:0d:a5:95:25:8e:c8:9f:54:e9:b2:83:d7:ca:b3",
  "duplicate": "hdoc:v1:21:6c:2b:62:44:69:77:42:30:1b:26:51:ce:93:9c:2f:01:89:70:c3:01:fa:d4:80:0c:a6:2c:4a:3b:ee:de:0a",
  "workspace-scope": "hdoc:v1:39:c3:94:1f:4a:a4:4c:22:68:d0:46:d9:94:98:5f:33:aa:dc:e2:da:3c:41:dc:44:ec:55:ed:6c:1c:72:a0:67",
  "tuple-delimiter-a": "hdoc:v1:9e:34:f8:22:06:b1:c1:fb:06:d7:5f:71:97:85:5c:61:5b:4e:f3:3e:99:61:dc:9c:dd:b6:b6:69:6d:39:44:61",
  "tuple-delimiter-b": "hdoc:v1:c4:14:2a:87:04:f1:8e:04:71:91:13:cb:b2:30:53:ad:95:f9:24:a5:ee:e6:23:16:32:d6:05:08:cc:ac:e5:d1"
};
const canonical = /^hdoc:v1:(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/u;
const now = "2026-11-04T12:00:00.000Z";
const wid = "opaque-workspace-42";
const privateName = "Casey-Sample-W2.pdf";
const rawId = "w2:Casey-Sample-W2.pdf:100";
const db = vi.hoisted(() => ({ rows: new Map<string, ReturnWorkspaceRecord>(), query: vi.fn() }));
vi.mock("../../../apps/web/src/lib/hosted-server-db", () => ({
  ensureHostedAppSchema: vi.fn(async () => undefined),
  getHostedServerDatabase: vi.fn(async () => ({ pool: { query: db.query } })),
}));
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("Required synthetic fixture missing");
  return value;
}
function first<T>(values: T[]): T { return required(values[0]); }
function localStorageFixture(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); },
    clear: () => { values.clear(); }, key: index => [...values.keys()][index] ?? null };
}
function empty(id = wid) { return createWorkspaceRecord(id, { now, storageMode: "hosted-postgres" }); }
function uploaded(name = privateName, id = wid) {
  return ingestFilesIntoWorkspace(empty(id), [{ name, size: 100, detectedDocument: {
    kind: "w2", coverage: "supported", taxYear: 2025, label: "Form W-2", notes: "Local source only",
    seededFactIds: ["wages", "withholding"], detectedFacts: [],
  } }]);
}
function rawWorkspace() { return uploaded(); }
function shellFetch(shell?: ReturnWorkspaceRecord) {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const sent = init?.body ? (JSON.parse(String(init.body)) as { workspace: ReturnWorkspaceRecord }).workspace : shell;
    return Response.json({ availability: "ready", ownerScope: { ownerId: "synthetic-owner", ownerLabel: null,
      scopeKey: "hosted-owner:synthetic-owner" }, workspace: sent, workspaces: sent ? [sent] : [] });
  });
}
function deny(workspace: ReturnWorkspaceRecord) {
  expect(isWorkspaceShellPersistable(workspace)).toBe(false);
  expect(() => sanitizeWorkspaceForHostedStorage(workspace)).toThrow(/workspace shell/iu);
}
async function cacheApi() {
  vi.resetModules();
  return import("../../../apps/web/src/lib/workspace-document-file-cache");
}
function originalFile(name = privateName) {
  const bytes = new Uint8Array(100); bytes.set([0, 1, 2, 255, 8]);
  return new File([bytes], name, { type: "application/pdf", lastModified: 1234567 });
}
async function assertFile(file: File | null, name = privateName) {
  expect(file).not.toBeNull();
  const actual = required(file);
  expect(actual.name).toBe(name); expect(actual.type).toBe("application/pdf"); expect(actual.lastModified).toBe(1234567);
  const expectedBytes = new Uint8Array(100); expectedBytes.set([0, 1, 2, 255, 8]);
  expect(actual.size).toBe(100); expect(new Uint8Array(await actual.arrayBuffer())).toEqual(expectedBytes);
}

// Contract fixture only: asynchronous open/get/cursor/put/delete with retained records.
// It deliberately outlives module memory resets; no real browser durability claim.
interface CacheRow {
  key: string; workspaceId: string; documentId: string; fileName: string; mediaType: string;
  uploadedAt: string; lastModified: number; file: Blob;
}
function cachedRow(workspaceId = wid, documentId = rawId, legacy = false): CacheRow {
  return { key: legacy ? `${workspaceId}:${documentId}` : JSON.stringify([workspaceId, documentId]),
    workspaceId, documentId, fileName: privateName, mediaType: "application/pdf", uploadedAt: now,
    lastModified: 1234567, file: originalFile() };
}
function idbFixture(initial: CacheRow[], abortOnCursor = false) {
  const rows = new Map(initial.map(row => [row.key, { ...row }]));
  const writes = vi.fn();
  type Callback = (() => void) | null;
  function request() { return { result: undefined as unknown, onsuccess: null as Callback, onerror: null as Callback,
    onblocked: null as Callback, onupgradeneeded: null as Callback }; }
  const factory = { open: vi.fn(() => {
    const open = request();
    const database = { close: vi.fn(), objectStoreNames: { contains: () => true }, transaction: (_name: string, mode: string) => {
      let aborted = false;
      const tx = {
        abort: (): void => { aborted = true; queueMicrotask(() => tx.onabort?.()); }, oncomplete: null as Callback, onerror: null as Callback, onabort: null as Callback,
        objectStore: (_store: string) => ({
          get: (key: string) => { const read = request(); queueMicrotask(() => {
            read.result = rows.has(key) ? { ...required(rows.get(key)) } : undefined;
            read.onsuccess?.(); queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); });
          }); return read; },
          put: (row: CacheRow) => { if (mode !== "readwrite") throw new Error("Readonly fixture transaction");
            writes("put", row.key); rows.set(row.key, { ...row }); queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); }); },
          delete: (key: string) => { if (mode !== "readwrite") throw new Error("Readonly fixture deletion");
            const removal = request(); writes("delete", key); rows.delete(key);
            queueMicrotask(() => { if (!aborted) removal.onsuccess?.(); }); return removal; },
          openCursor: (range?: { lower?: string; upper?: string; lowerOpen?: boolean; upperOpen?: boolean }) => {
            const cursor = request();
            if (abortOnCursor) { queueMicrotask(() => tx.abort()); return cursor; }
            const keys = [...rows.keys()].sort().filter(key => !range ||
              ((range.lower === undefined || (range.lowerOpen ? key > range.lower : key >= range.lower))
              && (range.upper === undefined || (range.upperOpen ? key < range.upper : key <= range.upper))));
            let offset = 0;
            const next = () => queueMicrotask(() => {
              const key = keys[offset++];
              cursor.result = key === undefined ? null : { key, primaryKey: key, value: { ...required(rows.get(key)) },
                delete: () => { if (mode !== "readwrite") throw new Error("Readonly fixture deletion");
                  writes("delete", key); rows.delete(key); }, continue: next };
              cursor.onsuccess?.(); if (key === undefined) queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); });
            }); next(); return cursor;
          },
        }),
      }; return tx;
    } };
    queueMicrotask(() => { open.result = database; open.onsuccess?.(); }); return open;
  }) };
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("IDBKeyRange", { bound: (lower: string, upper: string, lowerOpen = false, upperOpen = false) => ({ lower, upper, lowerOpen, upperOpen }),
    only: (key: string) => ({ lower: key, upper: key }) });
  return { rows, writes, factory };
}

beforeEach(() => {
  vi.unstubAllGlobals(); db.rows.clear(); db.query.mockReset();
  db.query.mockImplementation(async (sql: string, parameters: unknown[] = []) => {
    const owner = String(parameters[0]);
    if (sql.includes("INSERT INTO")) {
      const workspace = JSON.parse(String(parameters[4])) as ReturnWorkspaceRecord;
      db.rows.set(JSON.stringify([owner, workspace.id]), structuredClone(workspace));
      return { rowCount: 1, rows: [{ workspace: structuredClone(workspace) }] };
    }
    const matching = [...db.rows.entries()].filter(([key]) => {
      const pair = JSON.parse(key) as string[];
      return pair[0] === owner && (parameters.length === 1 || pair[1] === parameters[1]);
    });
    return { rowCount: matching.length, rows: matching.map(([, workspace]) => ({ workspace: structuredClone(workspace) })) };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("hosted document opaque identities", () => {
  it("P01 real ingestion allowed-character private filename is absent from hosted shell; literal alias present", () => {
    const workspace = rawWorkspace(); expect(first(workspace.documents).id).toBe(rawId);
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    expect(first(shell.documents).id).toBe(expected.filename);
    expect(JSON.stringify(shell)).not.toContain(privateName);
    expect(JSON.stringify(shell)).not.toContain("Casey-Sample");
  });
  it("P02 real ingestion official fixture name/size uses fixed fixture prefix and safe alias", () => {
    const workspace = ingestFilesIntoWorkspace(empty(), [{ name: "irs-w2-2025.pdf", size: 1_343_180 }]);
    expect(first(workspace.documents).id).toBe("irs-w2-2025:irs-w2-2025.pdf:1343180");
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    expect(first(shell.documents).id).toMatch(canonical); expect(first(shell.documents).id).not.toContain("irs-w2-2025.pdf");
    expect(first(shell.documents).matchedFixtureId).toBe("irs-w2-2025");
  });
  it("P03 real ingestion unknown Unicode/space filename accepted only through exact factory shape; shell contains no filename", () => {
    const workspace = ingestFilesIntoWorkspace(empty(), [{ name: "Résumé 例.pdf", size: 12 }]);
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    expect(first(shell.documents).id).toBe(expected["unicode-filename"]);
    expect(first(shell.documents).taxYear).toBeNull(); expect(shell.seededReturn.facts).toEqual([]);
    expect(JSON.stringify(shell)).not.toContain("Résumé"); expect(JSON.stringify(shell)).not.toContain("例.pdf");
  });
  it("P04 exact factory-shaped SSN-bearing filename is stripped before unchanged final direct-ID scan", () => {
    const workspace = uploaded("Casey 123-45-6789 W2.pdf"); const before = JSON.stringify(workspace);
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    expect(first(shell.documents).id).toBe(expected["private-filename"]);
    expect(JSON.stringify(shell)).not.toContain("123-45-6789"); expect(JSON.stringify(shell)).not.toContain("Casey");
    expect(containsUnsafeDirectIdentifier(shell)).toBe(false); expect(JSON.stringify(workspace)).toBe(before);
  });
  it("P05 ordinary doc-42 becomes independent literal alias, remaining metadata equals old shell", () => {
    const workspace = rawWorkspace(); first(workspace.documents).id = "doc-42";
    const doc = first(sanitizeWorkspaceForHostedStorage(workspace).documents);
    expect(doc).toMatchObject({ id: expected.ordinary, name: "Document 1", kind: "w2", size: 100, taxYear: 2025,
      uploadedAt: first(workspace.documents).uploadedAt, seededFactIds: ["wages", "withholding"], blobStorageKey: null, detectedFacts: null });
  });
  it("P06 same raw id in another workspace has distinct literal alias", () => {
    const a = first(sanitizeWorkspaceForHostedStorage(rawWorkspace()).documents).id;
    const b = first(sanitizeWorkspaceForHostedStorage(uploaded(privateName, "other-workspace")).documents).id;
    expect(a).toBe(expected.filename); expect(b).toBe(expected["workspace-scope"]); expect(a).not.toBe(b);
  });
  it("P07 duplicate-name document rows carrying distinct original #2 identities remain distinct", () => {
    const workspace = rawWorkspace(); workspace.documents.push({ ...first(workspace.documents), id: `${rawId}#2` });
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    expect(shell.documents.map(doc => doc.id)).toEqual([expected.filename, expected.duplicate]);
    expect(shell.documents).toHaveLength(2); expect(workspace.documents.map(doc => doc.name)).toEqual([privateName, privateName]);
  });
  it("P08 reordering documents preserves each identity, with names still generic per display position", () => {
    const workspace = rawWorkspace(); workspace.documents.push({ ...first(workspace.documents), id: `${rawId}#2` });
    const before = sanitizeWorkspaceForHostedStorage(workspace); workspace.documents.reverse();
    const after = sanitizeWorkspaceForHostedStorage(workspace);
    expect(after.documents.map(doc => doc.id)).toEqual([required(before.documents[1]).id, first(before.documents).id]);
    expect(after.documents.map(doc => doc.name)).toEqual(["Document 1", "Document 2"]);
  });
  it("P09 deleting a document does not rename surviving alias", () => {
    const workspace = rawWorkspace(); workspace.documents.push({ ...first(workspace.documents), id: `${rawId}#2` });
    const before = required(sanitizeWorkspaceForHostedStorage(workspace).documents[1]).id;
    workspace.documents.shift(); expect(first(sanitizeWorkspaceForHostedStorage(workspace).documents).id).toBe(before);
    expect(before).toBe(expected.duplicate);
  });
  it("P10 sanitize(sanitize(workspace)) is exactly idempotent", () => {
    const once = sanitizeWorkspaceForHostedStorage(rawWorkspace());
    expect(first(once.documents).id).toBe(expected.filename);
    expect(sanitizeWorkspaceForHostedStorage(once)).toEqual(once);
  });
  it("P11 save/get/list normalization preserves canonical aliases and strips historical filename ids without mutating stored old row", async () => {
    const owner = { ownerId: "synthetic-owner", ownerLabel: null, scopeKey: "hosted-owner:synthetic-owner" };
    const store = createHostedPostgresWorkspaceStoreFactory({})(owner, getHostedPersistenceRuntimeConfig({ TAX_ENGINE_DEPLOYMENT_MODE: "hosted" }));
    const saved = await store.save(owner.ownerId, rawWorkspace());
    expect(first(saved.documents).id).toBe(expected.filename);
    expect(await store.get(owner.ownerId, wid)).toEqual(saved);
    expect(await store.listByOwner(owner.ownerId)).toEqual([saved]);
    const legacy = rawWorkspace(); db.rows.set(JSON.stringify([owner.ownerId, wid]), legacy);
    expect(first(required(await store.get(owner.ownerId, wid)).documents).id).toBe(expected.filename);
    expect(first(first(await store.listByOwner(owner.ownerId)).documents).id).toBe(expected.filename);
    expect(first(required(db.rows.get(JSON.stringify([owner.ownerId, wid]))).documents).id).toBe(rawId);
    expect(await store.get("other-owner", wid)).toBeNull();
  });
  it("P12 savePersistedWorkspace sends safe shell and returns exact full local object/source refs/cache snapshot", async () => {
    const workspace = answerWorkspaceInterviewQuestion(rawWorkspace(), "wages", "PRIVATE SSN123-45-6789 amount98765.43");
    const firstFact = first(workspace.seededReturn.facts);
    expect(firstFact.status).toBe("answered");
    expect(firstFact.answerText).toBe("PRIVATE SSN123-45-6789 amount98765.43");
    const before = JSON.stringify(workspace); const local = localStorageFixture(); const fetchFn = shellFetch();
    const result = await savePersistedWorkspace({ deploymentMode: "hosted", workspace, browserStorage: local, fetchFn });
    const sent = String(required(first(fetchFn.mock.calls)[1]).body);
    expect(sent).not.toContain(privateName); expect(sent).not.toContain(firstFact.answerText);
    expect(sent).toContain(expected.filename); expect(result.workspace).toBe(workspace); expect(JSON.stringify(workspace)).toBe(before);
    const stored = JSON.parse(required(local.getItem(WORKSPACE_STORAGE_KEY))) as { workspaces: Record<string, ReturnWorkspaceRecord> };
    expect(first(required(stored.workspaces[wid]).documents).id).toBe(rawId);
    expect(required(stored.workspaces[wid]).seededReturn.facts).toEqual(workspace.seededReturn.facts);
  });
  it("P13 bare SSN document id still rejects with generic non-echoing error", () => { const workspace = rawWorkspace(); first(workspace.documents).id = "123-45-6789"; deny(workspace); });
  it("P14 invalid non-factory ID characters still reject", () => { const workspace = rawWorkspace(); first(workspace.documents).id = "unmatched private/name.pdf"; deny(workspace); });
  it("P15 factory name mismatch rejects", () => { const workspace = uploaded("Casey private W2.pdf"); first(workspace.documents).name = "Different private.pdf"; deny(workspace); });
  it("P16 factory size mismatch rejects", () => { const workspace = uploaded("Casey private W2.pdf"); first(workspace.documents).size = 101; deny(workspace); });
  it("P17 unknown fixture prefix or fixture-kind mismatch rejects", () => {
    for (const prefix of ["not-a-kind", "irs-w2-2025"]) {
      const workspace = uploaded("Casey private W2.pdf"); const doc = first(workspace.documents);
      doc.id = `${prefix}:${doc.name}:${doc.size}`; doc.matchedFixtureId = prefix === "irs-w2-2025" ? "irs-w2-2025" : null;
      if (doc.matchedFixtureId) doc.kind = "1099-int";
      deny(workspace);
    }
  });
  it("P18 invalid duplicate suffix (#0/#1/#02/noninteger) rejects", () => {
    for (const suffix of ["#0", "#1", "#02", "#2.5", "#private"]) {
      const workspace = uploaded("Casey private W2.pdf"); first(workspace.documents).id += suffix; deny(workspace);
    }
  });
  it("P19 invalid typed size/year/unknown kind still rejects before network", async () => {
    for (const mutation of [{ size: -1 }, { size: "private" }, { taxYear: "2025" }, { kind: "private-kind" }]) {
      const workspace = rawWorkspace(); Object.assign(first(workspace.documents), mutation); const fetchFn = shellFetch();
      await expect(savePersistedWorkspace({ deploymentMode: "hosted", workspace, fetchFn })).rejects.toThrow(/workspace shell/iu);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it("P20 duplicate raw ids reject rather than collapse document rows", () => { const workspace = rawWorkspace(); workspace.documents.push({ ...first(workspace.documents) }); deny(workspace); });
  it("P21 submitted canonical alias equal to another derived alias rejects duplicate output", () => { const workspace = rawWorkspace(); workspace.documents.push({ ...first(workspace.documents), id: expected.filename }); deny(workspace); });
  it("P22 canonical alias allowed by unchanged opaque schema has no direct-ID scanner match", () => {
    for (const id of Object.values(expected)) { expect(id).toMatch(canonical); expect(id.length).toBeLessThanOrEqual(256);
      expect(containsUnsafeDirectIdentifier(id)).toBe(false); }
    const workspace = rawWorkspace(); first(workspace.documents).id = expected.filename;
    expect(first(sanitizeWorkspaceForHostedStorage(workspace).documents).id).toBe(expected.filename);
  });
  it("P23 malformed alias-like input receives ordinary validation rather than trusted canonical bypass", () => {
    for (const id of ["hdoc:v1:aa", "guided:Casey-Sample-private-file.pdf"]) {
      const workspace = rawWorkspace(); first(workspace.documents).id = id;
      const output = first(sanitizeWorkspaceForHostedStorage(workspace).documents).id;
      expect(output).toMatch(canonical); expect(output).not.toBe(id); expect(output).not.toContain("Casey");
    }
    const privateGuided = rawWorkspace(); first(privateGuided.documents).id = "guided:123-45-6789"; deny(privateGuided);
  });
  it("P24 opaque workspace/event/fact identity guards remain strict and unchanged", () => {
    for (const position of ["workspace", "event", "fact"] as const) {
      const workspace = rawWorkspace();
      if (position === "workspace") workspace.id = "private workspace";
      if (position === "event") first(workspace.auditTrail).id = "123-45-6789";
      if (position === "fact") Object.assign(first(workspace.seededReturn.facts), { id: "private-fact" });
      deny(workspace);
    }
    for (const badDocuments of [null, {}, "private"]) {
      const workspace = empty(); Object.assign(workspace, { documents: badDocuments }); deny(workspace);
    }
    expect(() => sanitizeWorkspaceForHostedStorage(null as unknown as ReturnWorkspaceRecord)).toThrow(/workspace shell/iu);
    const guided = ["guided:w2", "guided:1099-nec", "guided:schedule-c", "guided:1099-oid", "guided:1099-da", "guided:1099-int",
      "guided:1099-div", "guided:1099-b", "guided:1099-r", "guided:ssa-1099", "guided:1099-g"];
    for (const id of guided) {
      const workspace = rawWorkspace(); first(workspace.documents).id = id;
      expect(first(sanitizeWorkspaceForHostedStorage(workspace).documents).id).toBe(id);
    }
    const synthetic = { ...first(rawWorkspace().documents), id: "guided:w2", name: "Guided Interview — W-2", size: 0, notes: "Entered via guided interview." };
    const original = syncGuidedFlowToWorkspace(empty(), [synthetic], []);
    const shellOnly = sanitizeWorkspaceForHostedStorage(original);
    const flow = { ...initialFlowState, taxYear: 2025 };
    const expectedGuided = reconcileWorkspaceGuidedState(original, flow);
    const actualGuided = reconcileWorkspaceGuidedState(shellOnly, flow);
    expect(actualGuided.returnSummary.targetTaxYear).toBe(expectedGuided.returnSummary.targetTaxYear);
    expect(actualGuided.returnSummary.taxYearState).toBe(expectedGuided.returnSummary.taxYearState);
    expect(actualGuided.returnSummary.blockers.filter(blocker => blocker.id.startsWith("guided:")))
      .toEqual(expectedGuided.returnSummary.blockers.filter(blocker => blocker.id.startsWith("guided:")));
    const resynced = syncGuidedFlowToWorkspace(shellOnly, [synthetic], []);
    expect(resynced.documents).toHaveLength(1); expect(first(resynced.documents).id).toBe("guided:w2");
  });

  it("C01 raw cache read still returns exact filename/bytes/type/lastModified", async () => { const cache = await cacheApi(); await cache.cacheWorkspaceDocumentFiles(wid, [{ documentId: rawId, file: originalFile() }]);
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, rawId)); });
  it("C02 literal alias cache read returns same exact original File", async () => { const cache = await cacheApi(); await cache.cacheWorkspaceDocumentFiles(wid, [{ documentId: rawId, file: originalFile() }]);
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, expected.filename));
    expect(await cache.hasCachedWorkspaceDocumentFile(wid, expected.filename)).toBe(true); });
  it("C03 unknown alias returns null and hasCached false", async () => { const cache = await cacheApi();
    expect(await cache.getCachedWorkspaceDocumentFile(wid, expected.filename)).toBeNull();
    expect(await cache.hasCachedWorkspaceDocumentFile(wid, expected.filename)).toBe(false); });
  it("C04 another workspace cannot resolve alias of retained original", async () => { const cache = await cacheApi(); await cache.cacheWorkspaceDocumentFiles(wid, [{ documentId: rawId, file: originalFile() }]);
    expect(await cache.getCachedWorkspaceDocumentFile("other-workspace", expected.filename)).toBeNull();
    expect(await cache.getCachedWorkspaceDocumentFile(wid, expected["workspace-scope"])).toBeNull(); });
  it("C05 tuple-delimiter workspace/document combinations remain distinct", async () => { const cache = await cacheApi();
    await cache.cacheWorkspaceDocumentFiles("a:b", [{ documentId: "c", file: originalFile("first.pdf") }]);
    await cache.cacheWorkspaceDocumentFiles("a", [{ documentId: "b:c", file: originalFile("second.pdf") }]);
    await assertFile(await cache.getCachedWorkspaceDocumentFile("a:b", expected["tuple-delimiter-a"]), "first.pdf");
    await assertFile(await cache.getCachedWorkspaceDocumentFile("a", expected["tuple-delimiter-b"]), "second.pdf"); });
  it("C06 IDB-only current-format record resolves alias after module-memory reset", async () => { const fixture = idbFixture([cachedRow()]); const cache = await cacheApi();
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, expected.filename));
    expect(fixture.factory.open).toHaveBeenCalled(); expect(fixture.writes).not.toHaveBeenCalled(); });
  it("C07 IDB-only former key format resolves alias only with exact stored ownership/key consistency", async () => { const row = cachedRow(wid, rawId, true); const fixture = idbFixture([row]); const cache = await cacheApi();
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, expected.filename));
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, rawId)); expect(fixture.writes).not.toHaveBeenCalled(); });
  it("C08 malformed key/record ownership mismatch cannot return cached bytes", async () => {
    const wrongKey = { ...cachedRow(), key: JSON.stringify([wid, "different-raw-id"]) };
    const wrongOwner = { ...cachedRow(), workspaceId: "other-workspace" };
    const ambiguous = { ...cachedRow(), key: `${wid}:${rawId}`, fileName: "different-source.pdf", file: originalFile("different-source.pdf") };
    for (const rows of [[wrongKey], [wrongOwner], [cachedRow(), ambiguous]]) {
      const fixture = idbFixture(rows); const cache = await cacheApi();
      expect(await cache.getCachedWorkspaceDocumentFile(wid, expected.filename)).toBeNull();
      if (rows.length === 2) {
        const beforeDelete = [...fixture.rows.entries()];
        await expect(cache.deleteCachedWorkspaceDocumentFiles(wid, [expected.filename])).rejects.toThrow(/uniquely identify|ambiguous/iu);
        expect([...fixture.rows.entries()]).toEqual(beforeDelete);
        expect(fixture.writes).not.toHaveBeenCalled();
      }
    }
  });
  it("C09 alias reads do not put/change original records or ids", async () => { const row = cachedRow(); const fixture = idbFixture([row]); const before = [...fixture.rows.entries()]; const cache = await cacheApi();
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, expected.filename));
    expect([...fixture.rows.entries()]).toEqual(before); expect(fixture.writes).not.toHaveBeenCalled(); });
  it("C10 alias-selective deletion removes raw original while unrelated same-workspace and other-workspace files survive", async () => { const fixture = idbFixture([cachedRow(), cachedRow(wid, `${rawId}#2`), cachedRow("other-workspace")]); const cache = await cacheApi();
    await cache.deleteCachedWorkspaceDocumentFiles(wid, [expected.filename]);
    expect(await cache.getCachedWorkspaceDocumentFile(wid, rawId)).toBeNull();
    expect(await cache.getCachedWorkspaceDocumentFile(wid, expected.filename)).toBeNull();
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, `${rawId}#2`));
    await assertFile(await cache.getCachedWorkspaceDocumentFile("other-workspace", rawId)); expect(fixture.rows.size).toBe(2); });
  it("C11 existing raw selective deletion and full-workspace deletion remain exact", async () => { const cache = await cacheApi();
    for (const id of [wid, "other-workspace"]) await cache.cacheWorkspaceDocumentFiles(id, [{ documentId: rawId, file: originalFile() }, { documentId: `${rawId}#2`, file: originalFile() }]);
    await cache.deleteCachedWorkspaceDocumentFiles(wid, [rawId]); expect(await cache.getCachedWorkspaceDocumentFile(wid, rawId)).toBeNull();
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, `${rawId}#2`));
    await cache.deleteCachedWorkspaceDocumentFiles(wid); expect(await cache.getCachedWorkspaceDocumentFile(wid, `${rawId}#2`)).toBeNull();
    await assertFile(await cache.getCachedWorkspaceDocumentFile("other-workspace", rawId)); });
  it("C12 loadPersistedWorkspace without local workspace JSON returns shell whose alias can recover original cached File", async () => { const cache = await cacheApi(); await cache.cacheWorkspaceDocumentFiles(wid, [{ documentId: rawId, file: originalFile() }]);
    const shell = sanitizeWorkspaceForHostedStorage(rawWorkspace()); const local = localStorageFixture();
    const result = await loadPersistedWorkspace({ deploymentMode: "hosted", workspaceId: wid, browserStorage: local, fetchFn: shellFetch(shell) });
    expect(first(required(result.workspace).documents).id).toBe(expected.filename);
    await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, first(required(result.workspace).documents).id));
    expect(local.getItem(WORKSPACE_STORAGE_KEY)).toBeNull(); });
  it("C13 local workspace present/newer continues to win and retain all original IDs", async () => { const workspace = rawWorkspace(); const local = localStorageFixture();
    const localBaseline = saveWorkspaceSnapshot(local, workspace); const beforeLoad = local.getItem(WORKSPACE_STORAGE_KEY);
    expect(first(localBaseline.documents)).toMatchObject({ id: rawId, name: privateName, size: 100, blobStorageKey: null });
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    const result = await loadPersistedWorkspace({ deploymentMode: "hosted", workspaceId: wid, browserStorage: local, fetchFn: shellFetch(shell) });
    expect(first(required(result.workspace).documents).id).toBe(rawId); expect(getWorkspace(local, wid)?.documents).toEqual(localBaseline.documents);
    expect(local.getItem(WORKSPACE_STORAGE_KEY)).toBe(beforeLoad); });
  it("C14 recovery original metadata/raw-ID cache roundtrip remains compatible; no migration/recapture", async () => { const workspace = rawWorkspace();
    const local = localStorageFixture(); saveWorkspaceSnapshot(local, workspace);
    const files = new Map([[`${wid}/${rawId}`, originalFile()]]);
    const documents: RecoveryDocumentStore = { read: vi.fn(async (id, doc) => files.get(`${id}/${doc}`) ?? null),
      write: vi.fn(async (id, uploads) => { for (const upload of uploads) files.set(`${id}/${upload.documentId}`, upload.file); }),
      remove: vi.fn(async id => { for (const key of files.keys()) if (key.startsWith(`${id}/`)) files.delete(key); }) };
    const before = local.getItem(WORKSPACE_STORAGE_KEY); const password = "synthetic-opaque-id-recovery";
    const archive = await exportWorkspaceRecovery(local, wid, password, { documents });
    const restored = await importWorkspaceRecovery(local, archive, password, { documents });
    const record = required(getWorkspace(local, restored.workspaceId)); expect(first(record.documents).id).toBe(rawId);
    await assertFile(files.get(`${restored.workspaceId}/${rawId}`) ?? null);
    const parsed = JSON.parse(required(before)) as { workspaces: Record<string, ReturnWorkspaceRecord> };
    expect(getWorkspace(local, wid)?.documents).toEqual(required(parsed.workspaces[wid]).documents);
    expect(await archive.text()).not.toContain(privateName); expect(restored.documentCount).toBe(1);
  });
  it("C15 incomplete durable inventory denies alias read and deletion without altering raw fallback", async () => {
    const cache = await cacheApi();
    await cache.cacheWorkspaceDocumentFiles(wid, [{ documentId: rawId, file: originalFile() }]);
    const failedOpen = { open: vi.fn(() => {
      const request = { onerror: null as (() => void) | null, onsuccess: null as (() => void) | null,
        onblocked: null as (() => void) | null, onupgradeneeded: null as (() => void) | null };
      queueMicrotask(() => request.onerror?.()); return request;
    }) };
    for (const failure of ["open", "cursor-abort"] as const) {
      if (failure === "open") {
        vi.stubGlobal("indexedDB", failedOpen);
        vi.stubGlobal("IDBKeyRange", { bound: (lower: string, upper: string) => ({ lower, upper }) });
      } else idbFixture([], true);
      expect(await cache.getCachedWorkspaceDocumentFile(wid, expected.filename)).toBeNull();
      expect(await cache.hasCachedWorkspaceDocumentFile(wid, expected.filename)).toBe(false);
      await expect(cache.deleteCachedWorkspaceDocumentFiles(wid, [expected.filename])).rejects.toThrow(/unavailable|opened|interrupted|delete/iu);
      await assertFile(await cache.getCachedWorkspaceDocumentFile(wid, rawId));
    }
    expect(failedOpen.open).toHaveBeenCalled();
  });

});
