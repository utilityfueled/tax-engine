# Current advisory refresh — November 14, 2026

The 18:30 UTC public npm registry audits both pass on unchanged lockfile blob
`480e817af821dfba68c25ed276bb3b173ef24948`: 447 production and 539 total dependency
records, zero reported advisories. Both requests excluded inherited credential
configuration; no package was installed or changed. Frozen installation, peer
requirements, types, builds and the full current local checks remain separately
evidenced in the [K-3 verification ledger](upgrade-2026-guided-qualified-k3-20261114.md).
Registry results do not replace runtime image findings.

A separate Grype database was downloaded and validated at 18:33 UTC, built
November 14 at 06:19:25 UTC, schema v6.1.10. Its local SHA-256 is
`822674a9d4f3cbeff8db3f8f1795f8ce8684e6ef2a3636a1cf4cba130e8fc96e`.
The prior November 12 database and every earlier scan remain untouched. Pinned
Grype 0.121.3 rescans the existing exact CycloneDX inputs; no image, binary,
package, Compose default, suppression or risk acceptance changed.

| Exact artifact / metadata scope | Total matches | Critical | High | Unknown |
| --- | ---: | ---: | ---: | ---: |
| Current application ARM64, source `a396d2c2` | 192 | 0 | 56 | 11 |
| Stock PostgreSQL 16.16 Bookworm ARM64 | 566 | 9 | 138 | 36 |
| Stock PostgreSQL 16.16 Bookworm AMD64 | 566 | 9 | 138 | 36 |
| Experimental PostgreSQL gosu candidate ARM64 | 505 | 6 | 106 | 35 |

Each match set adds exactly one Unknown finding and removes none. These are
package matches, not unique advisory counts. The application's original Critical
threshold remains unchanged and returns 0. The stock images were first rescanned
with a Critical classification threshold, then repeated with their original
**High** threshold: both return 2 and exact match arrays are unchanged. The
experimental candidate's new Critical check returns 2; its prior scan had no
failure threshold. These observations do not replace an existing gate or grant
qualification. The [experimental candidate](upgrade-2026-postgres-gosu-native-20261114.md)
remains outside default Compose.

## New finding and bounded exposure evidence

The sole addition is CVE-2026-91094 in dpkg 1.22.22 in the app and dpkg 1.21.23 in
the PostgreSQL images, reported Unknown/wont-fix by this database. The
[Debian tracker](https://security-tracker.debian.org/tracker/CVE-2026-91094)
describes symlink traversal while unpacking quilt source packages. Its current
record marks Bookworm/Trixie vulnerable, fixes sid at 1.23.12 and calls the Trixie
issue minor/no DSA. This primary record was retrieved through official-site
search; the direct web open was unavailable. A stable-distribution upgrade or
an unaffectedness decision is not inferred from the sid version.

Independent read-only inspection examines all eleven current application
archive layers and evaluates the target paths across whiteouts and opaque
directories. The final filesystem
contains dpkg and its installed package record, but lacks `/usr/bin/dpkg-source`,
`/usr/share/perl5/Dpkg/Source/Archive.pm` and `dpkg-dev.list`; neither dpkg-dev nor
libdpkg-perl is installed. That bounds the specific source-unpacking path in
this app artifact. It is not a general vulnerability exemption, a PostgreSQL
filesystem finding or approval to suppress the match.

The application archive remains
`da0db9cbd7d55f97c6168469012ae3133c62636458aa276b06258c8aa52bbe45`,
Docker config/image
`040bf8e3dfab0deac57929b45c0fbdd5e3d6789bdf2223769f2ef04ff500ada3`.
The scanner's generated SBOM identity is recorded separately and is not called
the Docker image ID. Actual runtime import, archive layers, source labels,
SBOM and scan bindings are independently checked. Current full native browser
and cleanup qualification are recorded separately when terminal; this metadata
refresh does not claim them or native AMD64 execution.

Engineering tracking remains with the active 2026 upgrade goal. Recheck by
November 15 at 18:30 UTC or before qualification, whichever comes first. An
accountable security decision owner and independent human security/privacy
review remain unassigned. Existing Critical/High findings and their historical
disposition work remain open; neither an elapsed old deadline nor this refresh
constitutes acceptance. Release readiness remains false.

## Saved evidence

Ignored evidence folders are `nov14-afternoon-package-audit`,
`nov14-afternoon-current-image-db-refresh`,
`nov14-afternoon-postgres-db-rescan` and
`nov14-native-arm64-a396d2c2-independent-review`. The summary manifest is
`nov14-afternoon-security-summary/manifest.json`; it binds all source receipts
and independent reviews. Raw JSON reports retain every match and actual exit.

| Independent check | SHA-256 |
| --- | --- |
| Current app / new database / raw match delta | `3cf33ae7d0d30f166d7034d96c67351ed4e98612eb24f505c423530aca91d9a0` |
| Three PostgreSQL metadata rescans | `c471b8a151362d5c87f2754fa817613ea26d6d843632a4617aa5523556d387e1` |
| Original stock High threshold preserved | `d900d5624de283e53099169ed3ccdc8491a538994cdb5c7c277eaee21a814122` |
| Current app source-unpacking tool presence | `747931c3c81550ffb45915091ef06bdbe73d32f762f057109ae510e467514560` |

## November 15 package registry recheck

The 06:13 UTC public npm registry recheck passes for the unchanged lockfile:
447 production and 539 total dependency records, with zero reported advisories
in either response. Both audit commands exit 0 using a separate empty
configuration and excluding inherited credential configuration; no package is
installed or changed. The retained JSON responses match the preceding refresh
byte for byte. Source is `3bffc873750aaa43fc2b5d319ff06df93e1d3709`;
lockfile SHA-256 is
`2553ee4f90ed1ec557e633f9b10e588198f8a5c49b833fa0f6b3ad0133345393`.

Evidence is ignored `nov15-root-package-audit/receipt.json`, SHA-256
`f46f92a2e5fa84ca8ffd79beaa5e805f5eafb417db7c060f3c37c58e512a4a2b`. This registry result does not resolve the separate runtime-image
findings or supply their missing accountable security decision owner, human
review or acceptance. The existing November 15 18:30 UTC recheck boundary and
qualification gates remain unchanged.
