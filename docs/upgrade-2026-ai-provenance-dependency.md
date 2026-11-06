# Browser-compatible evaluation digest dependency

On 2026-10-25, declare `@noble/hashes` exactly `2.4.0` as a direct dependency.
The lockfile already contained this version transitively; no package version or
integrity changed. This lets the shared synchronous evaluator compute SHA-256
without importing Node's crypto module into browser-consumable engine exports.

The npm registry metadata confirms Node `>=20.19.0` and the existing SHA-512
integrity. The upstream package is [noble-hashes](https://github.com/paulmillr/noble-hashes).
This dependency change supplies hashing only; the subsequent evaluation change
will use content identity without claiming a signature, provider authenticity,
human review or authority to spend funds.

Validation: offline frozen installation with strict peer dependencies passed;
the current `pnpm audit --json` reports zero advisories across 521 dependencies.
Three SHA-256 comparisons (empty, ASCII and Unicode text) match Node's reference
implementation. Evidence is in `.local/upgrade-evidence/ai-provenance-dependency-*`.
The package and lockfile diff consists solely of the direct dependency entries.
