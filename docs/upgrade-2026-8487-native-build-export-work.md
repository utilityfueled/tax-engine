# Exact8487 native ARM64 build and failed export

The November 4 operation binds source
`8487fb4b6d8818d83739fb902fc0730e19698053`, tree
`ce8f9746fb424f6efe52238076bca6a510e272c8`. It is separate from the earlier
pre-build store-inspection failures, which remain retained.

The same-parent native Linux ARM64 build exits 0 and produces immutable image
`c23e86d4acd3be5f90b7fa5c0a6ccb41dd291a4028c38b0e7020c8490354203b`.
Saved candidate and pre-export inspections are byte-identical and carry the
exact source revision. This establishes build completion, not image qualification.

Saving that exact image ID as an OCI archive converts its config to
`53430a2dfbae7b69f09d1b29da0cdeeba46f7c58fe19a2d9978d8ae3c3d9133f`.
The saved comparison verifies all nine rootfs DiffIDs, application configuration,
revision, user and history, but the OCI config omits the original healthcheck.
The strict ConfigID check correctly rejects the archive. The original raw Docker
config was not retained, so healthcheck omission is not claimed as the only raw
byte difference. These records do not support wrong-image selection.

The operation ends **FAIL_FINAL_SAFETY**, retaining the earlier failure
`archive config identity differs`. Final available disk is 17,107,730,432 bytes
against the unchanged 17,179,869,184-byte floor: a 72,138,752-byte shortfall.
Final memory is 6,968,434,688 bytes. Default-store metadata and workload checks
pass and the owned API stop command exits 0, but the combined final safety gate
does not pass. No resource floor was lowered and no retained store was repaired.

## V5 correction and recovery remain pending

The frozen source-only V5 successor changes candidate export to Docker archive,
retains exact immutable ConfigID and every uncompressed-layer check, and adds
exact raw-config healthcheck equality. It retains the restart, same-store identity
and independent empty-store import checks. Original base/previous-release OCI
verification, source pins, budgets and safety guards remain unchanged.

V5 has no actual Docker export or import receipt. The owned-space recovery
proposal likewise has no measured reclaim, pinned intermediate deletion list or
removal receipt. It requires bounded inventory and separate review before any
exact owned-only removal; no prune, force removal or global cleanup is authorized
by that proposal. Recovering only the measured shortfall would not prove that
later import phases fit.

The separate existing-candidate export adapter is also disabled and source-only.
It requires actual scoped-cleanup evidence and the same running VM boot before
attempting strict export of this exact candidate; it cannot pull, rebuild or
repair a store. A future successful export would have its own bounded recovery
status and would not turn the original failed final safety result into a pass.
Its cleanup, recovery and later-phase receipt fields remain unset.

Restart/import, same-image smoke, synthetic recovery, reciprocal/full browser,
SBOM/scan and final-source qualification remain unexecuted for this candidate.
Historical AMD64 and ARM64 results retain their original source boundaries.
No image is released, no advisory risk is accepted and no hosted, filing or
professional-review gate is satisfied by this build.

## Retained evidence

- Actual operation: `.local/upgrade-evidence/nov04-native-isolated-storage-source-first/future-final-qualified-phases-v4/actual-build-export-2cda01ea016b/receipt.json` (SHA256 `69ca087eaef005da39a4d2c722db385ecc78128bb2e7ce11badf7b474a9809d1`).
- Saved format/identity comparison: `.local/upgrade-evidence/nov04-native-export-format-sourcefirst-v5/saved-identity-proof.json` (SHA256 `ae990a20ff31b89ddad7e56e5ad03ecfa2db1644b20dc6bee33833c171acfdbf`).
- Source-only correction: `.local/upgrade-evidence/nov04-native-export-format-sourcefirst-v5/{manifest.json,v4-to-v5.diff,source-check-receipt.json}`; manifest SHA256 `19492bf9c38defc5789d2e4af09c14e7a219b22cc940648c1f3e748704c126d6`.
- Pending recovery boundaries: `.local/upgrade-evidence/nov04-native-export-format-sourcefirst-v5/owned-space-recovery-proposal.json`.
- Disabled exact-candidate recovery: `.local/upgrade-evidence/nov04-native-existing-candidate-recovery-sourcefirst/{README.md,manifest.json,recovery-config.json}`.

## Later bounded inventory: candidate inspection still fails

The reviewed V4 inventory corrects the earlier process-query/mount-query error
handling and checks boot/mount continuity before service startup. Its 74 author
controls were rerun by a distinct reviewer with 26 additional controls; frozen
source hashes remain unchanged. The separate parent/archive package passes 50
archive/evidence controls and 31 controller controls. ROOT verifies its 18 local
and seven external pins and grants only the bounded inventory phase.

Actual inventory creates only the three specifically admitted empty volatile
directories for the candidate namespace. Persistent directory/metadata
fingerprints match before and after reconstitution; all six existing paths,
positive process/mount absence and same-boot API handoff are admitted. These
fingerprints cover declared metadata, not every layer payload byte.

Podman then exits125 inspecting the exact retained candidate, with
`readlink …/graphroot/overlay: invalid argument`. The run stops at this first
failure; the message alone does not prove its root cause or authorize repair.
The parent closes1 with `FAIL_PHASE_STOPPED_NO_RETRY`. No forensic archive,
old-store deletion, measured reclaim, export, pull or rebuild follows.

Final safety passes with 7,720,235,008 available-memory bytes and
17,233,920,000 available-storage bytes, retaining the original floors and
unchanged default-store/volume checks. This later result does not rewrite the
original failed build/export final safety or qualify the candidate.

Evidence SHA256:

- V4 helper: `1651e163f3b86c6d43652eef330596ca18068068dc9c71f6a75041f8646d9143`.
- Distinct V4 source review: `6f80f7459f506ebca6da87d29c468c3e495aa64e1431e9dd374f58f9222fb0bf`.
- Frozen parent/archive package: `23dca152d298236ae714d0c7c29f785b9e335ddd4052bf37a8e0a1a51ae15821`.
- Actual inventory receipt: `7c9ed17fd28939731253a864bb401fc0b59cde75afb91cf0de29725b81a968e3`.
- Closed parent receipt: `16376ba311727d002279bec31921b765b6a215a0bf08d8368e56866bc3dc3544`.

The exact-source runtime qualification work remains active; retained failures
are not silently retried or repaired.


## Later direct metadata diagnosis: zero-byte layer records

The first bounded read-only helper stops after one exact machine inspection
because the retained VM is stopped. It performs no SSH, storage access or
mutation. A separately reviewed successor permits one start of that exact
known VM and binds every direct read to its newly observed boot. It passes
eight commands and all boot, memory, disk, process, mount, type and owner
guards. Neither operation retries candidate inspection or repairs storage.

The exact candidate top layer has present **zero-byte `lower` and `link`
files**. The pinned Podman 5.8.2 storage source splits the empty `lower`
contents into one empty token and calls readlink on the overlay directory.
That source path explains the observed invalid-argument inspection failure;
the cause of the zero-byte files themselves remains unestablished. No
filesystem-loss, automatic VM-shutdown or prior successful durability claim
is inferred. No symlink targets, storage API, image export, archive or deletion
are attempted. All retained stores and failure receipts remain intact.

- Stopped-machine attempt receipt: `nov04-native-candidate-readlink-diagnosis/actual-readonly/receipt.json`, SHA256 `eb68b8d61cee99acf969a5f37fb343b00eeef7d7acf097d8b722ad860b378254`.
- Direct metadata receipt: `nov04-native-candidate-readlink-diagnosis-v2/actual-readonly/receipt.json`, SHA256 `6d4d4d403be4cae57185f93e63d3e9288df91f626d0f77107dcb1828c80ea4b7`.
- V2 source manifest: `nov04-native-candidate-readlink-diagnosis-v2/manifest.json`, SHA256 `da3bcfda3eb197ca95223b17afce5b1e915e172ac3a482ec79ca7b2ceca88411`.

All paths above are relative to `.local/upgrade-evidence/`. The V2 actual
receipt establishes only the direct diagnosis, not candidate qualification.

The next proposed route uses a separately owned 80 GiB ARM64 test VM and new
stores for the functional source successor, preserving every old store. The
installed host's standard startup may alter shared Podman/Docker socket
forwarding because its helper is installed. Source-only provisioning and
startup boundaries are being reviewed before execution; no new VM or image
is claimed by this diagnosis. New source and guest-version identity, strict
Docker archive/restart/import and all same-image release gates remain required.


## Separate VM initialization: pinned-reference parser rejection

The proposed fresh test VM binds application commit
`045fbedbdfbe612cb3caa28956fa7228bb3df320`, not the historical 8487 image.
Independent review of INIT V1 finds a genuine default-connection failure path:
Podman's internal initialization cleanup can select the retained default name.
V2 requires that retained rootless connection to already be the sole default
and records preservation observations after init failures. Its 88 author and
25 additional independent controls pass before the actual attempt.

Actual V2 stops at init exit125: `Docker references with both a tag and digest
are currently not supported`. The pinned index reference is rejected despite
the earlier source-only feasibility recommendation. All eight bounded calls
finish; the retained machine inspection, existing machine list, connections
and default, shared socket/helper metadata and retained config bytes each
match their baselines. New-machine inspection is unavailable and the post-list
contains no new registered machine. No VM is started or image qualified. The
controller does not retry, restore or delete; provider internal failure cleanup
is explicitly distinguished from controller actions.

Actual receipt: `nov04-new-native-vm-provision-sourcefirst-v2/actual-init/receipt.json`,
SHA256 `2bca3d7e06ea4089abd1b156c9343f1b791f90eb21067272464df193b2730e4f`.
Source manifest SHA256 `c02d056b0122d93dd149368885d6c6310f81172017dbdc37649a2140a801c3e7`;
independent review manifest SHA256 `9ef3a0a6a0544b13fccf523e21be2990b199de989649ed7b91a3cbcdd09f1615`.
Paths remain relative to `.local/upgrade-evidence/`.

The next source-only correction uses the same published ARM64 raw.zst blob
through a verified local file, preserving its exact SHA256 and size. A public
HEAD returns200 and922,390,904bytes without a redirect; no body is read by
that metadata request. Actual download and any new init attempt require
their own reviewed source and receipts. No tag-only or mutable-image fallback
is used. The separate startup/shared-routing and complete native gates remain
open.

The independently reviewed V3 downloader makes one bounded HTTPS GET of that
exact public blob. Unlike the earlier HEAD, the GET redirects; the helper
rejects it, retains `HOLD_DOWNLOAD_RETAINED` and does not follow or retain the
target URL. No image bytes, decompression or VM operation occur. Its 43 author
and 21 independent offline controls remain separate from this failed actual
transfer. A successor's explicitly allowed public CDN redirect handling is
under source review; the published size/hash and all native gates stay fixed.

## Verified official image and separate stopped VM

V4's actual transfer admits the documented CDN host but stops at an unsupported
assumption that its object path begins `/sha256/`. The target is not retained
or followed. V5 changes only that path predicate to a bounded absolute path;
the seven exact official HTTPS CDN hosts, redirect/request ceilings, TLS checks
and final size/hash checks remain fixed. Independent review passes86author and
44additional offline controls. Both earlier transfer failures remain retained.

Actual V5 succeeds with two requests: quay.io302 then cdn01.quay.io200. The
closed, mode0400 file is exactly922,390,904bytes with SHA256
`688df5f9826ad76176bca8eb720821c6f88e269a4529578aec075fd631087b31`,
matching the published ARM64 descriptor. No signed redirect URL is saved or
printed, and the downloader performs no VM operation.

The separately reviewed INIT successor uses that verified local file, bypassing
Docker reference parsing. Because Podman's decompressor inherits input mode,
it creates a separately verified private0600 compressed copy for a writable
guest disk; the0400 original stays unchanged. The exact reviewed controller
has no start, SSH, engine, deletion, retry or application-source-copy capability.
Its109author and24additional independent offline controls pass before execution.
A stale historical authority file in the frozen source is retained and cannot
authorize this successor; runtime uses a new, hash-bound authority filename.

Actual init passes all eight calls. `tax-engine-native-20261104` is stopped,
rootless AppleHV with2CPUs/8192MiB/80GiB and exactly two new empty mount
directories, inputs read-only and outputs writable. All five existing-state
classifications match: retained VM inspection/list, connections/default,
shared socket/helper metadata and retained configuration bytes. Independent
actual review passes18checks, including the exact persisted mounts, empty0700
directories, owned0600 80GiB raw disk and current preservation metadata.
Neither initialization nor that review boots or qualifies the guest.

Receipt SHA256, paths relative to `.local/upgrade-evidence/`:

- `nov04-new-native-vm-provision-sourcefirst-v5/download-sourcefirst/actual-download/receipt.json`: `564a6c078393bcf774f66cd38ef781c47ef156002e3a76b539ca49f14eb12a95`.
- `nov04-new-native-vm-provision-sourcefirst-v5/actual-init/receipt.json`: `fe913f4713185fb27a90fd864affff5849f8439a943ad3169c2de7178624a99b`.
- Independent actual INIT review: `4b24b1e5f24747f26e6a425c61f9e40ffeaacd98aae51a19f4a2aacc55f29587`.

Startup requires a separate concrete shared-routing boundary and source review.
Actual guest version/resources, new exact045 application build, strict Docker
archive/restart/import, smoke, browser, recovery, SBOM/scan and release gates
remain open. All old stores, candidates and failed receipts remain untouched.
