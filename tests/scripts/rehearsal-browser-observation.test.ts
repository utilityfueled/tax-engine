// Spec: spec/browser/rehearsal-navigation-observation.yaml.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import * as observations from '../../scripts/rehearsal-browser-diagnostics.mjs';
const origin = 'http://127.0.0.1:3000';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const main = {};
function request(url = `${origin}/_next/static/chunks/current.js`, navigation = false, frame = main) {
  return { url: () => url, resourceType: () => navigation ? 'document' : 'script',
    failure: () => ({ errorText: 'net::ERR_NETWORK_CHANGED' }),
    frame: () => frame, isNavigationRequest: () => navigation };
}
function diagnostics() {
  return observations.createRehearsalBrowserDiagnostics(origin, { isMainFrame: (frame: unknown) => frame === main });
}
afterEach(() => vi.unstubAllGlobals());
describe('strict rehearsal navigation observations', () => {
  it('attributes existing error observations to both actual request and completion phases', () => {
    const value = diagnostics();
    value.setPhase?.('previous');
    const old = request(); value.requestStarted?.(old);
    value.setPhase?.('upgrade'); value.requestFailed(old);
    expect(value.snapshot().events[0]).toMatchObject({ phaseAtStart: 'previous', phaseAtEvent: 'upgrade',
      requestObserved: true, mainFrame: true, navigationRequest: false, navigationAtStart: 0, documentAtStart: 0 });
    // Missing dispatch information is unknown, not assigned to the failed phase.
    value.requestFailed(request());
    expect(value.snapshot().events[1]).toMatchObject({ phaseAtStart: 'unavailable', phaseAtEvent: 'upgrade', requestObserved: false });
  });
  it('keeps main-document request order separate from frame-commit order', () => {
    const value = diagnostics(); value.setPhase?.('previous');
    const beforeCommit = request(); value.requestStarted?.(beforeCommit);
    const nav = request(`${origin}/returns/private-id?local=1`, true); value.requestStarted?.(nav);
    value.frameCommitted?.(main);
    const current = request(); value.requestStarted?.(current);
    value.requestFailed(beforeCommit); value.requestFailed(current);
    expect(value.snapshot().events[0]).toMatchObject({ navigationAtStart: 0, documentAtStart: 0 });
    expect(value.snapshot().events[1]).toMatchObject({ navigationAtStart: 1, documentAtStart: 1 });
    value.frameCommitted?.({});
    expect(value.snapshot().documentSequence).toBe(1);
  });
  it('keeps unknown phase and request material out of saved observations', () => {
    const value = diagnostics(); value.setPhase?.('private-name-900-70-0033');
    const req = request(`${origin}/_next/static/private-900-70-0033.js?token=secret#private`);
    value.requestStarted?.(req); value.requestFailed(req);
    const saved = value.snapshot();
    expect(saved.events[0]).toMatchObject({ phaseAtStart: 'unavailable', phaseAtEvent: 'unavailable' });
    for (const marker of ['900-70-0033', 'private-name', 'token', 'secret', origin]) expect(JSON.stringify(saved)).not.toContain(marker);
  });
  it('projects the existing navigation response without another request or raw header', () => {
    const value = diagnostics(); value.setPhase?.('upgrade');
    const req = request(`${origin}/returns/private-id?local=1`, true); value.requestStarted?.(req);
    const headers = vi.fn(() => ({ 'cache-control': 'private, no-cache, no-store, max-age=0, must-revalidate', 'set-cookie': 'secret-cookie' }));
    value.navigationResponse?.({ status: () => 200, headers, fromServiceWorker: () => false, request: () => req });
    expect(value.snapshot().navigationResponses).toEqual([{ available: true, status: 200, phase: 'upgrade', navigationSequence: 1,
      fromServiceWorker: false, cachePolicy: { available: true, noStore: true, noCache: true, private: true, mustRevalidate: true, maxAgeZero: true } }]);
    expect(headers).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(value.snapshot())).not.toContain('secret');
  });
});

function fakePage(scripts: string[], links: { rel: string; href: string }[], resources: { name: string; initiatorType: string }[]) {
  vi.stubGlobal('document', { readyState: 'complete', body: { textContent: 'Loading your return... private taxpayer' },
    querySelector: () => ({}), scripts: scripts.map(src => ({ src })), getElementsByTagName: () => links });
  vi.stubGlobal('location', { origin });
  vi.stubGlobal('performance', { getEntriesByType: () => resources });
  vi.stubGlobal('crypto', webcrypto);
}
it('hashes only current-document public static asset dependencies and fixed initiator categories', async () => {
  fakePage([`${origin}/_next/static/chunks/a.js?token=private`, 'https://external.test/_next/static/private.js', `${origin}/returns/private-id.js`],
    [{ rel: 'preload', href: `${origin}/_next/static/chunks/b.js#private` }, { rel: 'stylesheet', href: `${origin}/_next/static/no-preload.css` }],
    [{ name: `${origin}/_next/static/chunks/a.js?other=private`, initiatorType: 'script' },
      { name: `${origin}/_next/static/chunks/b.js`, initiatorType: 'private-category' }]);
  const state = await observations.collectRehearsalPageState();
  expect(state).toEqual({ available: true, readyState: 'complete', hasHeading: true, loadingReturn: true,
    staticAssets: { available: true, assetOverflow: false, scriptScanTruncated: false, linkScanTruncated: false, resourceScanTruncated: false,
      records: [
        { pathSha256: digest('/_next/static/chunks/a.js'), scriptElement: true, preloadLink: false, initiatorTypes: ['script'] },
        { pathSha256: digest('/_next/static/chunks/b.js'), scriptElement: false, preloadLink: true, initiatorTypes: ['other'] },
      ] } });
  for (const marker of ['private', '/_next/', origin, 'token', 'external', 'no-preload']) expect(JSON.stringify(state)).not.toContain(marker);
});
it('preserves original page booleans when additional asset inspection is unavailable', async () => {
  fakePage([], [], []);
  vi.stubGlobal('performance', { getEntriesByType: () => { throw new Error('private-resource-error'); } });
  expect(await observations.collectRehearsalPageState()).toEqual({ available: true, readyState: 'complete', hasHeading: true, loadingReturn: true,
    staticAssets: { available: false, reason: 'unavailable' } });
});
it('bounds static asset scans and retained records without claiming unobserved absence', async () => {
  const scripts = Array.from({ length: 101 }, (_, i) => `${origin}/_next/static/chunks/${i}.js`);
  fakePage(scripts, [{ rel: 'modulepreload', href: `${origin}/_next/static/chunks/new.js` }], []);
  const state = await observations.collectRehearsalPageState();
  expect(state.staticAssets.records).toHaveLength(100);
  expect(state.staticAssets).toMatchObject({ scriptScanTruncated: true, linkScanTruncated: false, assetOverflow: true });
  expect(state.staticAssets.records.some((r: { pathSha256: string }) => r.pathSha256 === digest('/_next/static/chunks/100.js'))).toBe(false);
});
it('does not let long paths query material or unknown resource categories escape hashing', async () => {
  fakePage([`${origin}/_next/static/${'x'.repeat(2050)}`, `${origin}/_next/static/../private`, 'data:text/javascript,private'], [],
    [{ name: `${origin}/_next/static/chunks/retained.js?secret=private`, initiatorType: 'constructor' }]);
  const state = await observations.collectRehearsalPageState();
  expect(state.staticAssets.records).toEqual([{ pathSha256: digest('/_next/static/chunks/retained.js'), scriptElement: false, preloadLink: false, initiatorTypes: ['other'] }]);
  expect(JSON.stringify(state)).not.toContain('private');
});
it('never treats unavailable dispatch metadata as a current-document proof at its cap', () => {
  const value = diagnostics(); value.setPhase('previous');
  for (let n = 0; n < 1000; n++) value.requestStarted(request());
  value.setPhase('upgrade'); const later = request(); value.requestStarted(later); value.requestFailed(later);
  expect(value.snapshot()).toMatchObject({ requestsTracked: 1000, requestTrackingDropped: 1 });
  expect(value.snapshot().events[0]).toMatchObject({ requestObserved: false, phaseAtStart: 'unavailable', navigationAtStart: null, documentAtStart: null });
});
it('keeps100 failure observations and20 navigation responses with independent safe copies', () => {
  const value = diagnostics(); value.setPhase('upgrade');
  const req = request(); value.requestStarted(req);
  for (let n = 0; n < 125; n++) value.requestFailed(req);
  for (let n = 0; n < 23; n++) value.navigationResponse({ status: () => 200, headers: () => ({ 'cache-control': 'private' }), fromServiceWorker: () => false, request: () => req });
  const saved = value.snapshot();
  expect(saved.events).toHaveLength(100); expect(saved.dropped).toBe(25);
  expect(saved.navigationResponses).toHaveLength(20); expect(saved.navigationResponsesDropped).toBe(3);
  saved.navigationResponses[0].cachePolicy.private = false;
  expect(value.snapshot().navigationResponses[0].cachePolicy.private).toBe(true);
});
it('keeps absent and overlong response policies unknown and unavailable errors fixed', () => {
  const value = diagnostics(); const req = request(); value.requestStarted(req);
  for (const headers of [{}, { 'cache-control': 'secret'.repeat(500) }]) value.navigationResponse({ status: () => 200, headers: () => headers, fromServiceWorker: () => false, request: () => req });
  value.navigationResponse({ status: () => { throw new Error('private-response-error'); } });
  expect(value.snapshot().navigationResponses[0].cachePolicy).toEqual({ available: false, noStore: null, noCache: null, private: null, mustRevalidate: null, maxAgeZero: null });
  expect(value.snapshot().navigationResponses[1].cachePolicy).toEqual(value.snapshot().navigationResponses[0].cachePolicy);
  expect(value.snapshot().navigationResponses[2]).toEqual({ available: false, phase: 'unavailable', reason: 'unavailable' });
  expect(JSON.stringify(value.snapshot())).not.toContain('secret');
});
it('does not record additional requests or commands while reading an existing response', () => {
  const forbidden = vi.fn(() => { throw new Error('Observation cannot perform HTTP'); });
  vi.stubGlobal('fetch', forbidden);
  const value = diagnostics();
  value.navigationResponse(null);
  expect(forbidden).not.toHaveBeenCalled();
  expect(value.snapshot().navigationResponses).toEqual([{ available: false, phase: 'unavailable', reason: 'unavailable' }]);
});
