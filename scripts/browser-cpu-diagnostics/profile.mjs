import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';

export const LIMITS = Object.freeze({ periodMs: 30000, stopAfterMs: 29000, commandMs: 1000, intervalUs: 1000, nodes: 20000, edges: 80000, samples: 40000, bytes: 8 * 1024 * 1024 });
export const ORIGIN = 'http://127.0.0.1:3109';
const TAG = 'NONQUALIFYING_DIAGNOSTIC';
export const unavailable = code => ({ version: 1, qualification: TAG, status: 'unavailable', code });
const check = (condition, code = 'invalid-profile') => { if (!condition) throw new Error(code); };
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;

function inventoryDataEntries(value, maximum) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'invalid-inventory');
  const prototype = Object.getPrototypeOf(value);
  check(prototype === Object.prototype || prototype === null, 'invalid-inventory');
  const keys = Reflect.ownKeys(value);
  check(keys.length > 0 && keys.length <= maximum, 'invalid-inventory');
  return keys.map(key => {
    check(typeof key === 'string', 'invalid-inventory');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value'), 'invalid-inventory');
    return [key, descriptor.value];
  });
}

/** Only paths independently enumerated from the job-owned image can become locations. */
export function validateInventory(inventory) {
  const entries = inventoryDataEntries(inventory, 4096);
  for (const [name, value] of entries) {
    check(/^\/_next\/static\/[A-Za-z0-9_@.()%[\]/-]+\.js$/u.test(name) && name.length <= 512 && !name.split('/').some(p => p === '.' || p === '..') && !/%(?!5B|5D|28|29)/u.test(name), 'invalid-inventory');
    const fields = new Map(inventoryDataEntries(value, 2));
    check(fields.size === 2 && fields.has('sha256') && fields.has('bytes'), 'invalid-inventory');
    check(typeof fields.get('sha256') === 'string' && /^[a-f0-9]{64}$/u.test(fields.get('sha256')) && integer(fields.get('bytes'), 1) && fields.get('bytes') <= 32 * 1024 * 1024, 'invalid-inventory');
  }
}

/** Never forward an inventory value wholesale into an uploaded plan. */
export function publicChunkMetadata(inventory) {
  validateInventory(inventory);
  return Object.values(inventory).map(({ sha256, bytes }) => ({ sha256, bytes }));
}

function classify(frame, inventory) {
  if (frame.url === '') {
    const kinds = new Map([['(idle)', 'idle'], ['(program)', 'program'], ['(garbage collector)', 'garbageCollector']]);
    const kind = kinds.get(frame.functionName);
    return { kind: kind ?? 'other' };
  }
  // Do not normalize an arbitrary input into the allowlist (including dot segments).
  if (!frame.url.startsWith(ORIGIN + '/')) return { kind: 'other' };
  const chunk = frame.url.slice(ORIGIN.length);
  if (!Object.hasOwn(inventory, chunk) || chunk.includes('?') || chunk.includes('#') || !integer(frame.lineNumber) || frame.lineNumber > 2147483647 || !integer(frame.columnNumber) || frame.columnNumber > 2147483647) return { kind: 'other' };
  return { kind: 'publicJavaScript', sha256: inventory[chunk].sha256, line: frame.lineNumber + 1, column: frame.columnNumber + 1 };
}

/** The protocol response is already in memory. These bounds limit accepted work/output, not transport peak memory. */
export function summarizeProfile(raw, { origin, inventory }) {
  try {
    check(origin === ORIGIN, 'invalid-target'); validateInventory(inventory);
    check(raw && Array.isArray(raw.nodes) && Array.isArray(raw.samples) && Array.isArray(raw.timeDeltas));
    check(raw.nodes.length <= LIMITS.nodes && raw.samples.length <= LIMITS.samples && raw.timeDeltas.length <= LIMITS.samples, 'profile-limit');
    check(raw.nodes.length > 0 && raw.samples.length > 0 && raw.samples.length === raw.timeDeltas.length);
    check(Number.isFinite(raw.startTime) && Number.isFinite(raw.endTime) && raw.startTime >= 0 && raw.endTime >= raw.startTime);
    const span = raw.endTime - raw.startTime;
    check(span <= LIMITS.periodMs * 1000, 'profile-limit');
    let edges = 0, measuredBytes = 0;
    const byId = new Map(), parents = new Map();
    const nodes = raw.nodes.map(node => {
      check(node && integer(node.id, 1) && !byId.has(node.id) && node.callFrame);
      const frame = node.callFrame;
      check(typeof frame.functionName === 'string' && typeof frame.url === 'string');
      check(frame.functionName.length <= 4096 && frame.url.length <= 4096, 'profile-limit');
      measuredBytes += Buffer.byteLength(frame.functionName) + Buffer.byteLength(frame.url) + 128;
      check(measuredBytes <= LIMITS.bytes, 'profile-limit');
      const children = node.children ?? [];
      check(Array.isArray(children)); edges += children.length; check(edges <= LIMITS.edges, 'profile-limit');
      const safe = { id: node.id, ...classify(frame, inventory), children: [...children] };
      byId.set(node.id, safe); return safe;
    });
    for (const node of nodes) for (const child of node.children) {
      check(integer(child, 1) && byId.has(child) && child !== nodes[0].id && !parents.has(child)); parents.set(child, node.id);
    }
    // Verify one rooted tree iteratively, rather than following untrusted recursive links.
    const seen = new Set(), pending = [nodes[0].id];
    while (pending.length) { const id = pending.pop(); check(!seen.has(id)); seen.add(id); pending.push(...byId.get(id).children); }
    check(seen.size === nodes.length);
    const categories = Object.fromEntries(['publicJavaScript', 'idle', 'program', 'garbageCollector', 'other'].map(k => [k, { samples: 0, intervalWeightUs: 0 }]));
    const locations = new Map(); let sampled = 0;
    for (let i = 0; i < raw.samples.length; i++) {
      const id = raw.samples[i], delta = raw.timeDeltas[i]; check(integer(id, 1) && byId.has(id) && integer(delta));
      sampled += delta; check(Number.isSafeInteger(sampled) && sampled <= span);
      const node = byId.get(id), category = categories[node.kind]; category.samples++; category.intervalWeightUs += delta;
      if (node.kind === 'publicJavaScript') {
        const key = JSON.stringify([node.sha256, node.line, node.column]);
        const row = locations.get(key) ?? { sha256: node.sha256, line: node.line, column: node.column, samples: 0, intervalWeightUs: 0 };
        row.samples++; row.intervalWeightUs += delta; locations.set(key, row);
      }
    }
    const result = { version: 1, qualification: TAG, status: 'available', scope: 'current-page-main-isolate', samplingIntervalRequestedUs: LIMITS.intervalUs, requestedStopAfterMs: LIMITS.stopAfterMs, acceptedSpanLimitUs: LIMITS.periodMs * 1000,
      timing: { kind: 'sampling-wall-intervals-not-process-cpu', profileSpanUs: span, sampledIntervalUs: sampled, unsampledTailUs: span - sampled },
      sourceMapping: 'generated-public-chunk-only-source-maps-deferred', categories,
      locations: [...locations.values()].sort((a, b) => b.intervalWeightUs - a.intervalWeightUs || a.sha256.localeCompare(b.sha256) || a.line - b.line || a.column - b.column),
      nodes, samples: [...raw.samples], timeDeltas: [...raw.timeDeltas] };
    check(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.bytes, 'profile-limit'); return result;
  } catch (error) {
    const allowed = ['invalid-target', 'invalid-inventory', 'invalid-profile', 'profile-limit'];
    return unavailable(allowed.includes(error?.message) ? error.message : 'invalid-profile');
  }
}

async function within(operation, deadline) {
  const ms = deadline - performance.now();
  if (ms <= 0) throw new Error('profiler-unavailable');
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('profiler-unavailable')), ms); })]); }
  finally { clearTimeout(timer); }
}

/** Test body errors propagate unchanged. Only profiler failures become fixed unavailable records. */
export async function withProfile({ enabled, origin, inventory, createSession, use, save }) {
  if (enabled !== true) return use();
  let session, acquisitionExpired = false, setupFailed = false, timer, finished;
  let record = unavailable('profiler-unavailable');
  const finish = () => {
    if (finished) return finished;
    finished = (async () => {
      clearTimeout(timer); const deadline = performance.now() + LIMITS.commandMs;
      if (!session) return;
      try {
        const response = await within(() => session.send('Profiler.stop'), deadline);
        if (!setupFailed) record = summarizeProfile(response?.profile, { origin, inventory });
      } catch { record = unavailable('profiler-unavailable'); }
      finally {
        const disable = Promise.resolve().then(() => session.send('Profiler.disable')).catch(() => {});
        try { await within(() => disable, deadline); } catch { /* Fixed record only; no raw error. */ }
        // Always issue detach, even when stop consumed the shared cleanup budget.
        const detach = Promise.resolve().then(() => session.detach()).catch(() => {});
        try { await within(() => detach, deadline); } catch { /* Parent context cleanup still owns the page. */ }
      }
    })();
    return finished;
  };
  try {
    check(origin === ORIGIN, 'invalid-target'); validateInventory(inventory);
    const deadline = performance.now() + LIMITS.commandMs;
    const pending = Promise.resolve().then(createSession);
    pending.then(late => { if (acquisitionExpired) void Promise.resolve().then(() => late.detach()).catch(() => {}); }, () => {});
    try { session = await within(() => pending, deadline); } catch { acquisitionExpired = true; throw new Error('profiler-unavailable'); }
    await within(() => session.send('Profiler.enable'), deadline);
    await within(() => session.send('Profiler.setSamplingInterval', { interval: LIMITS.intervalUs }), deadline);
    await within(() => session.send('Profiler.start'), deadline);
    timer = setTimeout(() => { void finish(); }, LIMITS.stopAfterMs);
  } catch (error) {
    setupFailed = true;
    record = unavailable(['invalid-target', 'invalid-inventory'].includes(error?.message) ? error.message : 'profiler-unavailable');
    await finish();
  }
  try { return await use(); }
  finally {
    await finish();
    try { await within(() => save(record), performance.now() + LIMITS.commandMs); } catch { /* Missing artifact is a fixed runner-level unavailable result. */ }
  }
}

/** Rebuild the allowed record from its numeric schema; never forward arbitrary transient JSON. */
export function sanitizeStoredRecord(record, options) {
  try {
    if (record?.status === 'unavailable') {
      const codes = ['invalid-target', 'invalid-inventory', 'invalid-profile', 'profile-limit', 'profiler-unavailable', 'profile-not-recovered'];
      check(codes.includes(record.code)); const safe = unavailable(record.code);
      check(JSON.stringify(record) === JSON.stringify(safe)); return safe;
    }
    check(record?.status === 'available' && Array.isArray(record.nodes) && record.nodes.length <= LIMITS.nodes);
    validateInventory(options.inventory);
    const paths = new Map(Object.entries(options.inventory).map(([name, value]) => [value.sha256, name]));
    const fixedNames = { idle: '(idle)', program: '(program)', garbageCollector: '(garbage collector)', other: '' };
    const raw = { startTime: 0, endTime: record.timing?.profileSpanUs, samples: record.samples, timeDeltas: record.timeDeltas,
      nodes: record.nodes.map(n => {
        check(n && ['publicJavaScript', 'idle', 'program', 'garbageCollector', 'other'].includes(n.kind));
        if (n.kind === 'publicJavaScript') check(paths.has(n.sha256) && integer(n.line, 1) && integer(n.column, 1));
        return { id: n.id, children: n.children, callFrame: { functionName: fixedNames[n.kind] ?? '', url: n.kind === 'publicJavaScript' ? ORIGIN + paths.get(n.sha256) : '', lineNumber: n.kind === 'publicJavaScript' ? n.line - 1 : -1, columnNumber: n.kind === 'publicJavaScript' ? n.column - 1 : -1 } };
      }),
    };
    const safe = summarizeProfile(raw, options);
    check(safe.status === 'available' && JSON.stringify(record) === JSON.stringify(safe)); return safe;
  } catch { return unavailable('invalid-artifact'); }
}
