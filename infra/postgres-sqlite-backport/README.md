# Private Bookworm SQLite source candidate

This package prepares an isolated source build of Debian sqlite3 `3.40.1-2+deb12u2`
with the upstream CVE-2025-7458 fix. It changes no runtime Dockerfile, Compose file,
workflow, qualifier, scanner policy or current rehearsal. Preparation performs no
container/VM/daemon call and no compilation. No build, regression reproduction,
sanitizer success, ABI compatibility, consumer compatibility or release approval has yet
been established for this candidate.

The Debian security tracker still marks that Bookworm version vulnerable and
records a no-DSA/minor disposition. The upstream issue involves DISTINCT/ORDER BY
query planning and can affect callers able to supply crafted SQL; this repository
has no blanket applicability exemption. Upgrading to a different Debian release's
binary is not proposed.

## Provenance

- Debian archive-signed Bookworm `InRelease` binds `main/source/Sources.xz`
  SHA256 `92d11a035571df011f06f28c61cb9825130ef1d92abb2f2e0525e8674dc44af8`.
  Its one SQLite stanza binds the `.dsc` and all three tarballs exactly.
- `sources.json` pins their lengths/hashes, the signed release, keyring and source
  index. Preparation reruns `gpgv`, requires a pinned Bookworm release signing
  fingerprint and verifies every link. The descriptor's maintainer signature is
  not independently asserted; the descriptor bytes are authenticated by the
  signed archive index.
- Official SQLite Git mirror commit
  `b816ca9994e03a8bc829b49452b8158a731e81a9` explicitly identifies Fossil origin
  `12ad822d9b827777526ca5ed5bf3e678d600294fc9b5c25482dfff2a021328a4`.
  `upstream-12ad822.patch` retains that entire official mirror patch.
  `CVE-2025-7458.patch` contains its exact `src/where.c` and
  `test/distinct.test` sections; Fossil bookkeeping files are omitted. There is
  no authored replacement regression or modified expected result.
- The source already contains the `WhereInfo.pSelect` member required by this
  patch. No prerequisite change is needed. All14 Debian patches and then the
  candidate patch were source-only checked with fuzz0 locally.

Official references:

- https://security-tracker.debian.org/tracker/CVE-2025-7458
- https://sqlite.org/src/info/12ad822d9b827777
- https://github.com/sqlite/sqlite/commit/b816ca9994e03a8bc829b49452b8158a731e81a9
- https://deb.debian.org/debian/dists/bookworm/InRelease
- https://deb.debian.org/debian/pool/main/s/sqlite3/

## Preparation and future execution

Cache all exact files listed by `sources`, `release`, `sourceIndex` and
`archiveKeyring` in `sources.json`. Supply an actual immutable native toolchain
image identity. `Dockerfile.toolchain` describes the necessary native development
packages and records their exact installed versions, signed apt indexes, compiler,
linker and build flags when separately built. The later hosted runner has built
this toolchain; each actual run must bind its own observed immutable identity.

```
node scripts/build-postgres-sqlite-backport.mjs \
  --architecture arm64 --source-cache /absolute/cache \
  --output /absolute/NEW-private-output --toolchain sha256:ACTUAL64HEX
```

The result is a checksum-verified context and `SOURCE-BUILD-PLAN.json`, not an
executed build. The plan retains `--network=none`, explicit native architecture
and the immutable toolchain. Actual execution needs a bounded owned native
runner, capacity/custody checks and normal cleanup, supplied by the separate
hosted source controller. No Docker or Podman call occurs in this preparation CLI.

The offline package recipe builds both the common compatibility-repaired baseline and private
`3.40.1-2+deb12u2+vivalatax1` candidate, runs both original full upstream suites,
then runs the exact candidate regression text against both compiled variants.
Both variants retain Debian's non-amalgamation configuration and original features,
with the separately declared common `SQLITE_ENABLE_DBPAGE_VTAB` core addition.
This is a real package feature change, required by the recovery path; it is not
merely a test harness change. The prior baseline fulltest failure remains retained.
[Profile evidence and qualification limits](../../docs/upgrade-2026-sqlite-dbpage-profile-20261117.md).
For the later Tcl harness builds only, `USE_AMALGAMATION=1` explicitly selects the
upstream-supported `TESTFIXTURE_SRC1 = sqlite3.c` branch. Upstream's Makefile.in
explains that this compiles the amalgamation directly into the testfixture; its
`TESTSRC` test modules and flags remain present. This avoids the duplicate
`fts3_term.c` implementation from `TESTSRC` plus `TESTSRC2` observed during the
first AMD64 baseline fulltest link (run44035000141). `fulltest` still depends on
both `alltest` and `fuzztest`, including the complete `test/all.test` suite and
original fuzz inputs. The same explicit setting is used for the paired harness
and sanitizer harness (whose configure default already selected amalgamation).
The failed native run remains failed; source-plan controls do not establish that
the corrected recipe compiles or that any native test passes.
The second native AMD64 attempt (run44038687405) compiled the harness and
completed46,217 fuzz checks without errors, but its baseline full suite remained
failed. It reported `recoverfault2-2-oom-transient.2330` before the original
`attach-6.2` permission test deliberately aborted with “Tests do not work when run
as root.” The authenticated upstream test makes a file mode0000 and requires it
to be unwritable; that assertion must remain intact. Debian package builds still
run as root as their `debian/rules` require. Subsequent full, paired and sanitizer
harness commands run through `runuser` under a new isolated nonroot test account,
with ownership limited to the disposable qualification work/output trees.
Sanitizer options, fulltest dependencies, every upstream test and all exit gates
remain unchanged. The earlier injected-OOM failure has no established relation
to root execution and is not waived or claimed fixed by this environment change.
A complete genuine baseline full suite must pass before the candidate can run.

A nonzero exit alone is insufficient: baseline reproduction requires normal Tcl
exit1 and an explicitly named new `distinct-10.1` through `10.5` failure. A crash,
timeout, build failure or unrelated test failure remains unqualified. All five
candidate cases must pass both ordinary and ASan/UBSan builds. After source preparation succeeds, the package-stage image is an artifact carrier:
its EXIT trap retains package/test logs and records the real recipeExit even when
a package/test fails. Such an image is never a passing candidate:
assertSqliteChecksPassed requires recipeExit0 and every individual positive check.
Failures before that trap or an uncertain outer build must retain actual build
logs and remain failed; no artifact may be inferred.

Further actual native ARM64/AMD64 build/test, ELF/ABI/real consumer checks,
archive-bound SBOM/raw scan and independent review remain mandatory. Successful
source controls or a changed package version cannot remove the Critical finding
or imply risk acceptance. `candidateReleaseQualified`, `genericAbiApproval` and
`riskAccepted` stay false.
