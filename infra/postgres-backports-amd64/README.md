# Opt-in native AMD64 PostgreSQL backports

The manual-only `postgres-backports-amd64.yml` workflow reuses the existing
libxml2 and gosu builders without changing their recipes or default Compose.
Dispatch on the public repository's default branch with `source_sha` equal to
the full selected commit. Attempts other than1 fail; another run needs a fresh
dispatch. No registry credentials, publication, paid runner, emulation or default
Web/CI workflow change is involved.

Three fresh standard `ubuntu-24.04` runners have job ceilings165/90/15 minutes,
270 combined. Their controllers allow155/80/10 minutes and reserve15/15/3 for
normal owned cleanup, leaving10/10/5 for publication and job setup. The package
builder receives at most135 minutes including its own15-minute cleanup reserve;
its limit decreases when source preparation consumes more time. Gosu retains its
existing45-minute window including5 minutes for cleanup. Deadlines are monotonic,
downloads and command output are bounded, and no automatic retry is configured.

Capacity admission requires20/12/8GiB actually available on both workspace and
Docker filesystems, including2GiB untouched reserve. The package allowance covers
1GiB base,3GiB toolchain,10GiB paired package/sanitizer scratch and layers,2GiB
exported image,1GiB source/artifact/log overhead and2GiB reserve, rounded upward.
The runtime allowance covers4GiB base/candidate graph,2GiB archive,2GiB SDK/build
scratch,1GiB synthetic storage and metadata,2GiB reserve, rounded upward. The
independent allowance covers2GiB input archive,2GiB loaded graph,1GiB tools/DB,
1GiB metadata and2GiB reserve. Commands recheck the2GiB reserve before starting.
These are conservative admission budgets, not measured AMD peak proofs or disk
quotas. The official public runner specification lists14GB SSD; actual capacity
can fail this gate. Insufficient capacity stops the job, without removing
unrelated preinstalled data or selecting a paid runner.

For scale only, the retained ARM tracked build reports base486MB, toolchain948MB
and package image1.754GB, plus44.2MB exported artifacts. Those values do not prove
AMD peak scratch. Fresh AMD receipts, package versions/compiler/linker/buildflags,
artifact hashes, image/archive identity and actual available capacity are retained
independently. APT resolves current signed Bookworm indexes; exact package versions
are recorded after installation. Bitwise reproducibility remains unproved.

Each cross-job handoff has an internal SHA256/length manifest bound to source,
run, attempt, stage and immutable image ID. The next fresh runner checks every
file, all prior success/cleanup fields, archive config digest, native architecture,
layers and source-manifest label before use. Runtime checks include identity,
groups/HOME, PID1/TERM, TCP SCRAM, exact NUMERIC(38,8), XML/bytea, normal restart,
custom dump/restore and stopped-volume rollback. The third fresh runner imports
the archive with no prior candidate, independently verifies provider/gosu hashes
and licenses, and produces archive-bound CycloneDX plus unfiltered raw Grype JSON.
Grype enables upstream kernel header matching and matcher suppression reporting;
the raw descriptor must confirm both flags and an empty effective ignore list.
The original JSON retains every ignored match and its rule details, with separate
active and ignored finding counts. Scanner completion does not accept findings.

Scanner binaries have explicit official Linux-amd64 checksum pins. The current
official Grype v6 listing is fetched at execution; its status/schema/path/hash and
age at most120h are checked, its archive hash verified and imported DB timestamp
checked. Empty Syft configuration and explicit empty Grype ignore rules prevent
inherited user configuration. Findings remain in the raw report; scan completion
does not establish security acceptance. All release/risk/generic-ABI claims stay
false, including when every functional check succeeds. Physical-host provenance
and bitwise reproducibility also remain false.

Only the controller's fixed public allowlist is uploaded with unique immutable
artifact names and three-day retention. Public outputs include fixed receipts,
source manifests, package files/toolchain inventories, licenses, image archives,
sanitized functional summaries, SBOM and raw scan. Credentials, env files, dumps,
volumes, source caches, build contexts, maintained patch copies, probes and raw
runtime logs stay outside that directory. Failures retain fixed-schema results;
unknown child/resource closure is a failed result, never forced into success.
Uncertainty discovered midway through cleanup stops every later command, including
another container stop or any volume/image inspection. A locally reaped CLI after
bounded termination does not prove its daemon operation stopped.

Actions pins were resolved from official upstream v4 refs during preparation:
checkout11d5960a326750d5838078e36cf38b85af677262,
setup-node49933ea5288caeca8642d1e84afbd3f7d6820020,
upload-artifactea165f8d65b6e75b540449e92b4886f43607fa02,
download-artifactd3f86a106a0bac45b974a628896c90dbdf5c8093.
Reverify inputs and inspect actual receipts before claiming a new architecture's
functional or security result. No authored vulnerability reproduction is included.
