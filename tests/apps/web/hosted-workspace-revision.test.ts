import { expect, it, vi } from 'vitest';
import { createHostedWorkspaceRouteHandlers } from '../../../apps/web/src/lib/hosted-workspace-route';
import { ingestFilesIntoWorkspace, saveWorkspaceSnapshot, WORKSPACE_STORAGE_KEY } from '../../../apps/web/src/lib/workspace-storage';
import { createInMemoryHostedDocumentBlobStore, createInMemoryHostedWorkspaceStore, deletePersistedWorkspace, loadPersistedWorkspace, savePersistedWorkspace } from '../../../apps/web/src/lib/workspace-persistence';
import { cacheWorkspaceDocumentFiles, getCachedWorkspaceDocumentFile } from '../../../apps/web/src/lib/workspace-document-file-cache';
import { HostedWorkspaceWriteRejectedError } from '../../../apps/web/src/lib/hosted-workspace-revision';
import { hostedDocumentCacheId } from '../../../apps/web/src/lib/hosted-workspace-browser-state';
import { sanitizeWorkspaceForHostedStorage } from '../../../apps/web/src/lib/hosted-privacy';
import { createRateLimitStore } from '../../../apps/web/src/lib/rate-limit';
import type { ReturnWorkspaceRecord } from '@tax-engine/contracts';

const origin = 'https://tax.example';
const ownerId = 'owner-synthetic-revision';
const context = { workspaceId: 'revision-synthetic' };
const endpoint = `${origin}/api/hosted/workspaces/${context.workspaceId}`;
const etagPattern = /^"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"$/u;
const syntheticDocument = { name: 'Private Synthetic.pdf', size: 12, type: 'application/pdf' };

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Synthetic workspace fixture missing');
  return value;
}

function storageFixture(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); },
    key: index => [...values.keys()][index] ?? null, clear: () => values.clear() };
}

function app(actorId = ownerId, store = createInMemoryHostedWorkspaceStore()) {
  const blobs = createInMemoryHostedDocumentBlobStore();
  const reconcile = vi.spyOn(blobs, 'reconcileWorkspace');
  const handlers = createHostedWorkspaceRouteHandlers({
    env: { TAX_ENGINE_DEPLOYMENT_MODE: 'hosted', TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: actorId,
      BETTER_AUTH_SECRET: 'synthetic signature key for local route tests only' },
    hostedStore: store, hostedDocumentBlobStore: blobs, rateLimitStore: createRateLimitStore(),
    now: () => '2026-11-13T20:14:00.000Z',
  });
  async function open(create = false) {
    const response = await handlers.get(new Request(create ? `${endpoint}?create=1` : endpoint), context);
    expect(response.status).toBe(200);
    return { revision: response.headers.get('ETag'), workspace: (await response.json() as { workspace: ReturnWorkspaceRecord | null }).workspace };
  }
  function post(workspace: ReturnWorkspaceRecord, precondition: Record<string, string> = {}) {
    return handlers.save(new Request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...precondition },
      body: JSON.stringify({ workspace }) }), context);
  }
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(new URL(String(input), origin), init);
    if (request.method === 'POST') return handlers.save(request, context);
    if (request.method === 'DELETE') return handlers.delete(request, context);
    return handlers.get(request, context);
  };
  return { open, post, fetchFn, reconcile, handlers };
}

it('permits only one sibling write even when both snapshots have the same client timestamp', async () => {
  const f = app();
  const { workspace, revision } = await f.open(true);
  const base = required(workspace);
  expect(revision).toMatch(etagPattern);
  const headers = { 'If-Match': required(revision) };
  const updatedOne = { ...ingestFilesIntoWorkspace(base, [syntheticDocument]), updatedAt: base.updatedAt };
  const updatedTwo = { ...ingestFilesIntoWorkspace(base, [{ ...syntheticDocument, name: 'Other Synthetic.pdf' }]), updatedAt: base.updatedAt };
  const responses = await Promise.all([f.post(updatedOne, headers), f.post(updatedTwo, headers)]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 412]);
  const winner = required(responses.find(response => response.status === 200));
  const latest = await f.open();
  expect(winner.headers.get('ETag')).toMatch(etagPattern);
  expect(latest.revision).toBe(winner.headers.get('ETag'));
  expect(latest.revision).not.toBe(revision);
  expect(latest.workspace?.documents).toHaveLength(1);
  expect(f.reconcile).toHaveBeenCalledTimes(1);
});

it('requires explicit creation and never revives a deleted workspace from a stale save', async () => {
  const f = app();
  const { workspace, revision } = await f.open(true);
  const base = required(workspace);
  expect((await f.post(base)).status).toBe(428);
  expect((await f.post(base, { 'If-Match': '*'})).status).toBe(400);
  expect((await f.post(base, { 'If-Match': `W/${revision}` })).status).toBe(400);
  expect((await f.post(base, { 'If-Match': `${revision}, ${revision}` })).status).toBe(400);
  expect((await f.post(base, { 'If-Match': required(revision), 'If-None-Match': '*' })).status).toBe(400);
  expect((await f.post(base, { 'If-None-Match': '*' })).status).toBe(412);
  expect((await f.handlers.delete(new Request(endpoint, { method: 'DELETE' }), context)).status).toBe(200);
  expect((await f.post(base, { 'If-Match': required(revision) })).status).toBe(412);
  expect(await f.open()).toEqual({ revision: null, workspace: null });
  const recreated = await f.post(base, { 'If-None-Match': '*' });
  expect(recreated.status).toBe(200);
  expect(recreated.headers.get('ETag')).not.toBe(revision);
  expect((await f.post(base, { 'If-Match': required(revision) })).status).toBe(412);
});

it('retains an equal private browser mirror without pairing a stale mirror to a fresh revision', async () => {
  const f = app();
  const { workspace, revision } = await f.open(true);
  const browserStorage = storageFixture();
  const localWithDocument = ingestFilesIntoWorkspace(required(workspace), [syntheticDocument]);
  const options = { deploymentMode: 'hosted' as const, fetchFn: f.fetchFn, browserStorage, workspaceId: context.workspaceId };
  const saved = await savePersistedWorkspace({ ...options, workspace: localWithDocument, workspaceRevision: required(revision) });
  const reopened = await loadPersistedWorkspace(options);
  expect(reopened.workspace?.documents[0]?.name).toBe(syntheticDocument.name);
  expect(reopened.localMirrorMatched).toBe(true);
  expect(reopened.workspaceRevision).toBe(saved.workspaceRevision);
  saveWorkspaceSnapshot(browserStorage, { ...localWithDocument, updatedAt: '2099-01-01T00:00:00.000Z' });
  const remoteUpdate = await f.post(sanitizeWorkspaceForHostedStorage(localWithDocument), { 'If-Match': required(saved.workspaceRevision) });
  expect(remoteUpdate.status).toBe(200);
  const before = browserStorage.getItem(WORKSPACE_STORAGE_KEY);
  const latest = await loadPersistedWorkspace(options);
  expect(latest.workspace?.documents[0]?.name).toBe('Document 1');
  expect(latest.workspaceRevision).toBe(remoteUpdate.headers.get('etag'));
  expect(latest.localMirrorMatched).toBe(false);
  expect(browserStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(before);
});

it('reopens the newest private mirror when an older POST response arrives last', async () => {
  const f = app();
  const { workspace, revision } = await f.open(true);
  const browserStorage = storageFixture();
  const base = required(workspace);
  const first = ingestFilesIntoWorkspace(base, [syntheticDocument]);
  const secondDocument = { ...syntheticDocument, name: 'Latest private name.pdf' };
  const second = ingestFilesIntoWorkspace(first, [secondDocument]);
  const options = { deploymentMode: 'hosted' as const, browserStorage, workspaceId: context.workspaceId };
  let releaseOlderResponse!: () => void;
  const held = new Promise<void>(resolve => { releaseOlderResponse = resolve; });
  let recordFirstCommit!: (revision: string) => void;
  const firstCommitted = new Promise<string>(resolve => { recordFirstCommit = resolve; });
  const fetchFn: typeof fetch = async (input, init) => {
    const response = await f.fetchFn(input, init);
    recordFirstCommit(required(response.headers.get('etag')));
    await held;
    return response;
  };
  const older = savePersistedWorkspace({ ...options, fetchFn, workspace: first, workspaceRevision: required(revision) });
  try {
    const latest = await savePersistedWorkspace({ ...options, fetchFn: f.fetchFn, workspace: second,
      workspaceRevision: await firstCommitted });
    releaseOlderResponse();
    await older;
    const reopened = await loadPersistedWorkspace({ ...options, fetchFn: f.fetchFn });
    expect(reopened.workspaceRevision).toBe(latest.workspaceRevision);
    expect(reopened.workspace?.documents.map(document => document.name)).toEqual([syntheticDocument.name, secondDocument.name]);
  } finally {
    releaseOlderResponse();
    await older;
  }
});

it('distinguishes server-confirmed no-write from transport ambiguity', async () => {
  const f = app();
  const { workspace } = await f.open(true);
  const options = { deploymentMode: 'hosted' as const, workspace: required(workspace) };
  await expect(savePersistedWorkspace({ ...options, fetchFn: f.fetchFn })).rejects.toMatchObject({ name: 'HostedWorkspaceWriteRejectedError' });
  await expect(savePersistedWorkspace({ ...options, fetchFn: async () => { throw new TypeError('response lost'); } }))
    .rejects.toMatchObject({ name: 'TypeError', message: 'response lost' });
  await expect(savePersistedWorkspace({ ...options,
    fetchFn: async () => Response.json({ error: 'proxy precondition' }, { status: 412 }) }))
    .rejects.not.toMatchObject({ name: 'HostedWorkspaceWriteRejectedError' });
  f.reconcile.mockImplementationOnce(() => { throw new HostedWorkspaceWriteRejectedError(); });
  const revision = required((await f.open()).revision);
  await expect(savePersistedWorkspace({ ...options, workspaceRevision: revision, fetchFn: f.fetchFn }))
    .rejects.not.toMatchObject({ name: 'HostedWorkspaceWriteRejectedError' });
  expect((await f.open()).revision).not.toBe(revision);
});

it('preserves the confirmed server revision after browser storage failure', async () => {
  const f = app();
  const { workspace, revision } = await f.open(true);
  const browserStorage = storageFixture();
  browserStorage.setItem = () => { throw new DOMException('Browser refused a write', 'QuotaExceededError'); };
  const saved = await savePersistedWorkspace({ deploymentMode: 'hosted', fetchFn: f.fetchFn, browserStorage,
    workspace: required(workspace), workspaceRevision: required(revision) });
  expect(saved.localMirrorSaved).toBe(false);
  expect(saved.workspaceRevision).toMatch(etagPattern);
  expect(saved.workspaceRevision).not.toBe(revision);
  expect((await f.open()).revision).toBe(saved.workspaceRevision);
});

it.each(['different snapshot', 'missing revision', 'wrong owner', 'same revision'] as const)(
  'leaves the browser mirror unchanged when a save acknowledgment has a %s',
  async problem => {
    const f = app();
    const { workspace, revision } = await f.open(true);
    const browserStorage = storageFixture();
    const base = required(workspace);
    const fetchFn: typeof fetch = async (input, init) => {
      const response = await f.fetchFn(input, init);
      const result = await response.json();
      if (problem === 'different snapshot') result.workspace.updatedAt = '2026-11-15T01:00:00.000Z';
      if (problem === 'wrong owner') result.ownerScope.scopeKey = 'hosted-owner:wrong-owner';
      const headers = new Headers(response.headers);
      if (problem === 'missing revision') headers.delete('etag');
      if (problem === 'same revision') headers.set('etag', required(revision));
      return Response.json(result, { status: response.status, headers });
    };
    await expect(savePersistedWorkspace({ deploymentMode: 'hosted', fetchFn, browserStorage, workspace: base,
      workspaceRevision: required(revision), ownerScopeKey: `hosted-owner:${ownerId}` }))
      .rejects.toThrow('The server did not confirm the exact return that was saved.');
    expect(browserStorage.length).toBe(0);
    expect((await f.open()).revision).not.toBe(revision);
  }
);

it('never reopens another owner’s mirror even when hosted projections match', async () => {
  const store = createInMemoryHostedWorkspaceStore();
  const a = app('owner-a', store);
  const b = app('owner-b', store);
  const browserStorage = storageFixture();
  const { workspace, revision } = await a.open(true);
  const uploaded = ingestFilesIntoWorkspace(required(workspace), [syntheticDocument]);
  const aSaved = await savePersistedWorkspace({ deploymentMode: 'hosted', fetchFn: a.fetchFn, browserStorage,
    workspace: uploaded, workspaceRevision: required(revision) });
  const aOpened = await a.open();
  const sameShell = await b.post(required(aOpened.workspace), { 'If-None-Match': '*' });
  expect(sameShell.status).toBe(200);
  expect((await b.post(required(aOpened.workspace), { 'If-Match': required(aSaved.workspaceRevision) })).status).toBe(412);
  const loaded = await loadPersistedWorkspace({ deploymentMode: 'hosted', fetchFn: b.fetchFn, browserStorage, workspaceId: context.workspaceId });
  expect(loaded.localMirrorMatched).toBe(false);
  expect(loaded.workspace?.documents[0]?.name).toBe('Document 1');
  // B deleting its equally redacted snapshot must preserve A’s original.
  const source = new File(['private synthetic'], syntheticDocument.name, { type: syntheticDocument.type });
  const documentId = required(uploaded.documents[0]).id;
  const cacheId = hostedDocumentCacheId('hosted-owner:owner-a', context.workspaceId);
  await cacheWorkspaceDocumentFiles(cacheId, [{ documentId, file: source }]);
  await deletePersistedWorkspace({ deploymentMode: 'hosted', fetchFn: b.fetchFn, browserStorage, workspaceId: context.workspaceId });
  expect(await getCachedWorkspaceDocumentFile(cacheId, documentId)).not.toBeNull();
  const aLoaded = await loadPersistedWorkspace({ deploymentMode: 'hosted', fetchFn: a.fetchFn, browserStorage, workspaceId: context.workspaceId });
  expect(aLoaded.workspace?.documents[0]?.name).toBe(syntheticDocument.name);
});

it('keeps originals if the authenticated snapshot cannot be loaded for deletion', async () => {
  const f = app();
  const browserStorage = storageFixture();
  const { workspace, revision } = await f.open(true);
  const uploaded = ingestFilesIntoWorkspace(required(workspace), [syntheticDocument]);
  const documentId = required(uploaded.documents[0]).id;
  const source = new File(['private synthetic'], syntheticDocument.name, { type: syntheticDocument.type });
  const cacheId = hostedDocumentCacheId(`hosted-owner:${ownerId}`, context.workspaceId);
  await cacheWorkspaceDocumentFiles(cacheId, [{ documentId, file: source }]);
  await savePersistedWorkspace({ deploymentMode: 'hosted', fetchFn: f.fetchFn, browserStorage,
    workspace: uploaded, workspaceRevision: required(revision) });
  const fetchFn: typeof fetch = (input, init) => init?.method === 'GET' ? Promise.reject(new TypeError('connection ended')) : f.fetchFn(input, init);
  await deletePersistedWorkspace({ deploymentMode: 'hosted', fetchFn, browserStorage, workspaceId: context.workspaceId });
  expect((await f.open()).workspace).toBeNull();
  expect(await getCachedWorkspaceDocumentFile(cacheId, documentId)).not.toBeNull();
});

it('rejects an owner-scoped delete before mutation when the signed-in account changes', async () => {
  const store = createInMemoryHostedWorkspaceStore();
  const a = app('selected-card-owner', store);
  const b = app('current-session-owner', store);
  await a.open(true);
  await b.open(true);
  const fetchFn = vi.fn(b.fetchFn);
  await expect(deletePersistedWorkspace({ deploymentMode: 'hosted', fetchFn, workspaceId: context.workspaceId,
    ownerScopeKey: 'hosted-owner:selected-card-owner' })).rejects.toThrow('Could not verify this return for the current account.');
  expect(fetchFn.mock.calls.map(([, init]) => init?.method)).toEqual(['GET']);
  expect((await b.open()).workspace).not.toBeNull();
});

it('leaves originals if a competing update replaces the revision during deletion', async () => {
  const f = app();
  const browserStorage = storageFixture();
  const { workspace, revision } = await f.open(true);
  const uploaded = ingestFilesIntoWorkspace(required(workspace), [syntheticDocument]);
  const documentId = required(uploaded.documents[0]).id;
  const source = new File(['private synthetic'], syntheticDocument.name, { type: syntheticDocument.type });
  const cacheId = hostedDocumentCacheId(`hosted-owner:${ownerId}`, context.workspaceId);
  await cacheWorkspaceDocumentFiles(cacheId, [{ documentId, file: source }]);
  const saved = await savePersistedWorkspace({ deploymentMode: 'hosted', fetchFn: f.fetchFn, browserStorage,
    workspace: uploaded, workspaceRevision: required(revision) });
  const fetchFn: typeof fetch = async (input, init) => {
    if (init?.method === 'DELETE') {
      const response = await f.post(uploaded, { 'If-Match': required(saved.workspaceRevision) });
      expect(response.status).toBe(200);
    }
    return f.fetchFn(input, init);
  };
  await expect(deletePersistedWorkspace({ deploymentMode: 'hosted', fetchFn, browserStorage, workspaceId: context.workspaceId }))
    .rejects.toMatchObject({ name: 'HostedWorkspaceWriteRejectedError' });
  expect((await f.open()).workspace?.documents).toHaveLength(1);
  expect(await getCachedWorkspaceDocumentFile(cacheId, documentId)).not.toBeNull();
});

it('removes only originals attached to the deleted authenticated snapshot', async () => {
  const f = app();
  const browserStorage = storageFixture();
  const { workspace, revision } = await f.open(true);
  const uploaded = ingestFilesIntoWorkspace(required(workspace), [syntheticDocument]);
  const documentId = required(uploaded.documents[0]).id;
  const source = new File(['private synthetic'], syntheticDocument.name, { type: syntheticDocument.type });
  const cacheId = hostedDocumentCacheId(`hosted-owner:${ownerId}`, context.workspaceId);
  await cacheWorkspaceDocumentFiles(cacheId, [{ documentId, file: source }, { documentId: 'unattached', file: source }]);
  await cacheWorkspaceDocumentFiles(context.workspaceId, [{ documentId, file: source }]);
  await savePersistedWorkspace({ deploymentMode: 'hosted', fetchFn: f.fetchFn, browserStorage,
    workspace: uploaded, workspaceRevision: required(revision) });
  await deletePersistedWorkspace({ deploymentMode: 'hosted', fetchFn: f.fetchFn, browserStorage, workspaceId: context.workspaceId });
  expect((await f.open()).workspace).toBeNull();
  expect(await getCachedWorkspaceDocumentFile(cacheId, documentId)).toBeNull();
  expect(await getCachedWorkspaceDocumentFile(cacheId, 'unattached')).not.toBeNull();
  expect(await getCachedWorkspaceDocumentFile(context.workspaceId, documentId)).not.toBeNull();
});
