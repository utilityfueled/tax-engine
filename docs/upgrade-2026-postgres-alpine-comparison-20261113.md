# PostgreSQL image comparison, November 13–14, 2026

The Compose database still uses the official `postgres:16.16-bookworm`
index `sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca`.
Its Linux AMD64 child is `sha256:f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848`
and its ARM64 v8 child is `sha256:586813eb2f2d5491a992541f7f0b91bf837e7ae43ec1c42af5a9639483e068c7`.
Both have Debian `libxml2` `2.9.14+dfsg-1.3~deb12u6` and `libxslt1.1`
`1.1.35-1+deb12u4`. PostgreSQL links `libxml2.so.2` and exposes its parser
through authenticated SQL/XML. Its external-entity restriction does not
establish that the vulnerable internal DTD handling is unreachable. A
PostgreSQL-specific trigger has not been demonstrated. [Compose image](../compose.yaml) · [Exact Bookworm scan and linkage](upgrade-2026-debian-advisory-refresh-20261113.md#postgresql-service-images-in-compose) · [PostgreSQL XML parser](https://github.com/postgres/postgres/blob/REL_16_16/src/backend/utils/adt/xml.c#L1685-L1707).

The application image uses `node:26.13.1-trixie-slim` in both stages. The
Trixie ARM64 application SBOM for `3ade5abe`, the pinned AMD64 Node base
SBOM, and the historical AMD64 application SBOMs for `214411a` and `c721f07`
have no libxml2 or libxslt components. Final-source AMD64 application
inventory is still required to confirm that absence for the release
artifact. The PostgreSQL service comparison below supplies no application
runtime evidence. [App Dockerfile](../Dockerfile) · [ARM64 application inventory](upgrade-2026-debian-advisory-refresh-20261113.md#arm64-candidate-after-removal-of-the-mount-package).

## Debian and upstream package status

The November 13 Debian archive check verified each `InRelease` signature
using the public archive keyring from the pinned official Debian base.
Both architecture-specific binary index sizes and SHA-256 digests matched
the signed manifests. Bookworm main publishes `2.9.14+dfsg-1.3~deb12u6`
on AMD64 and ARM64. The Bookworm security archive, dated 21:16:49 UTC,
publishes `2.9.14+dfsg-1.3~deb12u4` on both. Bookworm updates, proposed
updates, backports and backports-sloppy and Trixie backports had no
`libxml2`, `libxml2-16`, or `libxslt1.1` row for either architecture. Trixie
security publishes `2.12.7+dfsg+really2.9.14-2.1+deb13u1`. [Bookworm release signature](https://deb.debian.org/debian/dists/bookworm/InRelease) · [Bookworm security signature](https://deb.debian.org/debian-security/dists/bookworm-security/InRelease) · [Debian archive authentication](https://manpages.debian.org/bookworm/apt/apt-secure.8.en.html).

Debian marks CVE-2026-6653 vulnerable in Bookworm and Trixie, including
Trixie main `2.12.7+dfsg+really2.9.14-2.1+deb13u3`, and fixed in forky and
sid. Bookworm is postponed and Trixie has no DSA for this issue. Debian's
fixed `2.15.4+dfsg-1+b1` binaries for both platforms publish
`libxml2.so.16` and require glibc 2.38 or newer. The Bookworm service
expects `libxml2.so.2` and has glibc 2.36. The Bookworm backports support
window ended on August 9, 2026. Bookworm LTS includes both architectures
through June 30, 2028. [CVE-2026-6653](https://security-tracker.debian.org/tracker/CVE-2026-6653) · [Fixed Debian binary package](https://packages.debian.org/sid/libxml2-16) · [AMD64 library files](https://packages.debian.org/sid/amd64/libxml2-16/filelist) · [ARM64 library files](https://packages.debian.org/sid/arm64/libxml2-16/filelist) · [Debian Backports](https://backports.debian.org/Instructions/) · [Bookworm LTS](https://www.debian.org/releases/bookworm/).

Debian cites GNOME commit `463bbeeca1805b5c4828f50d0fefc4eebaf620df`,
included in libxml2 2.11.0. It changes seven files, including parser and
entity headers, with 276 additions and 227 deletions. The existing
Bookworm source carries other parser patches and already incorporates the
earlier CVE-2021-3541 entity-expansion protection. The narrow supported
Bookworm fix would be a Debian-maintained adaptation that preserves the
Bookworm ABI and both regression protections, with archive-authenticated
binaries for both architectures and an official PostgreSQL image refresh.
No such maintained binary update was found. Owning a local build would
also require reproducible builds, new distribution and security-update
ownership, and tests for parser behavior, ABI and SQL/XML. [GNOME patch](https://github.com/GNOME/libxml2/commit/463bbeeca1805b5c4828f50d0fefc4eebaf620df) · [Bookworm patch series](https://sources.debian.org/src/libxml2/2.9.14%2Bdfsg-1.3~deb12u6/debian/patches/series/) · [CVE-2021-3541](https://security-tracker.debian.org/tracker/CVE-2021-3541).

## Official Alpine 3.24 comparison

The candidate `postgres:16.16-alpine3.24` index is
`sha256:0adbf25a9e96d38823bb813f3ac0ed41fadb665c88f1df7fe6dbfb060cbdc106`.
Anonymous registry reads verified the index, each selected manifest and
image configuration, the 11 compressed layer digests per image, and all
uncompressed layer digests. The final APK databases and Syft inventories
agree on libxml2 `2.13.9-r2`, libxslt `1.1.43-r4`, musl `1.2.6-r3`, and
ICU `78.1-r0` for both platforms. Both identify 45 APK packages. SQLite
is absent from both inventories. The official build still enables SQL/XML.
[Official build manifest](https://raw.githubusercontent.com/docker-library/official-images/master/library/postgres) · [Pinned PostgreSQL Alpine source](https://github.com/docker-library/postgres/blob/168a848e5905af32aaa5fd6fad4f30906c80af95/16/alpine3.24/Dockerfile) · [Alpine AMD64 packages](https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/) · [Alpine ARM64 packages](https://dl-cdn.alpinelinux.org/alpine/v3.24/main/aarch64/).

| Evidence | Linux AMD64 | Linux ARM64 v8 |
| --- | --- | --- |
| Registry child digest | `a2f7e20374cd8fd8ed4a588b79549e10589bea7b1686e77922f5ac741b80b8a1` | `40e58641410e030f5769096bca8372f68f243e1859c8ecdf11f227da390d514d` |
| Registry receipt SHA-256 | `668f76e656b7cfed40093f696cdee687ff7fc83403e7150847bb2715ff40de1f` | `c983b7494a283e909a1c4f48bbab7ab6135b843af9524c384363edc9015850e7` |
| CycloneDX SBOM SHA-256 | `2c9ccf2e0322ed58a312303fa556ff6b701713ae4c2eece073e77597c2316da4` | `bf360c7e322d2780a4985762fcef113096cbe1d462768433fad5f770ecb21d27` |
| Grype JSON SHA-256 | `70fe38ea65bf45b9930b3110f0e20544fdebb8e3ea66209c0cc5fa11a5437c54` | `65002c0e3ba43841538be52e46f72e35eb36b2b05babe7623124fafae447b0a3` |
| `gosu` executable SHA-256 | `52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0` | `3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44` |

Syft 1.57.1 and Grype 0.121.3 used the same offline DB schema `v6.1.10`,
built November 12 at 06:20:58 UTC, as the Bookworm comparison. Both
Alpine scans returned 65 matches across 63 IDs, including 32 High and
three Critical. The advisory, severity, package, version and namespace
tuples match across architectures. Both Grype runs exited 2 with the
High threshold. The scans reported no match for the three Debian
Critical IDs CVE-2026-6653, CVE-2026-5450, and CVE-2025-7458. The Alpine
libxml2 version is beyond the affected upstream range, musl replaces
glibc, and the SQLite package is absent. The private comparison receipt
is `.local/upgrade-evidence/nov14-postgres-1616-alpine-two-platforms/comparison.json`
with SHA-256 `343a4598d1fe8679e5e2b021923dd075908c59863a36473b93107c567e7ddf8d`.
The verification used about 220 MiB of regenerable layer files and
removed them after scanning. No image program was executed.

All 35 High and Critical matches on each platform concern the Go 1.24.6
standard library at `/usr/local/bin/gosu`, version 1.19. Both Alpine executables hash-match the
Bookworm executables and the respective upstream Linux 1.19 releases.
The three Critical module matches are TLS-resumption verification
GO-2026-4337, HTTP/2 server GO-2026-6612, and Windows junction handling
GO-2026-6604. The inspected Linux binaries lacked markers for the
relevant TLS handshake, HTTP server, and Windows implementations. Grype
reports module-level matches without Go symbol evidence. The separate
`moby/sys/user` Medium account-file parsing finding retains an actual
code path that requires control over account files, which Compose does
not mount. Upstream `gosu` 1.20 updates that module, but its release still
embeds Go 1.24.6. Candidate qualification requires a verified maintained
replacement or independently reviewed, accountable dispositions for the
remaining matches. [Upstream gosu 1.19](https://github.com/tianon/gosu/releases/tag/1.19) · [Upstream gosu 1.20](https://github.com/tianon/gosu/releases/tag/1.20) · [TLS advisory](https://pkg.go.dev/vuln/GO-2026-4337) · [HTTP/2 advisory](https://pkg.go.dev/vuln/GO-2026-6612) · [Windows advisory](https://pkg.go.dev/vuln/GO-2026-6604) · [Account-file advisory](https://github.com/moby/sys/security/advisories/GHSA-mjcv-p78q-w5fw).

The only new advisory ID in the Alpine comparison is Medium
CVE-2025-60876, reported for `busybox`, `busybox-binsh`, and `ssl_client`
at `1.37.0-r31`. It concerns raw control characters in a URL used by the
`wget` applet to construct an HTTP request. Alpine enables that applet.
Its `busybox-binsh` package supplies a shell symlink, and `ssl_client`
provides TLS transport for bytes read from standard input. Those package
matches share the BusyBox source attribution. The PostgreSQL entrypoint
and checked Compose health check do not call `wget`. An exploitation path
would require a caller supplying a crafted URL, for example an operator's
init script that downloads from an untrusted value. The applet was not
executed for this comparison. [Alpine advisory](https://security.alpinelinux.org/vuln/CVE-2025-60876) · [Alpine applet configuration](https://github.com/alpinelinux/aports/blob/3.24-stable/main/busybox/busyboxconfig) · [Alpine BusyBox packaging](https://github.com/alpinelinux/aports/blob/3.24-stable/main/busybox/APKBUILD) · [Pinned PostgreSQL entrypoint](https://github.com/docker-library/postgres/blob/168a848e5905af32aaa5fd6fad4f30906c80af95/docker-entrypoint.sh).

The pinned scan returned zero libxml2 matches for Alpine. Alpine's
`2.13.9-r2` recipe lists a backport for CVE-2026-6732. It does not list
later upstream fixes for CVE-2026-86142, CVE-2026-86143, or
CVE-2026-86144, which affect earlier releases according to the published
advisories. Their compiled code and call paths need review for this
candidate alongside the scanner results. [Alpine libxml2 recipe](https://github.com/alpinelinux/aports/blob/3.24-stable/main/libxml2/APKBUILD) · [GNOME 2.15.4 release notes](https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.4.news) · [XPointer issue](https://security-tracker.debian.org/tracker/CVE-2026-86142) · [Write callback issue](https://security-tracker.debian.org/tracker/CVE-2026-86143) · [XInclude issue](https://security-tracker.debian.org/tracker/CVE-2026-86144).

## Release admission

Bookworm remains the Compose pin. A maintained same-suite libxml2 fix
would avoid the distribution migration and still need both native image
scans and recovery checks, followed by dispositions for remaining Bookworm
findings. The Alpine candidate changes the PostgreSQL OS UID/GID from
999 to 70, the implementation of libc, and the linked ICU from 72 to 78.
Qualifying it would require a logical dump and restore into a fresh
parallel volume, with verified roles, grants, database encodings, locale
and collation behavior, extensions, indexes, exact application data, and
rollback to the original Bookworm volume. Restore of global objects
requires separate consideration from per-database dumps. Rehearse the
cutover and reversal on both native architectures and document how writes
after cutover would be handled before any operator migration. [PostgreSQL dump of global objects](https://www.postgresql.org/docs/16/app-pg-dumpall.html) · [PostgreSQL collation guidance](https://www.postgresql.org/docs/16/sql-altercollation.html).

The signed package check and offline comparison establish package
availability and image contents. Neither candidate has fresh native
migration, rollback, and retained-volume evidence for a replacement.
Residual advisory decisions require an accountable owner, independent
human security review, a written rationale and expiry for any
acceptance, and the existing release gate and publication authority.
