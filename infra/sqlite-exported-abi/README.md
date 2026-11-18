# Exported SQLite package ABI diagnostics (manual, AMD64)

This source package is an opt-in diagnostic. No image, container, compiler,
package, ELF or ABI tool has been executed by its source preparation. No candidate package is fabricated. The current
saved full-package attempts failed before the corresponding candidate exists.

The separate frozen ABI V2 decoder/module and independent review remain inputs:
`nov17-sqlite-abi-diagnostics-preparation-v2` manifest
`1fbd1a3b8792478c3678a174e505c85bd4dd0bb2d33d6acaf6d84cfce5bdc6d6`,
independent source review
`558acd4df7c602343d5c409963db01e170ad7808901b6dcfebdafc9aade87706`.
No edits to those files or shared runners are proposed here.

## Real route and truthful current hold

The old closed artifact contains toolchain image *metadata*, not a saved image.
This adapter never claims to restore that image. It first decodes and verifies
both exported baseline/candidate library and corresponding debug packages using
the unchanged ABI V2 decoder, in bounded temporary host files. Missing candidates,
debug info or custody stop before tools materialization. The old saved 9502fcc
artifact actually stops on absent `candidatePackageBuildExit`; that expected HOLD
is retained in `CHECKS.json`. This is not an ABI pass.

Given a future genuine corresponding pair, the adapter obtains the artifact-source
`Dockerfile.toolchain` from the local exact Git object and requires equality with
the current reviewed recipe. It builds that original tools-only recipe from the
fixed native platform PostgreSQL base. It appends authentication/verification, not
a SQLite build: APT update/download must succeed with authentication enabled, and
only five exact tool package versions are downloaded. Bounded `.deb` decoding
binds installed readelf, abidiff, dpkg-query and libabigail bytes to the SHA256 in
authenticated APT package metadata and the corresponding regular package member.
The signed APT lists, metadata, downloaded packages and installed inventory remain
private evidence. A changed/unavailable package, tool version or byte mapping is a
failure. This is explicitly **new tools materialization**, not identity with the
historical image or a rebuild of SQLite.

Every native tool runs as PID 1 in a separate owned read-only, network-none,
cap-drop-ALL, no-new-privileges container with only declared readonly payload and
tmpfs mounts. No `docker exec`, sleep helper, emulation, force removal or retry is
introduced. An unknown child prevents further commands through the unchanged
controller. SourceCandidateController admission, command supervision, capacity,
native-daemon assertions and normal owned cleanup are inherited exactly. Existing
unrelated images are retained. Diagnostic commands have their original per-command
bounds and a four-minute subwindow, inside 32 minutes controller work/deadline with
three minutes cleanup reserve and an eventual 35-minute job. The opt-in workflow sets the 35-minute job deadline.

All original ABI V2 checks remain, including full dynamic metadata and
`abidiff --fail-no-debug-info --no-default-suppression`. Nonzero/missing/unclosed
commands fail; raw bounded command captures remain private. Result and raw inputs
must remain private or receive a separately reviewed sanitizer before upload.
`genericAbiApproval`, `runtimeIntegrationExecuted`, `candidateReleaseQualified` and
`riskAccepted` remain false even if the diagnostic completes.

## Artifact admission and credentials

The manual workflow accepts the current adapter SHA and five exact artifact
coordinates: original source SHA, completed run ID, artifact ID, digest and size.
It checks the public nonfork repository, original fixed source-candidate workflow
path/ID, manual event, attempt one and matching run/source/artifact metadata before
one bounded download. An original failed qualification may supply a diagnostic
pair only when the unchanged decoder verifies both real corresponding library
and debug packages, build IDs, ledgers and closed cleanup. Its original failure
is preserved. No generic ABI or runtime approval follows.

The read-only workflow GitHub token is held in memory and deleted from process
environment before constructing command environments. It is sent only to fixed
api.github.com endpoints; no Authorization/cookie headers follow the single
validated HTTPS artifact-storage redirect. Private signed URLs are never logged
or persisted. Downloaded bytes have an exclusive private file, exact size/digest
and a three-minute maximum clamped inside the unchanged controller work window.
There is no API retry or alternate artifact selection.

## Publication boundary

Only publish/result.json and publish/hashes.json are uploaded for three days.
The fixed projection includes adapter source/run, command exit codes, output
hashes/byte counts, exact package/debug/build-ID/tool hashes and original package
qualification status. All broad acceptance flags remain false. Raw readelf and
abidiff outputs, downloaded packages, signed URLs, APT lists and controller
captures stay private. They are deliberately not automatically published:
rawIndependentAbiReviewAvailable is false. A remote projected result does not
provide an independent raw ABI audit; that remains unavailable unless a separate
safe evidence publication path is reviewed later.

## Controls and execution

The default-off workflow runs Node inert controls and both Python synthetic
parser/tool controls before the adapter. Tests use only synthetic temporary files
and stubbed transports; no daemon, package code or ELF execution occurs there.
Actual commands use the unchanged original SourceCandidateController supervisor,
capacity/native admission and normal owned cleanup. Job 35 minutes, controller
32 minutes with three minutes cleanup reserve; no recompilation of SQLite.

```
node --test tests/scripts/sqlite-exported-package-abi.test.mjs tests/scripts/sqlite-exported-abi-artifact.test.mjs tests/scripts/sqlite-exported-abi-native-amd64.test.mjs
python3 -I -B tests/scripts/sqlite-exported-package-abi-parser.py
python3 -I -B tests/scripts/sqlite-exported-abi-tools.test.py
```

The CLI takes only the exclusive output directory; selected artifact coordinates
are read from the authenticated dispatch event. No shell expansion of user input
occurs. No production, database, provider or private runtime data is consumed.
