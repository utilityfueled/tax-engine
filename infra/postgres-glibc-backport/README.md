# Private Bookworm glibc source backport

This standalone candidate retains Debian glibc `2.36-9+deb12u14` and backports
upstream commit `839898777226a3ed88c0859f25ffe712519b4ead` for CVE-2026-5450.
It changes no shared runtime image, Compose file, release workflow, scanner policy
or readiness gate. Source preparation is implemented; compilation and binary
qualification have not run. `candidateReleaseQualified`, `genericAbiApproval`
and `riskAccepted` remain false.

The upstream advisory concerns allocation growth for scanf `%mc` conversions with
an explicit width exceeding 1024. Debian currently marks this Bookworm source
version vulnerable with a no-DSA/minor disposition. Neither that disposition nor
a scanner severity establishes this application's exploitability or acceptance.
No replacement from another Debian release and no suppression is proposed.

## Provenance and narrow patch

- The pinned Bookworm `InRelease` has three reviewed Debian signatures. Its
  SHA256 index entry authenticates `Sources.xz`; the exact glibc version stanza
  authenticates the descriptor and two source archives. The preparer verifies
  every length/hash and the primary/signing-subkey pairs. It does not claim an
  independently verified maintainer signature on the descriptor.
- `sources.json` pins those bytes, the public archive keyring, and every build
  recipe. Archive/release fingerprints come from Debian's published key page.
  A different mirror update requires a newly reviewed manifest, not a fallback.
- `upstream-839898777226a3ed88c0859f25ffe712519b4ead.patch` preserves the complete
  official upstream patch. `CVE-2026-5450.patch` changes only the Makefile context
  to fit Debian 2.36. All three allocation fixes and the entire 48-line upstream
  regression are unchanged. `MALLOC_CHECK_=3` and debug allocator preloading
  remain attached to the upstream regression.
- Source-only applicability was checked with fuzz0 against the exact upstream
  archive and the two signed Debian Makefile patch sections. This is narrower
  than a full Debian source/package build and does not reproduce the bug in a
  binary. The build recipe requires full `dpkg-source`/quilt application with
  `--fuzz=0`, without force, refresh or modified expected results.

Official references:

- https://security-tracker.debian.org/tracker/CVE-2026-5450
- https://sourceware.org/pipermail/libc-alpha/2026-April/176841.html
- https://sourceware.org/git/?p=glibc.git;a=commit;h=839898777226a3ed88c0859f25ffe712519b4ead
- https://ftp-master.debian.org/keys.html
- https://deb.debian.org/debian/pool/main/g/glibc/
- https://manpages.debian.org/bookworm/quilt/quilt.1.en.html

## Offline preparation

Put the five exact files in `sources.json` under one local source cache. This
command only verifies and copies them into a new private directory, then runs
bounded local `gpgv` and `xz`. It performs no network, daemon, VM or build call.

```
node scripts/build-postgres-glibc-backport.mjs \
  --architecture arm64 --source-cache /absolute/source-cache \
  --output /absolute/NEW-private-context
```

The source receipt explicitly records `binaryBuildExecuted:false` and
`binaryRegressionExecuted:false`. The output is not an image or build approval.
The CLI intentionally has no runtime execution option.

## Required native execution, still pending

A separately reviewed owned runner must first admit an immutable native official
PostgreSQL 16.16 Bookworm base, native architecture, source/context hashes,
capacity/custody and bounded normal cleanup. It must build `Dockerfile.toolchain`
with authenticated Debian build dependencies and retain the complete APT indexes,
package inventory and compiler/linker/build flags. That recipe holds unless the
installed libc remains exactly the reviewed baseline. Its toolchain image must
then be pinned by actual immutable identity. The package stage must run with
network disabled and explicit outer deadlines; the source CLI does not implement
that runtime supervision or artifact export yet.

`build-packages.sh` builds both unchanged baseline and private
`2.36-9+deb12u14+vivalatax1` with both complete original Debian test suites.
Unexpected FAIL/XPASS/UNRESOLVED/ERROR hold. Original XFAIL/UNSUPPORTED remain
visible and cannot stand in for the required regression PASS. After those builds,
the exact new regression is run against both built libc variants: the baseline
must fail ordinarily with its named FAIL result, and the candidate must pass.
A timeout, crash, unrelated build error or skipped regression is insufficient.

The recipe compares every retained same-path SONAME-bearing shared ELF with
`abidiff` and requires exactly zero differences, retaining raw logs and symbol
versions. It never treats a nonzero ABI result as accepted. The package-stage
EXIT trap retains the actual stage/exit and artifact hashes; an unsuccessful
image build still needs the outer runner's actual logs and must remain failed.
No artifact export is inferred from a failed build.

Only the package files matching every already-installed glibc-source package may
enter `runtime-packages`; extra, duplicate, foreign-version or wrong-architecture
packages hold. `install-runtime.sh` installs that coherent set in one transaction,
checks exact versions and preserves PostgreSQL executable bytes and locale names.
The runtime Dockerfile inherits the official entrypoint, command and environment.
It has not been built or run.

Before any shared integration, actual ARM64/AMD64 execution must additionally
prove all six existing PostgreSQL consumers (including backup/restore/recovery),
configuration/ELF/locale compatibility, archive-bound SBOM and unfiltered scans,
source/archive identity and independent review. `assertQualificationStatus`
rejects absent/nonzero build, paired regression, full-suite, ABI or consumer
results; passing it still does not grant human risk acceptance or release
qualification. No current source-only result clears a vulnerability finding.

## Exact private version in the native package recipe

The recipe sets the pinned private version with `dch --newversion` and immediately
checks `dpkg-parsechangelog -S Version` for exact equality. Bookworm devscripts
`2.23.4+deb12u2` appends a numeric counter to a new `--local` suffix; passing
`+vivalatax1` therefore produces `+vivalatax11`, not the intended `+vivalatax1`.
The first standalone AMD64 run44037755888 applied the patch but stopped during
the patch/version stage before any package build. Its saved artifact does not
contain the resulting changelog; exact version behavior is established separately
from the matching official devscripts source, not invented as an exported value.
The failed run remains failed. This correction changes no package features,
complete suites, paired allocator regression, ABI check or release gate.

Official version-option documentation:
https://manpages.debian.org/bookworm/devscripts/dch.1.en.html
