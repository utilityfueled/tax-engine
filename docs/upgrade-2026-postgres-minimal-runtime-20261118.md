# Postgres raw-base dependency-removal experiment

This opt-in source package tests a narrow alternative to patching SQLite inside
the final Postgres runtime. It has not qualified an image or changed Compose.
The existing SQLite source repair and all original runtime gates remain.

The pinned official Postgres16.16-bookworm AMD64 base has 155 installed packages,
1,042 regular ELF payloads, one SQLite provider and one direct SQLite consumer,
gpg. The candidate removes exactly gnupg, gpg, gpg-wks-client, gpg-wks-server
and libsqlite3-0. It must retain every other package/version record and ELF
row/hash/dependency: 150 packages and 1,038 regular ELF payloads. It preserves
protected Postgres, apt/dpkg, gpgv and entrypoint hashes. No SQLite patch or
complete indirect-use discovery is claimed.

The build has no network access, install, package-index update, force-depends
or blanket autoremove. Before/after apt checks and empty dpkg audits, exact
dry-run/actual removal sets and protected hashes are mandatory. Export
containers are isolated and never started. Complete paired inventories reject
parser failures, missing payloads, changed retained files or missing providers.

Independent review caught a first-draft gap: scanner metadata was not bound
independently to the saved image configuration. V1 is retained as HOLD. Three
real-tar controls reproduce that omission. V2 verifies the actual config SHA,
Linux/AMD64 and declared layer IDs against native before/after inspection before
either scanner; archive hash and size remain checked through scanning. This
does not independently hash each layer payload. Fresh pinned Syft/Grype scans
use the same fresh database, reject ignore drift and retain critical findings.

Public-checkout controls pass: 13 Node tests (seven new and six original), five
reader Python tests and three package-control methods covering 18 scenarios.
Package tools are fake in these controls. Types, actionlint, strict scoped lint,
9,520 spec requirements and generated inventory checks pass. Initial lint
failures are retained; the correction imports URL and names globalThis explicitly
without changing lint rules. Four test-linked requirements register the detailed
operations spec; its inventory row remains unsupported.

Frozen V2 proposal manifest:
`b68410649315cd3a3ce98be063d9953984a8388cae5a360166f93d6ad9f74c81`.
Independent archive review:
`743be8890ad5e232cf2c5fca0143e6e85c4e2baa4404f4795aba8467751e63a8`.
Independent wider source review manifest:
`1156311e23ae95fcda26ff1ae370c7d425c5f6bddadf5ea74bb06de79b97b66a`.
Root verified all 50 V1 and 44 V2 owned bindings; root derivatives receive
separate review before commit. Native execution is pending.

Bounds are a 60-minute job, 55-minute controller, ten-minute cleanup reserve
and ten-minute build. Inherited source/ownership/capacity/cleanup admission is
unchanged. The nominal five minutes outside the controller also covers setup
and artifact upload; successful completion is not guaranteed.

The status pin applies only to the raw official base. A composite with qualified
libxml2/gosu changes needs fresh exact pins and qualification. Original database
initialization, formats, persistence, backup/restore, nonroot, recovery and exact
candidate Compose-override tests remain required. Non-ELF behavior, custom
hooks, indirect loading, all other CVEs and lower OCI layer bytes remain open.
Removing merged-rootfs files does not erase underlying image-layer bytes.
No release, generic ABI, risk acceptance, filing or model promotion is enabled.


## First actual native result

Exact source `7f189699cb3d6001f646e7e727be7b5da2d7955c`, run `44238508493`,
completed successfully at 2026-11-18 04:38:38 UTC. Candidate config is
`sha256:a4ee9ef799532b51566bff32fafee8c6c6b80c8cdb574fee7528f07301573d67`.
The exact five package/four ELF removals pass; all retained package and regular
ELF records and protected tools remain unchanged. SQLite providers and direct
consumers fall from one each to zero. This is exposure-elimination inventory
evidence, not a patched SQLite or database compatibility claim.

Raw scan matches fall from 574 to 535; active critical findings fall from nine
to eight. Both raw reports also retain one suppressed critical zlib1g finding.
Effective user-ignore rules are empty. Remaining glibc, libxml2 and Go findings
are not accepted or resolved by this raw-base experiment. Fourteen original OCI
layers remain, with two added layers.

All 65 recorded commands exit zero; final owned object lists are empty with no
controller cleanup errors. No independent live cleanup inspection was performed.
Root verified 60 frozen receipt pins. Independent actual review passes for this
scoped stage: all 149 ZIP members and 921,475,688 bytes, both raw rootfs
archives, every regular ELF hash/size/owner, package/status record and protected
payload were independently verified. Nineteen SQLite vulnerability matches
fall to zero. Docker-save bytes were not retained, so subsequent replay of that
archive is unavailable. A later DB stage must rebuild and rebind its own image.
Independent review manifest SHA256:
`46840d689081f0021562216a9612008bb2c16ecc9492fc04d23968abbd3cc6bb`.
Actual manifest SHA256:
`276c5271ff31972780af4983b87bc09719465365ef4a154ea5d5ab231b296d1b`.
Actual assessment SHA256:
`43ea40be738ad3ae737b46f668688b77959cd362c85d17a63fc07a824dbcf218`.
All original runtime, recovery, composite-image and release gates remain.
