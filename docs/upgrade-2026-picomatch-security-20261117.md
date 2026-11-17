# Picomatch advisory refresh — November 17, 2026

Status: unresolved advisory; no dependency change or risk acceptance. Inspected
source `95270afa932cfe184c3d6f2e3705035ee00e1226`. This investigation does not
qualify the current production image or waive the security readiness gate.

## Official sources and available fix

- [GitHub Reviewed GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
  refreshed November 17: picomatch through 4.0.7 is affected; no patched release
  is identified. Repeated single-branch extglobs such as `+(*)` and `+(*a)` can
  generate nested repetition and consume the Node event loop during matching.
- The npm registry, queried with `pnpm view picomatch version dist-tags
  time.modified --json`, still reports latest **4.0.7**, modified
  `2026-08-24T14:36:23.879Z`.
- [The advisory's referenced upstream PR #194](https://github.com/micromatch/picomatch/pull/194)
  is open and unmerged. Its inspected head is
  `7be3276fb8bd215a8c73fa066bcaf696c244ad88`, updated November 9.
  [Immutable parser source](https://github.com/micromatch/picomatch/blob/7be3276fb8bd215a8c73fa066bcaf696c244ad88/lib/parse.js)
  adds a mixed `?`/`*` check but leaves the two advisory patterns' generated
  parser output unchanged. An unmerged patch that leaves these cases unchanged
  is not a supported remediation for this advisory.

## Before/after audit and exposure

| Scope | Before | Refreshed after investigation |
| --- | --- | --- |
| Full `pnpm audit --json` | 2 high; all other severities 0 | 2 high; all other severities 0 |
| `pnpm audit --prod --json` | No earlier production-only observation claimed | 1 high; all other severities 0 |

Full-audit paths are root development dependencies:

- `@next/eslint-plugin-next → fast-glob → micromatch → picomatch@2.3.2`.
- `@vitest/ui → tinyglobby → picomatch@4.0.7`.

The production-only audit additionally identifies the workspace app's declared
dependency ancestry `@sentry/nextjs → @rollup/plugin-commonjs → picomatch@4.0.7`.
The full audit's two reported paths therefore do **not** prove that affected
packages are absent from production-declared dependencies. Recursive `pnpm why`
also shows tool paths through Vite, TypeScript ESLint and Vitest, including
Vitest beneath better-auth. Counts are advisory-path reports, not a complete
reachability analysis.

The inspected Sentry consumer is its Next build `config/loaders/wrappingLoader`.
It supplies `strictRequires: true` and no `include`/`exclude` patterns to the
CommonJS plugin. At the inspected Rollup implementation, that boolean bypasses
the strict-requires glob filter; empty include/exclude filters compile no
patterns. The app imports Sentry's configuration wrapper from `next.config.ts`.
Next ESLint's glob input comes from the repository's configured absolute app
root. Vitest's file selection is the repository's fixed test configuration.
A search of project `src`, `apps/web/src`, `packages` and `scripts` found no
direct imports/usages of picomatch, micromatch, tinyglobby or fast-glob.

These observations narrow the inspected route to build/test configuration,
rather than establishing a request-supplied glob path. They are **not** proof
that every transitive or bundled consumer, deployed artifact, or future
configuration is unreachable. Untrusted patterns must not be introduced into
these glob APIs. No unsupported override, disabled extglob semantics, upstream
patch application, audit ignore, threshold reduction or package removal was
made.

## Checks and durable evidence

Evidence directory: `.local/upgrade-evidence/nov17-picomatch-advisory/`.

- `audit-after.json`: fresh full audit; same advisory and two high findings as
  `.local/upgrade-evidence/nov17-continuation-package-audit/audit.json`.
- `audit-production.json`, `why.json`: production-only audit and recursive
  installed ancestry. Registry and upstream PR responses are saved separately.
- `compile-only.cjs` / `compile-only.json`: four passing parser-output controls,
  comparing installed 4.0.7 with the authenticated upstream PR head without
  matching adversarial strings or making performance claims. `+(*)` produces
  `(?=.)(?:[^/]*?)+` in both; `+(*a)` produces `(?=.)(?:[^/]*?a)+` in both.
  The PR-specific `+(?*a)` control changes, confirming the candidate parser was
  actually loaded; benign `+(abc)` remains unchanged.
- `evidence-manifest.json`: source head, source/evidence SHA-256 values and
  required pins. TypeScript **5.9.3**, Decimal.js **10.6.0** and pdf-lib
  **1.17.1** remain exact and unchanged. Package and lockfile were not edited;
  no install, peer-resolution change or dependency-change test pass is claimed.
- `git diff --check`: passes for this documentation-only package.

Investigation owner: the active 2026-upgrade agent, assigned by the goal's
coordinator. Recheck official release/advisory status before the next security
qualification and no later than **November 18, 2026, 16:00 UTC**. This is a
follow-up deadline, not an accepted advisory exception. A supported complete
patch, stronger artifact-specific reachability evidence, or an explicitly
owned and expiring exception remains necessary before closing this finding.
