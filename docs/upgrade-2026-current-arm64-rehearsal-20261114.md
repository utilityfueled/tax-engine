# Current ARM64 self-host rehearsal — November 14, 2026

The bounded native ARM64 rehearsal of immutable source
`a396d2c2148de4846272d3993a52afdecc20454a` completed successfully. The controller
exited 0, all four runtime workloads passed, and normal VM stop and socket-route
cleanup completed. The final controller receipt has no failure, cleanup error
or exceeded deadline. This establishes the scoped runtime evidence below; it
does not grant release readiness or accept image advisories.

## Exact source and artifact

The source tree is `8c634a01bfb999a57264b9f1f40ecbc9a85941d1`.
Independent post-run verification rehashed all 5,793 tracked Git blobs, six
literal symlinks and fifteen supplemental sample PDFs against the exact source
and browser provenance inventory. All sixteen frozen controller/staging pins
remain unchanged.

Relative to verified predecessor `33f8f7845be607a7de07d38cddf6de099377dcc5`,
the six changed paths are five upgrade evidence/checklist documents and
`scripts/browser-cpu-diagnostics/cases.json`. Application, engine, dependencies,
browser suites and other tracked inputs are byte- and mode-identical. This
equivalence is recorded separately from the fresh native execution.

| Artifact | SHA-256 / identity |
| --- | --- |
| Native ARM64 Docker config/image | `040bf8e3dfab0deac57929b45c0fbdd5e3d6789bdf2223769f2ef04ff500ada3` |
| Candidate Docker archive | `da0db9cbd7d55f97c6168469012ae3133c62636458aa276b06258c8aa52bbe45` |
| Actual-image CycloneDX SBOM | `a56e85612b322f81f9371c4daaa1abc191393c0f848265ace24c4535dbb85fda` |
| Original scanner report | `d7551e27ac8d89e1e380e3301f6824f2e0f440e665744963ba85842ab9d22d7e` |

Independent archive inspection verified the actual config hash, all eleven
uncompressed layer hashes, Linux/ARM64 architecture, nonroot user and exact
revision label. The independently imported runtime image matches the built
image. The scanner's generated SBOM identity is distinguished from the Docker
config ID; archive, SBOM, immutable manifest and source-label bindings agree.

The actual image smoke proof passed as UID 1001. `/usr/bin/infocmp` is absent,
the exact dpkg exclusion remains present, terminal packages remain installed
and `tput` still reports eight xterm colors. This verifies the implemented
bounded mitigation without claiming that package inventory findings disappear.

## Stock Compose recovery and browser execution

The rehearsal retained stock Compose PostgreSQL 16.16 Bookworm at
`sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca`.
The previous application image was
`a19e168da153371ff7ec30a27340cbcc7fd248585216b54c3806d7964f3dcf87`.
All six phases passed: previous image, upgrade, database restart, database
dump/restore, rollback and re-upgrade. Database, browser facts and document
hashes remain identical across every phase. Actual processes remain ARM64,
UID 1001, read-only, without effective/bounding capabilities or privilege
escalation, and contain no provider keys.

The synthetic PostgreSQL recovery proof covers eleven current tables, two
tenant workspaces, exact cost restoration, bound and historical-unbound billing
receipts, idempotent issuance, immutable billing mode, old-schema preservation,
metadata cleanup and renewed workspace revisions. The per-run synthetic
database secret uses SCRAM; missing and incorrect passwords were rejected
again after database restart. This is direct synthetic PostgreSQL recovery
evidence. The self-host browser stores its workspace locally; it does not prove
the hosted web application used this database during the Compose phases.

Encrypted browser backup/restore passed original-byte authentication, wrong
password and tamper rejection, unknown-year preservation, exact cents and
deletion. The 395-request observation began before upload and found no raw
synthetic SSN, filename or PDF-signature markers. That bounded observation is
not a general encoded or binary PII proof.

The production-container browser suite completed all eight natural rate-window
batches: **625 cases, 620 passed, five original skips, zero failures and zero
retry attempts**. Every collected case appears exactly once; no new skip or
unexpected/flaky result occurred. The repository Playwright default retains
one configured retry for investigation, while this guarded segmented execution
explicitly used zero retries and verified one actual result per case. Actual
browser provenance binds the source tree, image, owned container and socket;
the guarded runtime identity is checked throughout the run.

The owned browser container was removed, the test VM stopped normally, and the
user socket route, root socket route and default Podman connection were
preserved. The final inventory reports zero active VMs. The reviewer performed
only local saved-file reads and wrote private review evidence; no additional
VM, service or external request was used for this independent audit.

## Advisory and release boundaries

The original pinned November 12 Grype database reports **191 matches** in this
application image: zero Critical, 56 High, 61 Medium, 17 Low, 47 Negligible and
10 Unknown. The separate validated November 14 database rescans the exact same
SBOM and reports **192 matches**, adding only Unknown CVE-2026-91094 in dpkg.
Both actual application scans preserve the Critical threshold and exit 0.
The 56 High findings remain unaccepted; the newer metadata does not change the
image or qualify stock PostgreSQL security. See the
[current advisory refresh](upgrade-2026-advisory-refresh-20261114.md) for the
unchanged failed stock PostgreSQL gates and bounded source-unpacking evidence.

Native AMD64 execution remains unqualified. Independent human tax,
security/privacy and AI review, final annual-form qualification and other
existing readiness gates remain open. The instruction to hold commits locally
while automatic production deployments are disabled remains in effect; this
rehearsal does not authorize a push, production deployment, filing or model
promotion. Release readiness remains false.

## Retained evidence

The ignored runtime folder is
`.local/upgrade-evidence/nov14-native-arm64-a396d2c2/`; the read-only independent
audit is in its sibling `nov14-native-arm64-a396d2c2-independent-review/`.
The browser report is retained under the staged source's
`apps/web/test-results/rate-window-1794680873298-11263/`.

| Evidence | SHA-256 |
| --- | --- |
| Final controller receipt | `7daf874ff09ba864fcb28f5c8733374f8620a8a4db83ef8f966d57c8468d6ff5` |
| Four-workload result | `f6b4ffa27af2068333176043b59cb45c8647f4f3c7744261fe444ad7a870ff68` |
| Normal runtime cleanup | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |
| Six-phase Compose output | `e7742d1f0b8db7cb1bbd312d63ac05e77a62583152f6e2c83dcefb146cf66920` |
| Browser summary | `f2dca5acc006671a164f81435ca11c6fbeb506d7e61c39ea202a104f0221bb28` |
| Independent final saved-evidence audit | `d33eb77a688cedea49d9521d9752bab5a4b6853de9f83fc965423afca6ee6327` |
