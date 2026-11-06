# Exact 4ee5 local and remote verification

Source `4ee5e082969c5847059b8518eb3d36c0572f24dd`, tree
`fe0ada96f852add31e10eb898a2fc9aef6f3bcf7`, passes all twelve local checks.
The PA field batches and RRTA exact-name verdict reuse are included. Engine and
coverage runs each pass 27,284 tests in 1,959 files, with real local PostgreSQL
and no skips. Branch coverage is 87.68% against the unchanged 85% gate
(statements 91.83%, functions 90.92%, lines 95.14%). Types for all three packages,
specs, inventory, both builds, lint and model-registry validation also pass.
Unit/coverage elapsed times are 625.648/866.322 seconds. Every check records no
source drift.

The managed browser runner closes naturally with 587 passes, zero failures,
five original hosted skips and eight successful batches in 1,143.664 seconds.
The unchanged request budgets, project deadlines and zero-retry policy remain;
this managed run does not qualify strict runtime-image deadlines. The owned
server PID 26814 is closed. Local source/check records are in
`.local/upgrade-evidence/nov06-post-pa-final-global`; browser records are in
`apps/web/test-results/rate-window-1793988174247-26615`.

Remote [CI run 42263199065](https://github.com/utilityfueled/tax-engine/actions/runs/42263199065)
passes all six jobs: unit and coverage each report 27,284/1,959 passes, with
87.68% branches. [Web run 42263199091](https://github.com/utilityfueled/tax-engine/actions/runs/42263199091)
passes the web build and managed browser job (587 passes, five original skips).
No manual retry or dispatch was performed.

The same Web run fails container recovery at the original 30-second upgrade
heading assertion, after the previous-application phase passed. Container
browser steps are skipped before cases; they establish no image-browser pass.
The saved diagnostics contain four static-script ERR_NETWORK_CHANGED events
and three analytics-script 404s, but are cumulative without phase or initiator.
Neither browser address-change cancellation nor deployment skew is a confirmed
cause. No timeout, readiness assertion, retry or reload was added.

The immutable Linux/amd64 candidate is
`sha256:3adcaf10f1ca1a7ed8e496d82181f56333364ee3aff57bdf8e67dffe92ffe785`.
Its CI merge source `83be5a26409001a420f9d05651d3f2b577cf9542` has the exact
4ee5 tree. Saved source/file hashes, Syft/Grype configuration and rootfs bindings
all reconcile. The artifact is 760,916 bytes, SHA256
`635708b09d42d26a853844418170a4a2d2cef3618e825ac8cb0029ae483c6061`.
Its 279-package SBOM has 182 matches across the same 81 advisory IDs as the
previous register: 62 High, 65 Medium, 11 Low and 44 Negligible, zero Critical.
All remain open and unaccepted; passing a Critical-only scan is not acceptance.
Owner confirmation, expiry decisions and independent security/privacy review
remain required. Exact reconciliation and remote log extracts are in
`.local/upgrade-evidence/nov06-current-4ee5-remote-container-artifact`.

The isolated exact-9283 hosted Preview attempt stopped before any deployment
request was recorded; total operations remain 1,207/1,793. The approved native
stopped-disk enlargement completed once, 80 to 384 GiB, with eleven commands,
all three VMs stopped and other VM/config/socket metadata preserved. Its file-only
binding constructor passed, but the controller then stopped at admission before
creating its actual runtime directory. No test VM boot or runtime phase is
claimed, and the failed attempt is not replayed. The enlarged stopped disk is
retained. Root records are in `nov06-native-stopped-resize-root`,
`nov06-native-9283-root-binding-constructor-inputs` and
`nov06-native-9283-selector-successor/nov06-native-current-controller-v13-execution`.

These results qualify these exact local checks only. Later source changes need
fresh integrated verification. Container recovery, hosted/native qualification,
final physical 2026 forms, independent human reviews and AI promotion evidence
remain open. Original failed attempts and historical evidence remain retained;
release, filing and model promotion stay disabled.
