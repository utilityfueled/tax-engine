import { describe, expect, it } from 'vitest';
import { runSchedule, rowsFromReport } from '../../scripts/run-browser-tests.mjs';

type Clock = {mono: number; wall: number};
const scopes = ['filled-return', 'provider', 'business-expense-analysis', 'self-employment-income-analysis'];
function fixture(count = 1) {
  const reports = Array.from({length: count}, (_, i) => ({errors: [], config: {workers: 2, projects: [{retries: 0, repeatEach: 1}]}, suites: [{title: `${i}.spec.ts`, file: `${i}.spec.ts`, specs: [{id: `id${i}`, file: `${i}.spec.ts`, title: `case${i}`, tests: [{projectName: 'chromium', timeout: 30000, expectedStatus: 'passed', results: [{status: 'passed', retry: 0}]}]}]}]}));
  const expected = reports.flatMap(report => rowsFromReport(report));
  const bounds = Object.fromEntries(scopes.map(scope => [scope, 0]));
  const audit = {version: 1, windowMs: 60000, maxRequests: 20, files: Object.fromEntries(expected.map(row => [row.file, {caseCount: 1, bounds, skippedTitles: []}]))};
  const batches = expected.map(row => ({rows: [row], bounds}));
  let clock: Clock = {mono: 0, wall: 0};
  const waits: number[] = [], starts: Clock[] = [], records: Array<{start: Clock; close: Clock}> = [];
  let cleanups = 0, identities = 0;
  const io = {
    now: (): Clock => ({...clock}),
    sleep: async (ms: number) => {waits.push(ms); clock = {mono: clock.mono + ms, wall: clock.wall + ms};},
    identity: async () => {identities++;},
    alive: () => true,
    run: async (_batch: unknown, index: number) => {starts.push({...clock}); clock = {mono: clock.mono + 37, wall: clock.wall + 37}; return {exit: 0, report: reports[index]};},
    record: async (row: {start: Clock; close: Clock}) => {records.push(row);},
    cleanup: async () => {cleanups++; return true;},
  };
  return {io, waits, starts, records, get clock() {return clock;}, set clock(next: Clock) {clock = next;}, get cleanups() {return cleanups;}, get identities() {return identities;}, execute: () => runSchedule({batches, expected, audit, io})};
}

describe('browser natural-window contract', () => {
  it('rounds fractional remaining delay up instead of trusting truncated time', async () => {
    const f = fixture();
    f.io.identity = async () => {if (!f.waits.length) f.clock = {mono: 0.25, wall: 0.25};};
    f.io.sleep = async ms => {f.waits.push(ms); const elapsed = Math.trunc(ms); f.clock = {mono: f.clock.mono + elapsed, wall: f.clock.wall + elapsed};};
    expect(await f.execute()).toMatchObject({status: 'PASS', caseCount: 1, batchesCompleted: 1, cleanup: true});
    expect(f.waits).toEqual([61000]);
    expect(f.starts).toEqual([{mono: 61000.25, wall: 61000.25}]);
  });
  it('rechecks a timer that wakes before both natural clocks expire', async () => {
    const f = fixture();
    f.io.sleep = async ms => {f.waits.push(ms); const elapsed = f.waits.length === 1 ? ms - 0.5 : ms; f.clock = {mono: f.clock.mono + elapsed, wall: f.clock.wall + elapsed};};
    expect(await f.execute()).toMatchObject({status: 'PASS', caseCount: 1, cleanup: true});
    expect(f.waits).toEqual([61000, 1]);
    expect(f.starts).toEqual([{mono: 61000.5, wall: 61000.5}]);
    expect(f.cleanups).toBe(1);
  });
  it.each(['mono', 'wall'] as const)('waits for the slower %s clock independently', async slow => {
    const f = fixture();
    f.io.sleep = async ms => {f.waits.push(ms); f.clock = f.waits.length === 1 ? {mono: slow === 'mono' ? 60999 : 61001, wall: slow === 'wall' ? 60999 : 61001} : {mono: f.clock.mono + ms, wall: f.clock.wall + ms};};
    expect(await f.execute()).toMatchObject({status: 'PASS', caseCount: 1});
    expect(f.waits).toEqual([61000, 1]);
    expect(f.starts[0].mono).toBeGreaterThanOrEqual(61000);
    expect(f.starts[0].wall).toBeGreaterThanOrEqual(61000);
  });
  it('allows several observed early wakes without running early or repeating a test', async () => {
    const f = fixture();
    f.io.sleep = async ms => {f.waits.push(ms); const elapsed = f.waits.length === 1 ? 60999.25 : 0.25; f.clock = {mono: f.clock.mono + elapsed, wall: f.clock.wall + elapsed};};
    expect(await f.execute()).toMatchObject({status: 'PASS', caseCount: 1});
    expect(f.waits).toEqual([61000, 1, 1, 1]);
    expect(f.starts).toEqual([{mono: 61000, wall: 61000}]);
  });
  it('bounds repeated early wakes without invoking a batch', async () => {
    const f = fixture();
    f.io.sleep = async ms => {f.waits.push(ms); f.clock = {mono: 60999, wall: 60999};};
    expect(await f.execute()).toMatchObject({status: 'FAIL', batchesCompleted: 0, cleanup: true});
    expect(f.waits).toHaveLength(8);
    expect(f.waits).toEqual([61000, 1, 1, 1, 1, 1, 1, 1]);
    expect(f.starts).toEqual([]);
    expect(f.cleanups).toBe(1);
  });
  it('bounds a frozen clock by cumulative requested delay', async () => {
    const f = fixture();
    f.io.sleep = async ms => {f.waits.push(ms);};
    expect(await f.execute()).toMatchObject({status: 'FAIL', batchesCompleted: 0, cleanup: true});
    expect(f.waits).toEqual([61000]);
    expect(f.starts).toEqual([]);
  });
  it.each(['mono', 'wall'] as const)('rejects a backward %s observation even when the other clock expires', async backwards => {
    const f = fixture(); f.clock = {mono: 10, wall: 10};
    f.io.sleep = async ms => {f.waits.push(ms); f.clock = {mono: backwards === 'mono' ? 9 : 70000, wall: backwards === 'wall' ? 9 : 70000};};
    expect(await f.execute()).toMatchObject({status: 'FAIL', cleanup: true});
    expect(f.starts).toEqual([]);
    expect(f.waits).toEqual([61000]);
  });
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])('rejects unknown or unbounded clock values %s before sleeping', async value => {
    const f = fixture(); f.clock = {mono: value, wall: 0};
    expect(await f.execute()).toMatchObject({status: 'FAIL', cleanup: true});
    expect(f.waits).toEqual([]); expect(f.starts).toEqual([]); expect(f.cleanups).toBe(1);
  });
  it('retains cleanup when the initial clock cannot be read', async () => {
    const f = fixture(); f.io.now = () => {throw Error('clock unavailable');};
    expect(await f.execute()).toMatchObject({status: 'FAIL', error: 'clock unavailable', cleanup: true});
    expect(f.waits).toEqual([]); expect(f.cleanups).toBe(1);
  });
  it('checks current source and runtime before waiting again', async () => {
    for (const failure of ['source', 'runtime']) {
      const f = fixture();
      f.io.sleep = async ms => {f.waits.push(ms); f.clock = {mono: 60999, wall: 60999};};
      f.io.identity = async () => {if (f.waits.length && failure === 'source') throw Error('source drift');};
      f.io.alive = () => !(f.waits.length && failure === 'runtime');
      expect(await f.execute()).toMatchObject({status: 'FAIL', cleanup: true});
      expect(f.waits).toEqual([61000]); expect(f.starts).toEqual([]);
    }
  });
  it('retains cancelled timer failure and cleanup without another attempt', async () => {
    const f = fixture(); f.io.sleep = async ms => {f.waits.push(ms); throw Error('aborted');};
    expect(await f.execute()).toMatchObject({status: 'FAIL', error: 'aborted', cleanup: true});
    expect(f.starts).toEqual([]); expect(f.cleanups).toBe(1);
  });
  it('starts the next complete gap at the prior batch close', async () => {
    const f = fixture(2);
    f.io.sleep = async ms => {f.waits.push(ms); const elapsed = f.waits.length % 2 ? ms - 0.5 : ms; f.clock = {mono: f.clock.mono + elapsed, wall: f.clock.wall + elapsed};};
    expect(await f.execute()).toMatchObject({status: 'PASS', batchesCompleted: 2, caseCount: 2, failed: 0, skipped: 0, cleanup: true});
    expect(f.waits).toEqual([61000, 1, 61000, 1]);
    expect(f.starts).toHaveLength(2);
    expect(f.records).toHaveLength(2);
    expect(f.records[1].start.mono - f.records[0].close.mono).toBeGreaterThanOrEqual(61000);
    expect(f.records[1].start.wall - f.records[0].close.wall).toBeGreaterThanOrEqual(61000);
    expect(f.cleanups).toBe(1);
  });
});
