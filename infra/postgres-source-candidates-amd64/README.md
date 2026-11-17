# Standalone native AMD64 source experiment

This manually dispatched workflow builds the SQLite baseline and private source
candidate on an ordinary GitHub-hosted native AMD64 runner. It changes no runtime
image, release gate, scanner policy, deployment or provider configuration. It does
not push images or grant ABI/risk/release acceptance. `glibc` is explicitly reserved
for a future independently reviewed runner delta and is rejected by this version.

Select the public nonfork repository's default branch, provide its exact full
`source_sha`, and choose `sqlite`. The first run attempt only is admitted; an
automatic/manual retry is rejected. The job is165minutes; the monotonic controller
is155minutes including15minutes reserved for normal owned cleanup and publication
margin. Initial local workspace and daemon disk require20GiB, with2GiB untouched
reserve at each command. Only a Unix local native Linux AMD64 daemon with no active
containers is admitted. Current tracked files must match the selected Git source.
No workflow dispatch or daemon call was performed while preparing this source.

The previously cached55918-byte Debian keyring is reproducible: download the exact
official `debian-archive-keyring_2023.3+deb12u2_all.deb` (178572bytes, SHA256
`f699e2f88dca05212f2a452b58475f2993cb6993dfbafb1d0205a3291eb8b4b8`) and read only
its unique regular `./usr/share/keyrings/debian-archive-keyring.gpg` member. Its
SHA256 `506b815cbb32d9b6066b4a2aa524071e071761e7e7f68c3ac74f3061ba852017`
exactly equals the prior cached keyring. This was actually verified locally from
the official package. The authority HTML page is not a binary download URL. Both
package and member pins are checked before the original SQLite verifier reruns
`gpgv` and verifies release → source index → descriptor/tarballs. No package
maintainer signature or independent reviewer identity is invented.

The toolchain uses the pinned official PostgreSQL16.16 Bookworm AMD64 platform
manifest, records native architecture, development packages, apt signed indexes,
compiler/linker/build flags, and is consumed by immutable local image ID. The
package build has network disabled. The only Dockerfile transformation inserts
an operation label after its sole FROM; recipe code stays unchanged. All baseline
and candidate full tests, exact upstream paired regression, candidate sanitizers
and positive baseline reproduction remain mandatory. An artifact-carrier image
can export an early failure but cannot pass the status validator.

Cleanup acts only on newly created exact-operation-labelled containers/images.
It stops normally, checks exit/OOM state, removes without force/prune and preserves
all initial images. Unknown child custody prevents further daemon actions. New
pinned public base-image input is retained as a cache, not mislabelled as an owned
build. Partial cleanup/deadline failures remain failed. No broad prune, foreign
volume removal or host cleanup is used.

GitHub artifacts are retained for three days. They contain only this public-source
experiment's package artifacts, source/toolchain provenance and command logs; no
credentials or taxpayer facts are supplied to children. They are not confidential
storage merely because the runner uses private temporary directories. Inspect
`result.json` and every actual status field: successful artifact upload or build
alone is not qualification. Runtime/ABI/consumer/scan qualification remains future.

Official provenance:
- https://ftp-master.debian.org/keys.html
- https://deb.debian.org/debian/pool/main/d/debian-archive-keyring/
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch
