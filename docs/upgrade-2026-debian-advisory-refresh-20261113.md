# November 13 Debian advisory refresh

The Debian Security Tracker JSON was retrieved November 13 at 12:26:27 UTC.
Its decoded SHA-256 is `40560246edf2cb9374bc1989c92330c7fa17eb9b8137a8e7d99b9e7b279fb360`.
The comparison matches all 81 literal trixie source-package rows from the
[November 6 historical AMD64 register](upgrade-2026-image-advisories-20261106.json),
bound to source `3a44570ef5176367eceb2d639e5c415901c783d3`. The primary-source
comparison report hash is `e38f570c63b2ec0e9bbd734bcc82e3f832f0706b55bb38df95575cb573abc636`.
[Debian Security Tracker](https://security-tracker.debian.org/tracker/data/json).

Debian now records three fixed trixie zlib advisories. The historical image
contained `1:1.3.dfsg+really1.3.1-1+b1` and its 182-match scan stays attributed
to that image. The new fixed version, `1:1.3.dfsg+really1.3.1-1+deb13u1`, is
already pinned by hash in both Docker stages. The current platform images
still need native package inventory and scan evidence.
[DSA-6613-1](https://security-tracker.debian.org/tracker/DSA-6613-1) ·
[Pinned package evidence](upgrade-2026-debian-zlib-security-work.md).

The other 78 historical rows are open and unchanged. The subsequent native
ARM64 image at `2e258445` has the fixed zlib package and the three zlib
advisories no longer appear in its scan. That image has 197 Debian matches
across 86 IDs. All 86 have open trixie rows in the same primary response.
The eight newly matched IDs cover glibc, OpenSSL and GCC. The overdue
security/platform disposition remains open for all 86.
[ARM64 image and per-advisory register](upgrade-2026-image-advisories-20261113-arm64.json).

## ARM64 candidate after removal of the `mount` package

The independently imported image at `3ade5abe` has 191 Debian binary-package
matches across 86 advisory IDs, including 56 High matches across 17 IDs
and zero Critical matches. The exact comparison to the `e3c90730` scan
removed six matches attributed to `mount`, four of them High. The matches
against the other util-linux binaries and libraries remain. The latest
tracker retrieval at 2026-11-14 02:06:51 UTC matched all 86 source-package
rows from the earlier ARM64 register. Every row remains open with the
same literal trixie status. [Debian Security Tracker](https://security-tracker.debian.org/tracker/data/json).

Comparing the exact image's 55 installed Debian source package names
against the live tracker also found five open trixie rows absent from the
Grype report. Four are temporary Debian issue IDs classified as unimportant.
The fifth is CVE-2026-91094 for a directory traversal issue during
`dpkg-source` extraction. The trixie row specifies a future point update,
and the image contains neither `dpkg-dev` nor `dpkg-source`. The five
rows are preserved in the reconciliation evidence alongside the Grype
matches. [Debian dpkg advisory](https://security-tracker.debian.org/tracker/CVE-2026-91094) · [Debian dpkg-dev](https://packages.debian.org/trixie/dpkg-dev).

| Evidence | SHA-256 |
| --- | --- |
| ARM64 archive | `07a41bf6243b10839d4bcd48df0d2e0767befc64fa2478e29635f78d305c06ba` |
| SBOM | `61dedb3fddcc2faa1402ed53d8048d85921c96d40cb850320b956fabb4d35992` |
| Grype scan | `7394e4bd55781c5bb9881e82972fa8522eb2a99c36eaf8b4c08a73bb63f19e40` |
| Current Debian tracker JSON | `7f001712ce15a2ad2c4b49a20750a238df920c2d8308d9025333a2332e6d5b29` |
| Reconciled per-advisory observations | `ea0068baac24f5928977b49e28d25abbc037c893a17054d81fb0d051f36f5937` |
| Layered filesystem, dpkg and ELF observations | `ad0cc5bf4fdbf778e34f7171c9a5e53f8c9d2b711e74a96f5324a27a30318d45` |

The package counts below come from source-package matches. An offline
inspection of the exact archive accounted for layer whiteouts and read
the final package database and ELF imports. It executed no candidate
programs and does not establish a complete dynamic call graph. The native
smoke verified UID 1001 and zero set-ID regular files. The checked-in
Compose definition also drops all web capabilities, sets
`no-new-privileges`, and uses a read-only root filesystem.

| Source and High matches | Exact artifact observation and remaining exposure |
| --- | --- |
| util-linux · 32 | `mount` and `umount` are absent. The Debian `libmount` library remains, as does `nsenter` in the Essential `util-linux` package. The documented `nsenter` case needs a privileged operator to invoke `--join-cgroup` on an attacker-controlled target. All four High rows still apply to Debian's source release. [Debian util-linux](https://security-tracker.debian.org/tracker/source-package/util-linux) · [Upstream nsenter advisory](https://github.com/util-linux/util-linux/security/advisories/GHSA-55fx-f4gg-cfhj) |
| gcc-14 · 8 | The shipped Node and libvips binaries both declare `libstdc++.so.6` and import aligned array allocation. Whether request data can drive an allocation to the overflow conditions remains unverified. The other High advisory requires a call to the specific binary-heap `erase_if` operation. [GCC aligned allocation](https://security-tracker.debian.org/tracker/CVE-2026-95619) · [GCC heap erase](https://security-tracker.debian.org/tracker/CVE-2026-102010) |
| glibc · 6 | Node and the bundled Sharp binaries depend on glibc. The libvips binary imports `dcgettext` and `dcngettext`. The catalog issue additionally requires control of the process locale environment and access to a crafted catalog. The inspected binaries show no direct imports of the named monetary formatter or deprecated DNS printers. Transitive calls and environment changes remain outside this inspection. [Locale catalog](https://security-tracker.debian.org/tracker/CVE-2026-84243) · [Monetary formatter](https://security-tracker.debian.org/tracker/CVE-2026-19499) · [DNS printers](https://security-tracker.debian.org/tracker/CVE-2026-5435) |
| SQLite · 3 | The system shared library exports the changeset API. The installed Essential util-linux package needs `liblastlog2-2`, whose binary imports the SQLite open and query APIs. The Node and two application-native files have no `DT_NEEDED` entry for system SQLite. Node 26.13.1 separately embeds SQLite 3.54.1. The three High system SQLite cases require a crafted changeset or specific FTS5 operations. [Debian SQLite](https://security-tracker.debian.org/tracker/source-package/sqlite3) · [Node 26.13.1 release](https://nodejs.org/en/blog/release/v26.13.1) |
| ncurses · 3 | The affected `infocmp` executable is present in Essential `ncurses-bin`. The documented overflow occurs in that CLI. The package-level scanner result also names the terminal data and shared library. [Debian ncurses issue](https://security-tracker.debian.org/tracker/CVE-2025-69720) |
| Perl · 2 | The exact filesystem contains Essential `perl-base`. Neither `Pod/Text.pm` nor `Archive/Tar.pm` is present. The two reported input parsers are absent from this image. [Perl POD formatter](https://security-tracker.debian.org/tracker/CVE-2026-82560) · [Perl tar reader](https://security-tracker.debian.org/tracker/CVE-2026-9538) |
| ACL · 2 | `libacl1` remains. The `getfacl`, `setfacl`, and `chacl` commands are absent. The pathname API issue still requires assessment for privileged callers over attacker-controlled paths. Debian defers the trixie fix to a point update because it needs a new ABI. [Debian ACL issues](https://security-tracker.debian.org/tracker/source-package/acl) |

No release-specific package upgrade for these findings was available in
the checked trixie records. Upstream util-linux has fixes, while Debian
currently lists a later package only in forky and sid. The installed
Essential package has exact-version library dependencies. Any trixie
backport must keep that set consistent and pass fresh package, image, and
recovery checks on both architectures. The remaining advisory dispositions,
including an accountable owner and expiry for any accepted finding, and the
independent human review are open. [Upstream util-linux release](https://github.com/util-linux/util-linux/releases/tag/v2.41.6) · [Debian package versions](https://security-tracker.debian.org/tracker/source-package/util-linux).

## PostgreSQL service images in Compose

On November 14 UTC, anonymous Docker Registry reads verified the pinned
`postgres:16.16-bookworm` OCI index
`sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca`,
the selected child descriptors, image configurations, compressed layer
digests and all 14 uncompressed layer identifiers on each platform. Syft
1.57.1 inventoried each platform's merged filesystem, and Grype 0.121.3
used the same database built November 12 at 06:20:58 UTC. The exact package
database matched all 155 Debian packages reported by Syft on each platform.
Both scans exited 2 with the High threshold and found the same 565 package
matches across 231 advisory IDs, including 138 High and nine Critical
matches across six IDs. This offline inspection executed no image code.
[Compose pin](../compose.yaml) · [Docker Official Image](https://hub.docker.com/_/postgres) · [Pinned Dockerfile](https://github.com/docker-library/postgres/blob/168a848e5905af32aaa5fd6fad4f30906c80af95/16/bookworm/Dockerfile).

| Evidence | Linux ARM64 v8 | Linux AMD64 |
| --- | --- | --- |
| Registry child digest | `586813eb2f2d5491a992541f7f0b91bf837e7ae43ec1c42af5a9639483e068c7` | `f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848` |
| CycloneDX SBOM SHA-256 | `e984663460c82970d0c6206c10ae954d5aa5e453640cc418e448fddc293a348b` | `b0815604f212f694511214bfd836eec6e97da9a6eb7eb56b3c820611787ff31a` |
| Grype JSON SHA-256 | `b043c1ee9b54e4e690148347d060a25dfe32a0ec1106adbf5e5e8f107323469f` | `a4d45a82496eec961db36c8a65043eda3720bb58a423f715538e6f6d42251f5e` |
| Filesystem, package and ELF review SHA-256 | `4b05a63d283c3d8b57a4e90e53417b73a62cfec635c5cc43707b5e51bbe01a77` | `af7e154e976519f9b4fe8d5b00056475603252872506b810c0484f05f6d1a6d5` |

The 16.16 server and client are PGDG `16.16-1.pgdg12+1`. The shared
client library `libpq5` is from PostgreSQL 18 at `18.7-1.pgdg12+2` and is
linked by `psql` and the packaged `dblink` extension. The PGDG common
packages are `294.pgdg12+2`. Grype emitted zero matches on those five
packages in the Debian 12 namespace. The upstream version-specific
bulletins document fixes through 16.16 and 18.7, and the PGDG package
archive confirms the version and vendor. The 16.16 notes require checking
existing indexes for affected unconstrained `bpchar` btrees, GIN and
prior concurrent TOAST reindexing, and rebuilding separately installed C
extensions as applicable. The checked application schema defines no
`bpchar` or GIN index and creates no C extension. Operator schemas and
extensions still require inspection before an in-place upgrade.
[PGDG package archive](https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-16/) · [PostgreSQL 16 security](https://www.postgresql.org/support/security/16/) · [PostgreSQL 18 security](https://www.postgresql.org/support/security/18/) · [PostgreSQL 16.16 migration notes](https://www.postgresql.org/docs/release/16.16/).

| Critical scanner matches per platform | Exact artifact observations |
| --- | --- |
| glibc CVE-2026-5450 · 4 | Bookworm `2.36-9+deb12u14` is vulnerable in Debian's tracker. Both server binaries import glibc `fscanf` and `sscanf`. The fault requires a format with a width over 1024 for `%mc`. The checked server and client binaries had no such literal. The transitive call path remains unverified. [Debian glibc advisory](https://security-tracker.debian.org/tracker/CVE-2026-5450) |
| libxml2 CVE-2026-6653 · 1 | The server declares a direct dependency on `libxml2.so.2` and imports the parser. PostgreSQL applies internal DTD defaults and supplies a loader that prevents external entity fetches. The official source and binary imports establish an authenticated SQL/XML parsing path. Triggering this specific internal-subset use-after-free through that path remains unverified. Debian lists the shipped Bookworm and current Trixie versions as vulnerable. [Debian libxml2 advisory](https://security-tracker.debian.org/tracker/CVE-2026-6653) · [PostgreSQL XML implementation](https://github.com/postgres/postgres/blob/REL_16_16/src/backend/utils/adt/xml.c#L1685-L1707) |
| SQLite CVE-2025-7458 · 1 | Bookworm's SQLite library is present. The server, `psql` and `dblink` have no direct SQLite dependency, and the SQLite CLI is absent. The reported conditions require arbitrary SQLite SQL with a crafted `ORDER BY`. [Debian SQLite advisory](https://security-tracker.debian.org/tracker/CVE-2025-7458) |
| Go GO-2026-4337, GO-2026-6612 and GO-2026-6604 · 3 | All three matches arise from `gosu` 1.19's embedded Go 1.24.6. The exact binaries hash-match the upstream Linux releases and contain no TLS handshake, HTTP server or Windows implementation markers. The entrypoint uses the binary to drop to the PostgreSQL OS user. The TLS-resumption, HTTP/2-server and Windows-junction preconditions are absent from this use. The separate Medium `moby/sys/user` finding does cover the account-file parser used by `gosu`. It requires a malicious user or group file, and Compose mounts neither file. [Upstream gosu release](https://github.com/tianon/gosu/releases/tag/1.19) · [TLS](https://pkg.go.dev/vuln/GO-2026-4337) · [HTTP/2](https://pkg.go.dev/vuln/GO-2026-6612) · [Windows](https://pkg.go.dev/vuln/GO-2026-6604) · [Moby account-file advisory](https://github.com/moby/sys/security/advisories/GHSA-mjcv-p78q-w5fw) |

The pinned Bookworm image already uses `debian:bookworm-slim`. The
official Registry returned 404 for 16.17, 16.17-bookworm, and the 16.16
`-slim` variants. Both current alternative tags, `16.16-trixie` and
`16.16-alpine3.24`, still declare `gosu` 1.19. The offline Trixie ARM64
comparison at child digest
`sha256:15364b278fab4a982ae09243c788e4df96a31a5b4bed50e6dab2d83420690653`
returned 501 matches across 214 IDs, including 149 High and four Critical
matches. It removed the Bookworm glibc and SQLite Critical matches and
retained libxml2 CVE-2026-6653 and the same three Go Critical matches.
The Trixie scan SHA-256 is
`999af08a7701c5f0d16c633aa2fe5a71f27b7859ca1dc18a2c56c7cea1324dd1`.
Moving an existing volume from Bookworm to either alternative changes the
libc and locale environment. The Trixie archive ships ICU 76, and the
pinned Bookworm image links ICU 72. PostgreSQL requires rebuilding affected
indexes before refreshing collation versions. Removing libxml2 breaks a
declared server dependency.
A replacement requires patched packages for the affected paths and its
own upgrade, recovery and rollback evidence. The PostgreSQL service
remains open for security qualification, including the unresolved High
findings, accountable disposition and independent human review.
[Official image tags](https://hub.docker.com/_/postgres/tags?name=16) · [PostgreSQL collation guidance](https://www.postgresql.org/docs/16/sql-altercollation.html).

### Bookworm libxml2 backport check

The November 14 check verified Debian's signed Bookworm source index and
all three archive inputs for `2.9.14+dfsg-1.3~deb12u6`. Reconstructing the
source applied all 39 Debian patches without fuzz. A dry run of the
upstream fix for CVE-2026-6653 reported ten conflicts across the parser,
SAX code and entity implementation and header. Its public parser-input
and entity structure sizes also differ from Bookworm's. The same shared
library name alone would not establish binary compatibility. The local
compatibility receipt SHA-256 is
`35a23f383226214102e96cecb9a3758a48902d4601b86e1cbac01bd60e8ea578`.

An installable backport would require maintained source, ABI and SQL/XML verification on
both native architectures, plus upgrade and rollback rehearsal. Debian's
current Bookworm row stays open. Compose still pins the Bookworm image,
and the security disposition is pending.
[Debian source package](https://sources.debian.org/src/libxml2/2.9.14%2Bdfsg-1.3~deb12u6/) ·
[Debian CVE status](https://security-tracker.debian.org/tracker/CVE-2026-6653) ·
[Upstream fix](https://gitlab.gnome.org/GNOME/libxml2/-/commit/463bbeeca1805b5c4828f50d0fefc4eebaf620df).

Canonical also published a fix on the same libxml2 2.9.14 base. The signed
Noble security source index binds `2.9.14+dfsg-1.3ubuntu3.10` to the same
pristine source archive as Bookworm. Its maintained patch
`6c2b8a7b6fa470efcb1854e5c73bd7e1ae1663d8b111e27ce9232bbc1fe44f54`
applies to all seven files of the exact Debian-patched tree without
fuzz or offset. It appends fields to both public structs. This dry run
supplies a source input for a custom Debian backport. Native ABI checks,
SQL/XML and recovery tests, image scans and the other findings still need
disposition. Debian's Bookworm package status is unchanged. The signed
comparison receipt SHA-256 is
`6c050e8a1bf2b7621ce51e572e34dc63a0d1adb97da5c99a917f1fcdb3af46bd`.
[Canonical CVE status](https://ubuntu.com/security/CVE-2026-6653) ·
[Noble source package](https://launchpad.net/ubuntu/+source/libxml2/2.9.14+dfsg-1.3ubuntu3.10).

The follow-up Clang target-layout probe preserved every old field offset
and alignment on `aarch64-linux-gnu` and `x86_64-linux-gnu`.
`_xmlEntity` grew from 136 to 152 bytes and `_xmlParserInput` from 104 to
120 bytes. PostgreSQL 16.16 core uses the library-owned parser-input
pointer, but the pinned images also link `pgxml.so`, libxslt, libexslt
and LLVM directly against libxml2. LLVM is also reached through the
shipped JIT module. This establishes a real compatibility boundary for
the shipped dependency graph. The layout and reverse-consumer receipts
are `40d76ef8f5dbba570c7596f365d9332713dce7bcd9a21e99464b917ff57bf3fd`
and `3a16b46eb538b0f07d92166f80bf782d6da13c202df6b6e7322424c348e949c6`.

The source-reviewed native qualification plan covers SQL/XML, the XML2
extension, XSLT/EXSLT, active JIT, exact `NUMERIC` and XML round-trips,
fresh restore and rollback, and architecture-specific artifact scans.
Its SHA-256 is `c0439868b4824ed5973011b006b5158a5ac2cf196c21d5ac17de8b5e9290a364`.
No patched database image has been built or run. The original disclosed
reproducer is still required for a paired sanitizer check. This backport
targets one finding. Eight other Critical matches and 138 High matches
still require separate disposition on each pinned database image.
