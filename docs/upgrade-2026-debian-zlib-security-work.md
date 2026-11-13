# Debian zlib security update in both image stages

Debian DSA-6613-1 fixes CVE-2026-27171, CVE-2026-76844 and CVE-2026-85091
in Trixie package `zlib1g` version `1:1.3.dfsg+really1.3.1-1+deb13u1`.
The pinned Node 26.13.1 image's Linux AMD64 and ARM64 package databases
still report `1:1.3.dfsg+really1.3.1-1+b1`. Node's bundled zlib is a
separate component. [Debian advisory](https://security-tracker.debian.org/tracker/DSA-6613-1)
and [Node image refresh](upgrade-2026-node26-131-security-work.md).

Both Docker stages now install the exact fixed Debian package from Debian
Snapshot before application commands. All four architectures listed by
the pinned Node image have their own size and SHA-256 check. The build
uses a read-only bind mount for the installer. It requires no new runtime
network access, tools or environment variables. The package installer
verifies the installed version and status before the build proceeds.
The image smoke test compares the full package list against the same
architecture and immutable base. It requires the exact zlib upgrade and
the two existing APT purges, and rejects every other package change.

The package hashes come from the Trixie security index whose signature
was verified with the keyring from the exact official base layer. The
Trixie security signing key fingerprint is
`89C87ACEA5DD6B8E6A7068808E9F831205B4BA95`. Each downloaded
`Packages.xz` matched its signed size and SHA-256. Both the current
security mirror and the permanent snapshot files returned the exact
binary archives. Each archive contains the expected shared library and
the `ldconfig` trigger. The only declared dependency is the libc6
version already provided by the base. [Debian package metadata](https://packages.debian.org/trixie/zlib1g)
and [Debian Snapshot archive](https://snapshot.debian.org/).

The spec and tests preceded the implementation. The source-contract run
on the previous source reported six passes and two expected failures.
The updated source passes all eight contract tests. In a separate
bounded local harness the exact installer completes its HTTPS download,
length and hash verification for all four real archives. Its
`dpkg` and `dpkg-query` commands use local stubs in that harness. Eight
negative cases check unsupported architecture, stale or wrong package
status, unsuccessful HTTP response, short, oversized and corrupted bodies,
failed installation and temporary file cleanup.

The raw signed metadata, package bytes, local harness and results are
retained under `.local/upgrade-evidence/nov12-debian-zlib-security/`. The
application image still needs native build, actual dpkg and smoke checks,
recovery and a fresh scan on Linux AMD64 and ARM64. The remaining image
advisories still require platform and security disposition.
