import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ actor: vi.fn(), entitlement: vi.fn(), rate: vi.fn() }));
vi.mock('../../../apps/web/src/lib/hosted-auth', () => ({ resolveHostedWorkspaceActor: mocks.actor }));
vi.mock('../../../apps/web/src/lib/hosted-billing-db', () => ({ getHostedEntitlementByOwnerId: mocks.entitlement }));
vi.mock('../../../apps/web/src/lib/rate-limit', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../apps/web/src/lib/rate-limit')>(),
  checkRateLimitForEnvironment: mocks.rate
}));
import { createHostedWorkspaceRouteHandlers } from '../../../apps/web/src/lib/hosted-workspace-route';
import { createInMemoryHostedDocumentBlobStore, createInMemoryHostedWorkspaceStore } from '../../../apps/web/src/lib/workspace-persistence';
import { createWorkspaceRecord } from '../../../apps/web/src/lib/workspace-storage';
import { createRateLimitStore } from '../../../apps/web/src/lib/rate-limit';

// spec/federal/hosted-upload-request-limits.yaml. These are application policy
// boundaries, not a claimed conversion of Vercel's documented 4.5 MB limit.
const MIB = 1024 * 1024;
const FILE_LIMIT = 4 * MIB;
const REQUEST_LIMIT = 4 * MIB + 256 * 1024;
const ORIGIN = 'https://upload.example.invalid';
const WORKSPACE_ID = 'synthetic-upload-workspace';
const OWNER = 'synthetic-upload-owner';
const PRIVATE = 'SYNTHETIC_PRIVATE_UPLOAD_SENTINEL';
const baseEnv = { TAX_ENGINE_DEPLOYMENT_MODE: 'hosted', TAX_ENGINE_APP_URL: ORIGIN };

function setup(platform: Record<string, string> = { VERCEL: '1' }) {
  const store = createInMemoryHostedWorkspaceStore([{ ownerId: OWNER, workspace: createWorkspaceRecord(WORKSPACE_ID, { storageMode: 'hosted-postgres' }) }]);
  const blobs = createInMemoryHostedDocumentBlobStore();
  const save = vi.spyOn(blobs, 'save');
  const handlers = createHostedWorkspaceRouteHandlers({
    env: { ...baseEnv, ...platform }, hostedStore: store,
    hostedDocumentBlobStore: blobs, rateLimitStore: createRateLimitStore(),
    now: () => '2026-11-03T20:00:00.000Z'
  });
  return { handlers, save, blobs };
}

function png(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (size > 12) bytes.set([0xff, 0x00, 0xc3, 0x28], 8);
  return bytes;
}

function form(size: number, overhead = 0) {
  const data = new FormData();
  data.set('documentId', 'synthetic-document');
  data.set('uploadedAt', '2026-11-03T20:00:00.000Z');
  data.set('file', new File([png(size)], 'synthetic.png', { type: 'image/png' }));
  if (overhead) data.set('unused-multipart-field', PRIVATE + 'x'.repeat(overhead));
  return data;
}

function request(data: FormData, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/hosted/workspaces/${WORKSPACE_ID}/documents`, { method: 'POST', body: data, headers });
}

async function multipart(size: number, overhead = 0) {
  const response = new Response(form(size, overhead));
  const type = response.headers.get('content-type');
  if (!type) throw new Error('Synthetic multipart boundary missing.');
  return { bytes: new Uint8Array(await response.arrayBuffer()), type };
}

function streamRequest(bytes: Uint8Array, type: string, length?: string, signal?: AbortSignal) {
  const cancel = vi.fn();
  let offset = 0;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(offset + 3 * MIB, bytes.length);
      controller.enqueue(bytes.slice(offset, end)); offset = end;
    }, cancel
  }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', body, duplex: 'half', signal,
    headers: { 'content-type': type, ...(length === undefined ? {} : { 'content-length': length }) }
  };
  return { req: new Request(`${ORIGIN}/api/hosted/workspaces/${WORKSPACE_ID}/documents`, init), body, cancel, pulls: () => pulls };
}

function stalledRequest(signal?: AbortSignal) {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', body, duplex: 'half', signal,
    headers: { 'content-type': 'multipart/form-data; boundary=synthetic-boundary' }
  };
  return { req: new Request(`${ORIGIN}/api/hosted/workspaces/${WORKSPACE_ID}/documents`, init), cancel, body };
}

async function invoke(f: ReturnType<typeof setup>, req: Request) {
  const response = await f.handlers.uploadDocument(req, { workspaceId: WORKSPACE_ID });
  if (!response) throw new Error('Upload handler returned no response.');
  return response;
}

async function denialResponse(f: ReturnType<typeof setup>, response: Response, status = 413) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  const text = await response.text();
  expect(text).not.toContain(PRIVATE);
  expect(text).not.toContain('synthetic.png');
  expect(f.save).not.toHaveBeenCalled();
  return text;
}

async function denied(f: ReturnType<typeof setup>, req: Request, status = 413) {
  return denialResponse(f, await invoke(f, req), status);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: OWNER, label: 'Synthetic owner' });
  mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: true } });
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: null });
});

describe('inclusive request bounds and untrusted cancellation source-first additions', () => {
  async function exactEnvelope(size: number) {
    const sample = await multipart(24, 1);
    const raw = await multipart(24, 1 + size - sample.bytes.length);
    expect(raw.bytes.length).toBe(size);
    return raw;
  }

  it('settles the limit response and releases its lock when producer cancellation never settles', async () => {
    const raw = await multipart(5 * MIB);
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === raw.bytes.length) { controller.close(); return; }
        const end = Math.min(offset + 3 * MIB, raw.bytes.length);
        controller.enqueue(raw.bytes.slice(offset, end)); offset = end;
      }, cancel
    }, { highWaterMark: 0 });
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half', headers: { 'content-type': raw.type } };
    const f = setup();
    const settled: { response?: Response } = {};
    const pending = invoke(f, new Request(`${ORIGIN}/documents`, init)).then(response => {
      settled.response = response;
      return response;
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled.response).toBeDefined();
    if (!settled.response) throw new Error('Limit response did not settle within the original 30-second budget.');
    await denialResponse(f, settled.response);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(f.save).not.toHaveBeenCalled();
    await pending;
  });

  it('accepts the exact whole multipart request byte boundary', async () => {
    const raw = await exactEnvelope(4456448);
    const f = setup();
    const data = streamRequest(raw.bytes, raw.type);
    const response = await invoke(f, data.req);
    expect(response.status).toBe(200);
    expect((await response.json()).document).toMatchObject({ size: 24, mediaType: 'image/png' });
    expect(f.save).toHaveBeenCalledOnce();
    expect(data.body.locked).toBe(false);
  });

  it('rejects one byte over the whole multipart request boundary', async () => {
    const raw = await exactEnvelope(4456449);
    const f = setup();
    const data = streamRequest(raw.bytes, raw.type);
    await denied(f, data.req);
    expect(data.cancel).toHaveBeenCalledOnce();
    expect(data.body.locked).toBe(false);
    expect(f.save).not.toHaveBeenCalled();
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('platform-aware hosted upload bounds through the existing route API', () => {
  const platformCases: Array<[string, Record<string, string>]> = [
    ['VERCEL flag', { VERCEL: '1' }],
    ['Preview metadata', { VERCEL_ENV: 'preview' }],
    ['production metadata', { VERCEL_ENV: 'production' }]
  ];
  it.each(platformCases)('rejects Vercel upload beyond application bound %s', async (_name, platform) => {
    const f = setup(platform);
    await denied(f, request(form(FILE_LIMIT + 1)));
  });

  it('does not infer Vercel policy from a request hostname or forwarded headers', async () => {
    const f = setup({});
    const response = await invoke(f, request(form(FILE_LIMIT + 1), { host: 'forged.vercel.app', 'x-forwarded-host': 'forged.vercel.app' }));
    expect(response.status).toBe(200);
    expect(f.save).toHaveBeenCalledOnce();
  });

  it('accepts the exact 4 MiB file boundary within its multipart envelope', async () => {
    const f = setup();
    const response = await invoke(f, request(form(FILE_LIMIT)));
    expect(response.status).toBe(200);
    expect((await response.json()).document).toMatchObject({ size: 4194304, mediaType: 'image/png' });
    expect(f.save).toHaveBeenCalledOnce();
  });

  it('rejects one file byte over the boundary even inside the request allowance', async () => {
    const data = await multipart(FILE_LIMIT + 1);
    expect(data.bytes.length).toBeLessThan(REQUEST_LIMIT);
    await denied(setup(), streamRequest(data.bytes, data.type).req);
  });

  it('rejects declared request excess before reading any upload bytes', async () => {
    const f = setup(); const raw = await multipart(24);
    const data = streamRequest(raw.bytes, raw.type, '4456449');
    await denied(f, data.req);
    expect(data.cancel).toHaveBeenCalledOnce();
    expect(data.pulls()).toBe(0);
    expect(data.body.locked).toBe(false);
  });

  it.each([
    ['absent', undefined], ['false-small', '1'], ['malformed', 'not-an-integer']
  ])('cancels an unknown-length oversized stream before later chunks or storage %s', async (_name, length) => {
    const raw = await multipart(5 * MIB);
    const data = streamRequest(raw.bytes, raw.type, length);
    await denied(setup(), data.req);
    expect(data.cancel).toHaveBeenCalledOnce();
    expect(data.pulls()).toBe(2);
    expect(data.body.locked).toBe(false);
  });

  it('preserves binary file bytes without text decoding or replacement', async () => {
    const f = setup(); const bytes = png(24);
    expect((await invoke(f, request(form(24)))).status).toBe(200);
    const saved = f.save.mock.calls[0];
    if (!saved) throw new Error('Expected an actual saved upload.');
    expect(saved[0]).toBe(OWNER);
    expect(saved[1].bytes).toEqual(bytes);
  });

  it('counts non-file multipart fields in the whole-request limit', async () => {
    const raw = await multipart(24, REQUEST_LIMIT);
    expect(raw.bytes.length).toBeGreaterThan(REQUEST_LIMIT);
    await denied(setup(), streamRequest(raw.bytes, raw.type).req);
  });

  it('retains the 25 MiB file boundary for other hosted Node deployments', async () => {
    const f = setup({});
    const response = await invoke(f, request(form(25 * MIB)));
    expect(response.status).toBe(200);
    expect((await response.json()).document.size).toBe(26214400);
  });

  it('retains the existing 26 MiB declared-request error outside Vercel', async () => {
    const f = setup({}); const data = stalledRequest();
    data.req.headers.set('content-length', String(26 * MIB + 1));
    const text = await denied(f, data.req, 400);
    expect(JSON.parse(text)).toEqual({ error: 'Uploaded file exceeds the 25 MB size limit.' });
  });

  it('cancels an already-aborted original request without reading or saving', async () => {
    vi.useFakeTimers();
    const c = new AbortController(); const data = stalledRequest(c.signal); c.abort();
    const f = setup(); const pending = invoke(f, data.req);
    await vi.advanceTimersByTimeAsync(30_000);
    await denialResponse(f, await pending, 499);
    expect(data.cancel).toHaveBeenCalledOnce();
    expect(data.body.locked).toBe(false);
  });

  it('cancels a pending upload when its original request aborts', async () => {
    vi.useFakeTimers();
    const c = new AbortController(); const data = stalledRequest(c.signal); const f = setup();
    const pending = invoke(f, data.req);
    await vi.advanceTimersByTimeAsync(1); c.abort();
    await vi.advanceTimersByTimeAsync(30_000);
    await denialResponse(f, await pending, 499);
    expect(data.cancel).toHaveBeenCalledOnce();
    expect(data.body.locked).toBe(false);
  });

  it('cancels a stalled upload at the existing deadline without writes', async () => {
    vi.useFakeTimers();
    const data = stalledRequest(); const f = setup();
    const pending = invoke(f, data.req);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(data.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await denialResponse(f, await pending, 400);
    expect(data.cancel).toHaveBeenCalledOnce();
    expect(data.body.locked).toBe(false);
  });

  it('uses one total existing deadline for body arrival and multipart parsing', async () => {
    const raw = await multipart(24);
    vi.useFakeTimers();
    const originalRequestParser = Request.prototype.formData;
    const originalResponseParser = Response.prototype.formData;
    vi.spyOn(Request.prototype, 'formData').mockImplementation(async function (this: Request) {
      const parsed = await originalRequestParser.call(this);
      await new Promise<void>(resolve => setTimeout(resolve, 15_000)); return parsed;
    });
    vi.spyOn(Response.prototype, 'formData').mockImplementation(async function (this: Response) {
      const parsed = await originalResponseParser.call(this);
      await new Promise<void>(resolve => setTimeout(resolve, 15_000)); return parsed;
    });
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      setTimeout(() => { controller.enqueue(raw.bytes); controller.close(); }, 20_000);
    } });
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half', headers: { 'content-type': raw.type } };
    const f = setup(); const pending = invoke(f, new Request(`${ORIGIN}/documents`, init));
    await vi.advanceTimersByTimeAsync(30_000);
    await denialResponse(f, await pending, 400);
    expect(f.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.save).not.toHaveBeenCalled();
  });

  it('authenticates before accessing an untrusted upload body', async () => {
    mocks.actor.mockResolvedValue(null);
    const data = stalledRequest(); const f = setup();
    await denied(f, data.req, 401);
    expect(data.body.locked).toBe(false);
    expect(data.cancel).not.toHaveBeenCalled();
  });

  it('rate-limits before accessing an untrusted upload body', async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 1000 });
    const data = stalledRequest(); const f = setup();
    await denied(f, data.req, 429);
    expect(data.body.locked).toBe(false);
    expect(data.cancel).not.toHaveBeenCalled();
  });

  it('saves an accepted document only under the authenticated owner tuple', async () => {
    const f = setup();
    expect((await invoke(f, request(form(24)))).status).toBe(200);
    expect(f.save).toHaveBeenCalledWith(OWNER, expect.objectContaining({ workspaceId: WORKSPACE_ID, documentId: 'synthetic-document' }));
    expect(f.blobs.listByWorkspace('different-owner', WORKSPACE_ID)).toEqual([]);
    expect(f.blobs.listByWorkspace(OWNER, WORKSPACE_ID)).toHaveLength(1);
  });

  it('keeps limit errors private without echoing multipart data or filenames', async () => {
    const f = setup();
    const text = await denied(f, request(form(FILE_LIMIT + 1, 1024)));
    expect(JSON.parse(text)).toEqual({ error: expect.any(String) });
    expect(text).not.toContain('unused-multipart-field');
  });
});

describe('native Request FormData producer cancellation regressions', () => {
  it('rejects the original native FormData excessive declaration without asynchronous producer errors', async () => {
    const { setImmediate } = await import('node:timers/promises');
    const data = new FormData();
    data.set('documentId', 'doc-huge');
    data.set('file', new File(['tiny'], 'small.pdf', { type: 'application/pdf' }));
    const f = setup({});
    const response = await invoke(f, request(data, { 'content-length': String(100 * MIB) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Uploaded file exceeds the 25 MB size limit.' });
    expect(f.save).not.toHaveBeenCalled();
    // This is an event-loop observation boundary, not a duration/retry/sleep.
    // The runner must detect any unhandled native producer rejection normally.
    await setImmediate();
  });

  it('accepts the original native FormData pair without asynchronous producer errors', async () => {
    const { setImmediate } = await import('node:timers/promises');
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const data = new FormData();
    data.set('documentId', 'doc-ok');
    data.set('file', new File([bytes], 'receipt.pdf', { type: 'application/pdf' }));
    const f = setup({});
    const response = await invoke(f, request(data));
    expect(response.status).toBe(200);
    expect((await response.json()).document).toMatchObject({ size: 4, mediaType: 'application/pdf' });
    expect(f.save).toHaveBeenCalledWith(OWNER, expect.objectContaining({ bytes, documentId: 'doc-ok' }));
    expect(f.save).toHaveBeenCalledOnce();
    await setImmediate();
  });
});

describe('native Request FormData producer cancellation regressions with an acquired reader', () => {
  it('rejects measured native FormData excess without an asynchronous producer error', async () => {
    const { setImmediate } = await import('node:timers/promises');
    const data = form(5 * MIB);
    const req = request(data);
    expect(req.headers.get('content-length')).toBeNull();
    const f = setup();
    const response = await invoke(f, req);
    await denialResponse(f, response);
    expect(req.body?.locked).toBe(false);
    // Do not suppress any producer rejection after cancelling acquired input.
    await setImmediate();
  });
});
