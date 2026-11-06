# November 6 Node base refresh

The Docker base and runner, CI preload and smoke proof now pin the official
`node:26.13.0-trixie-slim` index
`5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072`.
Node 26.13.0, pnpm, the application lockfile, platform selection, non-root runner,
APT removal and every runtime identity assertion remain unchanged.

The actual old and new ARM64 manifests, configs and eight complete layer
closures were verified against their compressed digests and uncompressed
diffIDs. Independent standard-library readers reconstructed both installed
package databases without extracting or executing image members. Each has 80
packages; only APT and libapt-pkg7.0 change from 3.0.3 to 3.0.4, and tzdata from
2026e to 2026f. Debian identifies APT 3.0.3 as vulnerable and 3.0.4 as fixed for
[CVE-2026-109518](https://security-tracker.debian.org/tracker/CVE-2026-109518).
The [APT changelog](https://metadata.ftp-master.debian.org/changelogs/main/a/apt/apt_3.0.4_changelog)
and [tzdata changelog](https://metadata.ftp-master.debian.org/changelogs/main/t/tzdata/tzdata_2026f-0+deb13u1_changelog)
are retained with retrieval receipts. APT is already removed from the production
runner; the demonstrated security improvement concerns the build base.

All 36 vulnerable binary/version pairs in the saved d510 runtime scan remain
unchanged in this ARM64 comparison. All 18 known High advisory pages still
describe vulnerable trixie packages. The existing 80-ID runtime register,
unaccepted risks, ownership/expiry and professional security review requirements
remain open. This source change supplies no fresh AMD64 package comparison,
application-image scan, build, recovery or browser result.

The operational spec and exact pin test changed first. Actual public tests
produce five passes and two expected failures before the three implementation
files change, then seven passes. Spec validation, inventory check, focused lint
and smoke-script syntax pass. A distinct reviewer verifies the complete five-path
delta, primary package evidence, unchanged guards and independent layer
reconstruction. Full combined checks and exact current image rehearsals follow
separately; no release, filing, model or advisory-acceptance gate changes.

Private evidence: `nov06-official-node-base-source-investigation` (53 members,
manifest `4d0476b89a8fc4a8d1ac90f8d3de2077df38a4618071d1bf4bca8bf5fd88397c`),
`nov06-node-base-root-review` (nine members,
`c81436f8d30d89703159b3199f9bfd5dd3ea2be11e66f03859aaeb874742d1a9`),
`nov06-node-base-digest-independent` (17 members,
`cbbd91a1d5dbf509cfebb7836f8060c711668b346c2ce8855805461e02c9e25a`)
and `nov06-node-base-main-integration`, under `.local/upgrade-evidence/`.
