import { readFile } from 'node:fs/promises';

const unavailable = Object.freeze({ status: 'unavailable' });
const SAMPLE_BUDGET_MS = 125;

function counters(text, pattern) {
  const match = pattern.exec(text);
  if (!match) throw new Error('scheduler counter unavailable');
  return match.slice(1).map(BigInt);
}

export async function readRendererScheduler(processInfo, read = readFile) {
  const renderers = processInfo.filter(({ type, id }) =>
    type === 'renderer' && Number.isSafeInteger(id) && id > 0,
  );
  if (renderers.length === 0 || renderers.length > 16) throw new Error('unexpected renderer count');
  const [waitSetting, pressure, ...stats] = await Promise.all([
    read('/proc/sys/kernel/sched_schedstats', 'utf8').then(text => text.trim() === '1', () => false),
    read('/proc/pressure/cpu', 'utf8')
      .then(text => counters(text, /^some avg10=[\d.]+ avg60=[\d.]+ avg300=[\d.]+ total=(\d+)$/m)[0])
      .catch(() => null),
    ...renderers.map(({ id }) => read(`/proc/${id}/schedstat`, 'utf8')),
  ]);
  const threads = new Map(renderers.map(({ id }, i) => [id, counters(stats[i], /^(\d+)\s+(\d+)\s+(\d+)\s*$/u)]));
  if (threads.size !== renderers.length) throw new Error('duplicate renderers');
  return { threads, waitSetting, pressure };
}

export function rendererSchedulerDelta(before, after) {
  if (!before || !after) return unavailable;
  const pressure = before.pressure !== null && after.pressure !== null && after.pressure >= before.pressure
    ? { status: 'host-pressure-only', hostCpuPressureMicroseconds: String(after.pressure - before.pressure) }
    : unavailable;
  if (before.threads.size !== after.threads.size || before.waitSetting !== after.waitSetting) return pressure;
  const totals = [0n, 0n, 0n];
  for (const [id, start] of before.threads) {
    const end = after.threads.get(id);
    if (!end || end.some((value, index) => value < start[index])) return pressure;
    // Some Linux builds report all-zero schedstat when task accounting is off.
    if (!before.waitSetting && start[2] === 0n) return pressure;
    for (const [index, value] of end.entries()) totals[index] += value - start[index];
  }
  const [cpu, wait, slices] = totals;
  return {
    status: 'measured',
    rendererMainThreads: before.threads.size,
    cpuNanoseconds: String(cpu),
    runnableWaitNanoseconds: String(wait),
    timeslices: String(slices),
    hostCpuPressureMicroseconds: pressure.hostCpuPressureMicroseconds ?? null,
  };
}

async function boundedSample(sample) {
  let timer;
  try {
    return await Promise.race([
      sample().catch(() => null),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), SAMPLE_BUDGET_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function snapshot(session) {
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  return readRendererScheduler(processInfo);
}

function detach(session) {
  if (session) void session.detach().catch(() => {});
}

export async function measureRendererScheduler(browser, action, report) {
  let session;
  let closed = false;
  const before = await boundedSample(async () => {
    const attached = await browser.newBrowserCDPSession();
    if (closed) {
      detach(attached);
      return null;
    }
    session = attached;
    return snapshot(session);
  });
  if (!before) {
    closed = true;
    detach(session);
    session = null;
  }
  try {
    return await action();
  } finally {
    const after = session ? await boundedSample(() => snapshot(session)) : null;
    detach(session);
    report(rendererSchedulerDelta(before, after));
  }
}

/** Runs only in the opt-in Linux comparison. The default path makes no CDP or proc calls. */
export function observeRendererScheduler(browser, action) {
  const mode = process.env.TAX_BROWSER_OHIO_SCHEDULER_MODE;
  if (process.platform !== 'linux' || !['container', 'managed'].includes(mode) || !browser) return action();
  return measureRendererScheduler(browser, action, result => {
    console.info(`OH_HEADER_RENDERER_SCHEDULER ${JSON.stringify({ mode, ...result })}`);
  });
}
