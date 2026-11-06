# November 6: b1 verification and current image findings

This evidence applies to branch commit `b1d3ccdce52670575d5061be35c418cb774cd462`,
tree `2c7dc0cce248539b29f6ee66c26421acce02bd84`. It does not qualify later changes.

All twelve local checks pass: evaluation-model validation, three type checks,
spec and inventory checks, both builds, lint, unit, coverage and browser checks.
Unit and coverage each pass 27,065 tests in 1,948 files with the real local
synthetic PostgreSQL prerequisite. Branch coverage is 87.67% against the unchanged
85% gate. The managed browser run closes naturally in 1,240.71 seconds with the
five original hosted skips. All 5,448 regular source pins remain unchanged.

[Remote CI](https://github.com/utilityfueled/tax-engine/actions/runs/42174052186)
passes all six jobs. The separate
[Web workflow](https://github.com/utilityfueled/tax-engine/actions/runs/42174052187)
fails: self-host managed browsers have two RRTA saved-PDF inspector failures;
the actual image has 558 passes, 7 timed-out statuses, 20 failed statuses and
five original hosted skips. The 27 unsuccessful cases contain 25 deadline errors
and the two inspector failures. The original
deadlines, two workers, zero retries and privacy predicates remain unchanged.
Both saved managed-run PDFs pass the unchanged inspector locally. That does not
identify the discarded remote child error or turn the failed CI cases into passes.
Successor performance and diagnostic work remains separately reviewable.

## Actual Linux amd64 image and recovery

The PR merge `3a44570ef5176367eceb2d639e5c415901c783d3` has the exact same tree.
Its immutable image is
`sha256:7e34b823cd67e74ca08c241b21000041cc2fdfc6c08aa9a0aefc96247fd7c0d0`.
Artifact `13485336821` contains 762,394,416 bytes, SHA256
`119e72d096e107487f70bddaf1db50b83cc6ce361eb02e547700b4da01c71c81`.
The connector's 512 MiB limit prevented its download; an authorized read-only
GitHub CLI download closed successfully and matched that size and digest.

ROOT independently checks both embedded Syft/Grype image configurations against
the candidate ConfigID, rootfs layers, platform and source label, plus all four
source-binding file hashes. The CycloneDX SBOM contains 2,883 components. Smoke
passes as UID 1001 with Node 26.13.0 and Undici 8.12.2. Six synthetic Compose phases
pass: previous application, upgrade, database restart, dump/restore, rollback and
re-upgrade. The database, browser-facts and original-document hashes remain exact.
The PostgreSQL recovery checks retain exact costs; encrypted browser recovery
checks include wrong-password/tamper denial, original bytes, unknown year,
exact cents and deletion. Its raw synthetic URL/body observation is bounded and
does not claim general encoded/binary PII protection.

These are actual CI Linux amd64 observations. They do not establish native ARM64,
staging outage/retry, independent human security review, all-browser qualification
or release readiness.

## Advisory refresh remains unaccepted

The scan reports 182 matches across 81 advisory IDs: 62 High matches across
19 High IDs, plus 65 Medium, 11 Low and 44 Negligible matches. No fixed package
version is reported. The Critical-only CI scan threshold passing does not accept
these other findings. All 80 prior IDs remain, and `CVE-2026-76844` is newly present
for installed `zlib1g` `1:1.3.dfsg+really1.3.1-1+b1`.

The [official Debian record](https://security-tracker.debian.org/tracker/CVE-2026-76844)
marks trixie vulnerable and identifies a fixed unstable version; that unstable
package is not represented as an available trixie fix. A fresh official Debian
JSON response retrieved at `2026-11-06T07:41:38.654158+00:00` covers every matched
source-package/advisory pair. All exact trixie rows lack a `fixed_version`.
The decoded response SHA256 is
`ec5d8c59b51ff57a286e5ec807988ef0885b8a299dc047d1092115c280c9c145`.

The [current image register](upgrade-2026-image-advisories-20261106.json) retains
literal installed versions and primary records. It is separate from the
[historical ARM64 register](upgrade-2026-image-advisories-20261104.json).
The earlier November 4 recheck is overdue and unresolved; no deadline extension,
owner acceptance or exposure exclusion is inferred. Security/platform ownership
and qualified human review remain unassigned. Filing, model promotion and release
gates remain closed.

Distinct source/artifact review manifest: `998c969d80848e206e69835a03cedbd0c0665196915fee76c0b7ddd5baeb7b59`.
The subsequent RRTA test-infrastructure package is committed separately as
`fb37032b`; these b1 runtime results do not qualify that successor.
