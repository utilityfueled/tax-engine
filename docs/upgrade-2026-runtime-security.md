# Runtime image security evidence

Refreshed 2026-10-24 with Syft 1.55.0 and Grype 0.121.0. Grype's database was
built at `2026-10-24T17:45:29Z` and reported valid. The scanner release tarball
was verified against the [official release](https://github.com/anchore/grype/releases/tag/v0.121.0)
checksum before use.

The former bookworm image had 237 package/advisory matches, including two
critical and 75 high matches. The official [Debian CVE-2026-5450 record](https://security-tracker.debian.org/tracker/CVE-2026-5450)
identifies the affected scanf implementation and a fixed trixie glibc version.
The Dockerfile now uses `node:24.22.1-trixie-slim` for build and runtime and removes
npm, Corepack and Yarn from the runtime stage. Build-stage tools remain available.
No application lockfile dependency was changed for this package.

The intermediate arm64 image is
`sha256:905d28422236c424b7a90bec9ff0d2d4d4d63fdc9ba689e51f38d0425549c393`.
Its scan reports 157 package/advisory matches: zero critical, 54 high, 47 medium,
10 low and 46 negligible. There are 67 distinct advisories and zero npm matches.
These counts are not proof that the image is safe or that each package match is
exploitable. The [advisory register](upgrade-2026-image-advisories.json) preserves
every finding, package/version, fix state, source, owner role and review deadline.
Acceptance is pending; no finding was suppressed or marked accepted by this work.

Local verification:

- Image builds with the 4 GiB build memory bound and Node 24.22.1.
- Read-only-root filesystem smoke test runs as uid 1001, reports health HTTP 200,
  retains all 41 blank PDFs, and confirms npm/Corepack are absent.
- The 48 environment/security tests pass.
- Multi-architecture official base manifests exist for amd64 and arm64. Only
  arm64 runtime behavior was exercised here.

The image contains an intermediate working-tree snapshot, so it is **not** the
final release artifact. Rebuild and scan the exact final commit, use Docker image
format when testing the Dockerfile health check under Podman (OCI format omitted
that check in this intermediate build), test Compose/Postgres separately, and
rehearse upgrades/rollback on both target platforms before publishing. The old
local image is retained for rollback rehearsal. No image was published.

Evidence: `.local/upgrade-evidence/runtime-security-image.cdx.json`,
`runtime-security-vulnerabilities.json`, `container-security-build.log`, and
`image-security-tests.log`. Hashes of the scan and SBOM are in the register.

## Exact committed candidate refresh — 2026-10-25

The arm64 candidate built from tracked commit `da3e0fc5e51184418f29e16f98faecd13d3ddbb3`
is `sha256:c018a5100f6553355472519c05694d4cd54a40e974abef62431d5e9eaafe6598`.
Its actual Docker health check, read-only/non-root runtime, assets and all 41
versioned templates passed. A new Syft SBOM and Grype scan reproduce exactly the
previous 157 package/version findings and 67 distinct advisories, with no fixed
matches reported. The register now binds those findings to this exact candidate
and its SBOM/scan hashes. DB refresh found the same valid 2026-10-24T17:45:29Z data.
No advisory was accepted or suppressed. The package audit refreshed separately
with zero advisories across 519 entries.

The [Compose evidence](upgrade-2026-self-host-rehearsal.json) records successful
local synthetic upgrade/restart/backup restore/rollback and encrypted browser
recovery. This intermediate candidate is not final code; amd64 and final-code
qualification remain required. No image was published and no staging evidence
or independent approval is implied.

## Component exposure refresh — 2026-10-25

All67 exact Debian advisory pages were retrieved successfully. The register now
records each retrieval time, source-body hash, current trixie version/status and
one of nine bounded component assessments. Every trixie row still reports
vulnerable; no acceptance, suppression or owner confirmation was invented.
The release-maintainer confirmation and2026-11-07 review deadline remain open.

Read-only, network-disabled inspection of the registered arm64 image confirms
that Node links glibc/libstdc++/libgcc. These remain meaningful native exposure
questions. The affected systemd services, nscd and several library-associated
utilities were absent from the checked executable paths and matched package
manifests. Perl is present, but its base-package manifest lacks the referenced
Pod::Text and Archive::Tar modules. Node reports bundled zlib and SQLite versions
separate from the Debian libraries. These are component observations, not proof
that all native/transitive paths are unreachable.

Tracked application source contains one subprocess path: fixed `pdftotext`
arguments using a generated temporary file, bounded size/time and cleanup.
That optional executable is absent in this image. No invocation of the other
advisory-specific tools was found. The new [shipped Compose controls and kernel
checks](upgrade-2026-compose-security.md) bound privilege-related exposure without
claiming to resolve memory-safety findings. The Power8-only description in
[CVE-2026-97399](https://security-tracker.debian.org/tracker/CVE-2026-97399)
does not match the observed arm64/amd64 platforms. The upstream affected-range
description and Debian status for
[CVE-2026-85091](https://security-tracker.debian.org/tracker/CVE-2026-85091)
need reconciliation; the finding remains open.

Native amd64 evidence is now available from
[Web40191977778](https://github.com/utilityfueled/tax-engine/actions/runs/40191977778)
at commit `214411a`. Its image `sha256:7a95110ddada32392fbbbdd55be295736789bd900cf0a434388c09d9de48e202`
passes health/assets/non-root/read-only checks with42 templates, browser flows
and six recovery phases. Artifact12598607770 was downloaded and its archive hash
verified against GitHub. Its scan reports the same157 matches/67 advisories and
zero critical findings. Exact SBOM/scan hashes are in the register. This replaces
the earlier absence of native amd64 evidence for that intermediate code only;
both final images, staging and independent review are still required.

## Exact-source local refresh at 76e3538 — 2026-10-26

[The versioned runtime record](upgrade-2026-runtime-76e3538.json) binds the
arm64 image to the tracked commit using its archive config hash and OCI revision.
Smoke, all six upgrade/restart/restore/rollback phases, the real synthetic
PostgreSQL restore and encrypted browser recovery pass. The valid refreshed
scanner database reports 157 OS matches across 67 advisories: zero critical,
54 high, 47 medium, 10 low and 46 negligible matches; zero npm or available-fix
matches. These are match counts, not unique-advisory counts. The existing owner
acceptance and 2026-11-07 expiry remain unresolved. No image was published.

The first build exhausted local VM storage while saving a layer. Evidence-bound
cleanup removed one obsolete task-owned cache chain; an in-use cache was retained.
The retry passed. All original logs and the failed attempt remain available.
This intermediate source predates later tax packages and does not establish final
native-platform, hosted staging, human security or release qualification.

## Native amd64 refresh at 8f1d1ba — October 26

[Web workflow 40347754615](https://github.com/utilityfueled/tax-engine/actions/runs/40347754615)
completed successfully on exact commit `8f1d1baee66efb28fa1f85bf3eb5a6249c2f3cad`.
The [versioned evidence](upgrade-2026-runtime-8f1d1ba.json) records the native
amd64 image, 44-template smoke check, all six Compose recovery phases and both
428-case browser runs. Each browser run skipped five hosted-only cases; the
container run explicitly used zero retries. Nine database tables, two tenants,
exact provider cost, original documents, unknown year and exact cents survived
upgrade, database restart, dump/restore, rollback and re-upgrade. Encrypted
browser recovery rejected the wrong password and altered ciphertext and
preserved deletion/reload behavior. The privacy observation covers raw synthetic
markers in 411 requests, with the stated encoding/binary limitation retained.

The refreshed scanner database, built October 26 at 06:38:44 UTC, reports the same
157 package/version/severity/fix tuples and 67 advisories as the existing register.
There are zero critical, npm or available-fixed-version matches. The SBOM has
2,930 components. Every advisory's disposition, owner-confirmation requirement
and November 7 review deadline remains unchanged. The downloaded artifact archive
and exact SBOM, scan and logs have retained hashes.

The separate CI workflow passed 19,044 unit tests in 1,198 files and its static
jobs. Its coverage job was cancelled by the subsequent branch push, so no full
remote CI pass is claimed. This native runtime evidence predates the later
health and tax methods. Final-source images and recovery, hosted staging and
independent human security/advisory review are still required. No release image
was published and no deployment or filing/model gate changed.


## Native amd64 refresh at fdfeedf — October 26

[Web 40390607499](https://github.com/utilityfueled/tax-engine/actions/runs/40390607499)
passed on `fdfeedf575a4cda8a51bccd8d0b419a60c294796`. The
[versioned record](upgrade-2026-runtime-fdfeedf.json) binds the downloaded
artifact and raw job logs to that source. Its native amd64 image passes the
44-template smoke check with Docker health, a read-only filesystem, uid 1001,
Node 24.22.1 and no provider keys or package tools. All six synthetic Compose
phases pass, preserving nine database tables, two tenants, exact billed cost,
browser facts and original document bytes. Encrypted browser recovery rejects
the wrong password and altered ciphertext and preserves deletion/reload. The
raw synthetic-marker network observation covers 410 requests; its encoding
and binary-data limitation remains explicit.

Both browser jobs pass 454 cases and skip five hosted-only cases. The actual
container invocation uses zero retries and a 30-second per-case deadline.
The separate self-host job retains its configured one retry, with no retry
markers observed. These are distinct configurations, not two zero-retry claims.

The refreshed SBOM contains 2,930 components. Grype 0.121.0 with the October 26
06:38:44 UTC database finds the same 157 package/version/severity/fix tuples
and 67 advisories as the prior inspected native image: 54 high, 47 medium,
ten low and 46 negligible matches; zero critical, npm or available-fixed-version
matches. Existing advisory dispositions, pending owner confirmations and the
November 7 review deadline remain unchanged.

The companion CI run passes 19,211 ordinary tests in 1,267 files but is not
fully green. Its coverage job exceeds its 30-minute limit, with sixteen failed
cases already recorded in twelve suites. The canceled coverage evidence is
retained, and those failures remain separate internal work. Later tax packages
are excluded from this image. Final-source verification, authorized hosted
staging and independent human security review are still required. No release
image was published, and no production, filing or model-promotion gate changed.


## Native amd64 refresh at 456bd432 — October 26

[Web 40404307925](https://github.com/utilityfueled/tax-engine/actions/runs/40404307925)
passes on `456bd43250ab0f7133f1c6be84f51d3944a78c40`. The downloaded
archive matches GitHub's SHA-256, and the [versioned record](upgrade-2026-runtime-456bd43.json)
retains source, image, SBOM, scan and job-log hashes. The native amd64 image
passes actual health, assets, 44 templates, non-root/read-only execution and
all six synthetic Compose phases. The previous application is the immutable
`d32cb8cf` source. Nine database tables, two tenants, exact provider cost,
browser facts and original document bytes survive upgrade, database restart,
dump/restore, rollback and re-upgrade. Wrong-password, altered-ciphertext and
deletion/reload recovery checks pass. Raw synthetic-marker observations cover
407 requests and retain their encoding and binary-data limitation.

The container browser invocation passes 464 cases with zero retries and a
30-second deadline; five hosted-only cases are skipped. The separate self-host
job reports 463 passes and one flaky mobile layout case that passes on its
configured retry. Commit `d5d69b8d` subsequently makes those four position
measurements synchronous, with six focused zero-retry passes and an independent
source review. That later fix does not change the historical flaky result.

The 2,930-component SBOM and Grype 0.121.0 scan, using the October 26 06:38:44 UTC
database, retain exactly the prior 157 package/version/severity/fix tuples across
67 advisories. No critical, npm or available-fixed-version matches are reported.
Every advisory disposition, pending owner confirmation and November 7 deadline
is preserved.

The companion CI passes 19,276 ordinary tests in 1,294 files and all static jobs.
Its coverage job records fifteen failures in eleven suites before cancellation;
the final error details and coverage report are absent. Names and durations are
retained, but duration alone does not establish each cause. These failures remain
internal work. This intermediate image predates the signed health and operating
K-1 packages. Final-source verification, staging and independent human review
remain required. No release image was published or production gate changed.
