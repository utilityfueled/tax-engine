# DOM interaction test dependency

On 2026-10-24, added exact development dependency `jsdom@30.1.3` to run real
React events for privacy, cancellation and required-fact UI controls. It is
selected per test file; the rest of Vitest remains in Node. Runtime dependencies,
TypeScript 5.9.3, Decimal.js 10.6.0 and pdf-lib 1.17.1 are unchanged.

Official sources: [jsdom](https://github.com/jsdom/jsdom) and
[Vitest test environments](https://vitest.dev/guide/environment). The official
npm registry reports Node compatibility `^22.22.2 || ^24.15.0 || >=26.0.0`, which
includes the pinned Node 24.22.1 runtime. No browser layout or staging readiness
claim follows from DOM emulation.

The install used strict peer checks. A subsequent frozen-lockfile install with
strict peers and lifecycle scripts disabled passed. Fresh `pnpm audit --json`
reports zero advisories over 519 dependency entries. The existing Sentry CLI
install-script restriction remains; no new lifecycle-script approval was added.
Evidence is under `.local/upgrade-evidence/dom-test-dependency-*`.

The initial helper interaction suite passes 18 tests including the existing four
helper formatting tests. Opt-in, selected-document retention, cancellation,
workspace changes, late-result suppression, exact cent display, local storage
failure, account/budget error recovery and upload outcomes use actual React DOM
events with a mocked provider. No live provider, account or taxpayer data is used.
