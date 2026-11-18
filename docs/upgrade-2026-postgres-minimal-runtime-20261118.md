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
