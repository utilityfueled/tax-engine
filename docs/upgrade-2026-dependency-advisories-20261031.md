# Dependency advisories: October 31 refresh

The fresh audit on October 31 reported two moderate advisories that were not in
the October 28 refresh. Both are fixed by narrow pnpm overrides. TypeScript,
Decimal.js, pdf-lib and Sentry 10.76.2 are unchanged, and Sentry 11 stays a
separate review.

| Advisory | Package | Path | Fix |
| --- | --- | --- | --- |
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | glob 13.0.6 | `@sentry/nextjs` > `@sentry/bundler-plugins` | `@sentry/bundler-plugins>glob` 14.0.3 |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | minimatch 10.2.x | the same glob, plus ESLint, `@eslint/config-array` and `@typescript-eslint/typescript-estree` | minimatch 11.0.3 through glob 14 and three lint-tool overrides |

Sentry's latest plugin still requires glob `^13.0.6`, and no fixed 13.x exists.
Both advisories were reachable only with patterns or abort signals chosen by this
repository during builds or linting. Neither package is in the standalone web
runtime output. They are fixed anyway so that no exception is needed.

These versions were published on October 27 and 28, so they are new. Removing the
overrides restores the previous lockfile if a problem appears.

Checks on this change:

- `pnpm audit --prod` and `pnpm audit` report no known vulnerabilities.
- The frozen offline install passes, so the lockfile matches the manifest.
- Sentry's `globFiles` helper finds real files and returns nothing for no match
  under glob 14.0.3.
- `pnpm build:web` passes. `pnpm lint` passes with output byte-identical to the
  run before the lint-tool overrides.
- `pnpm typecheck` passes.
