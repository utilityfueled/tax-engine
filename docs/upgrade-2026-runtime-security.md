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
