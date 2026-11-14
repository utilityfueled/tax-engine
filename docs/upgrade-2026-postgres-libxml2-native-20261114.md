# ARM64 PostgreSQL libxml2 backport evidence

## Qualification state

On November 14, 2026, a private Bookworm source backport completed native ARM64 package, parser, sanitizer, packaged-consumer and recovery checks. The image scan retained 9 Critical and 138 High matches. Security risk acceptance and candidate release qualification are both false. Native AMD64 execution and accountable security-owner decisions remain outstanding.

The application used for the recovery experiment is exact commit `675576376e01a57f5aa5061373c59a9539d9efd2`. Admission verified all 5,758 tracked Git blobs in its detached source copy. The PostgreSQL base is the official `16.16-bookworm` ARM64 child `sha256:586813eb2f2d5491a992541f7f0b91bf837e7ae43ec1c42af5a9639483e068c7`, under index `sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca`.

## Sources and package construction

- Baseline source is signed Debian Bookworm `2.9.14+dfsg-1.3~deb12u6`, including all 39 Debian patches. Debian still lists this version as vulnerable to CVE-2026-6653 and postpones the issue. The source record retains the signed index and the `.dsc`, original archive and Debian patch archive hashes. [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2026-6653)
- Candidate source applies the maintained `CVE-2026-6653.patch` from signed Noble `2.9.14+dfsg-1.3ubuntu3.10`. The patch SHA-256 is `6c2b8a7b6fa470efcb1854e5c73bd7e1ae1663d8b111e27ce9232bbc1fe44f54`. It applies to seven files without fuzz. Canonical identifies Noble as fixed beginning with `2.9.14+dfsg-1.3ubuntu3.8`. The upstream fix is commit `463bbeeca1805b5c4828f50d0fefc4eebaf620df`. [Canonical status](https://ubuntu.com/security/CVE-2026-6653), [GNOME fix](https://github.com/GNOME/libxml2/commit/463bbeeca1805b5c4828f50d0fefc4eebaf620df)
- Both variants use the Bookworm package recipe, native compiler and captured dependency inventory. The candidate installs normally through `dpkg` as private version `2.9.14+dfsg-1.3~deb12u6+vivalatax11`. The exported package, build information, changes, debug packages, source manifests and compiler/linker flags are retained.
- Debian's DFSG archive excludes the upstream `test` and `result` trees. The first broader sanitizer run therefore encountered missing fixtures. The corrected experiment restores only missing fixture files from GNOME's exact `2.9.14` archive, preserving the signed Debian source files. The official archive hash is `60d74a257d1ccec0475e749cba2f21559e48139efba6ff28224357c7c798dfee`. [GNOME checksums](https://download.gnome.org/sources/libxml2/2.9/libxml2-2.9.14.sha256sum), [GNOME fixture archive](https://download.gnome.org/sources/libxml2/2.9/libxml2-2.9.14.tar.xz)

The private source packet is `.local/upgrade-evidence/nov14-native-current-release-prerequisites/xml/abi-source-qualification/`. Its original source-only plan is historical. The executed results below establish the current experiment's scope.

## Actual native checks

Package attempt `nov14-pg-libxml2-native-qualification-retry3` completed 18 controller stages with exit zero, no cleanup errors and no deadline overrun.

| Check | Baseline | Candidate |
| --- | --- | --- |
| Native optimized Debian package build | Exit 0 | Exit 0 |
| Explicit optimized `make check` | Exit 0 | Exit 0 |
| Parser regression runner | 3,360 cases, zero errors | 3,360 cases, zero errors |
| Recursion runner | 9 cases, zero errors | 9 cases, zero errors |
| API runner | 280,912 cases across 1,164 functions, zero errors | Same counts, zero errors |
| Separate ASan/UBSan parser runner | 3,360 cases, zero errors | 3,360 cases, zero errors |
| Separate ASan/UBSan recursion runner | 9 cases, zero errors | 9 cases, zero errors |

The check log also records successful dictionary, character and bundled fuzz checks. Its external W3C `xmlconf` corpus is absent and that runner reports zero tests. The separately authored CVE reproduction remains unexecuted. Both paired sanitizer variants pass the maintained recursion harness, so these results establish exercised regression behavior and sanitizer outcomes. A patch-specific baseline use-after-free reproduction remains unverified.

Independent review counted the same 1,786 exported symbol names in each optimized library. The derived sized-definition comparison covers 1,743 definitions, with matching symbol kinds and exported data-object sizes. Their SONAME and six NEEDED libraries match. Both receipts are retained.

`abidiff` returns 4. The maintained change grows public `_xmlEntity` and `_xmlParserInput` records on both reviewed 64-bit layouts. This prevents generic ABI approval. ELF dynamic sections, symbols, versions, data-object sizes, debug information and raw `abidiff` output are retained for review.

Runtime operation `b44c3c3227c5c3e78310e0934f8e88ef` completed 99 stages with exit zero, no cleanup errors and no deadline overrun.

- The official baseline, candidate and restored candidate each passed ordinary-user XMLPARSE, XMLTABLE, XPath, internal DTD defaults, legal nested entities and expected malformed-XML SQLSTATE checks.
- Actual `pgxml.so` XPath/XSLT, a compiled EXSLT probe and LLVM JIT-generated SQL functions passed. The five existing consumer ELF hashes match between official and candidate instances. The loaded libxml2 provider matches the admitted package exactly. [PostgreSQL XML functions](https://www.postgresql.org/docs/16/functions-xml.html), [PostgreSQL JIT](https://www.postgresql.org/docs/16/jit-reason.html)
- The candidate opened a clone of the stopped official volume. Exact XML, `NUMERIC` value `9007199254740991.01000001`, binary bytes and expression-index assertions passed. The original official-volume checkpoint passed rollback assertions. A candidate-written forward marker survived fresh restores into both candidate and official images. [PostgreSQL dump](https://www.postgresql.org/docs/16/app-pgdump.html), [PostgreSQL restore](https://www.postgresql.org/docs/16/app-pgrestore.html)
- The frozen application release-rehearsal script ran through a dedicated private Compose override selecting the candidate database image. Its encrypted application/database recovery and negative-case checks returned a passed result.
- Archive admission independently matched the exported Docker config hash to the running candidate image ID before SBOM generation and scanning.

All four synthetic database containers, four named volumes, their internal network, the candidate image and the owned guest working directory were removed. The VM stopped normally. Final inventory verified zero active VMs and zero residual volumes, the restored user socket route, the original root socket route and the original default connection.

## Actual scan and remaining decisions

| Severity | Matches |
| --- | --- |
| Critical | 9 |
| High | 138 |
| Medium | 192 |
| Low | 53 |
| Negligible | 138 |
| Unknown | 35 |

The scanner still matches CVE-2026-6653 against the private libxml2 package's Debian namespace/version. Eight other Critical rows identify four glibc packages for CVE-2026-5450, SQLite CVE-2025-7458 and three embedded-Go advisories in `/usr/local/bin/gosu`. Raw findings are preserved without suppression. Scanner exit zero records completed scanning. Release and risk-acceptance fields remain false.

The source-backed consumer experiment needs independent security disposition, native AMD64 counterpart evidence and a named maintenance/update owner before any candidate image promotion. PostgreSQL upstream XML/XMLMap suites, controlled external-entity file/HTTP instrumentation, external W3C conformance fixtures, the authored CVE reproducer and operator-installed modules remain explicit evidence gaps. Authored CVE reproduction remains additional pending evidence, recorded separately from the executed compatibility checks.

## Capacity and independent review

The bounded runtime uses a 512 GiB host floor, calculated as 384 GiB full additional VM disk growth, 32 GiB host outputs/temporary files, 64 GiB parallel managed work and 32 GiB untouched reserve. The formula takes no credit for approximately 119.4 GiB already allocated to the 384 GiB VM disk. Fresh admission verifies the disk and outputs share a filesystem, the disk's exact logical size and available host capacity. This replaces the older agent-chosen 756.859 GiB multi-wave floor for this bounded phase.

Independent source review verified the capacity formula, exact runtime controller, 13 pinned inputs, all 5,758 application blobs, all 88 package artifact-manifest entries and all five SQL/C probe sources. The controller allows 120 minutes including a 1,500-second cleanup reserve, with absolute deadline clamps. This review establishes the reviewed source/custody boundary. Qualified security acceptance remains unassigned.

## Detached artifact ledger

Private evidence roots are `.local/upgrade-evidence/nov14-pg-libxml2-native-qualification-retry3/` for packages and `.local/upgrade-evidence/nov14-pg-libxml2-native-runtime-b44c3c32/` for runtime. The manifest covers every exported package artifact. Compact summaries retain exact paths and hashes of their supporting logs and receipts. Synthetic credentials and raw private runtime logs remain in the private evidence directory.

| Artifact | SHA-256 |
| --- | --- |
| Package controller | `20a4be6fe0b5ada71fbc8045b8df32ec8e85de589e7a950f425dd4d187f2df9c` |
| Package source context | `5bb85e662b63f74ca3893199f08455ce3eb094f6875dab8b3b67fb26b70ae0ab` |
| Exported package artifact manifest, 88 entries | `2a102882204777e0aa49d6375418cc259855ee576fe44eb52bd2e846fa00b45f` |
| Exact package export tar | `9d04840790eac88eeff4132655e77644d7721dab7f383b759b83ce9c2853a322` |
| Package compact summary | `f7fd43290157708d946ae386a6a9a8bb33e01e3a75cfa90c33f86d308aeca65f` |
| ELF export comparison | `cd5a9aae8cf5ede31216ddaa7bc78a5e9a7d68a3a2591536715cacf8a1da2753` |
| Candidate runtime Debian package | `e121286bed1733b7e1aa1b312373a133fd317ede75ecfad1750c924e14ac22a5` |
| Candidate loaded libxml2 | `af1bde0a68f9454df32e838e763f500251495e21a6556dc9c959aa61f6f99b23` |
| Runtime controller | `1745eba7ad57d629e3e4d4628f36cb7272eafce56a6fbb2a035084f6af586a46` |
| Runtime input pins | `a0145a2259ec8bbd396a4fac494b3b84e45613c81f159a05528b687cb36110f6` |
| Independent actual runtime review | `6cce897c30bbea611d3ffa92a8c603ff17e42c50f4343cb5a64bedf56b368607` |
| Independent runtime source review | `02ebf20d29237f81651b0736478fd36bcb0d2bb3ebd1ea6293604298ac16cfd4` |
| Independent capacity review | `b820a132d77daa416b6d98e2fb80f2d1a82f043e79d41edde2b2789bf8e9dc42` |
| Candidate image ID | `daba4110c60c630ce3a114cd55f4014f66856ae44069862c51a7fe7ca028392c` |
| Candidate Docker archive | `8bec1caa494cb2397865231fdf89052d1a501e24d0a024c47f95670769bea2f0` |
| Archive admission receipt | `7baa8c49ccacc5747dc0253e66bcf88647e501ee78fc0191c3e25834bb114cfb` |
| Candidate CycloneDX SBOM | `038fd45dbbccfdc3352009de13067d3ee39415a1f2296460d05a57a657140d85` |
| Candidate raw Grype scan | `e3deba2b317f04181b7b7a7b71096ec33fad4820d62a7dd2cd11b005c554b0da` |
| Runtime result | `3e695331c338459807b81d4a858951a0d9d225417f9fbedcfb7c3ea1d5cecd45` |
| Runtime controller receipt | `5233c7792318b21dbf2dad5361a9f943d04699aa7218fe13c1d3c63e64d223c5` |
| Runtime cleanup receipt | `0ac8018d866d71b4ad97ecd7cd0fb0a3cea331dfcfa30c4f5492f15dfbcc39bc` |
| Runtime compact summary | `cec655bb7909e62a0c40cd686796357c8f1b4e260c929e1ca787e8027795e423` |

## Retained earlier attempts

- The initial toolchain run stopped on a controller image-ID formatting assertion before package building. Cleanup completed.
- Retry 1 built both packages but its broader sanitizer run reported the missing DFSG fixtures. The failure remains retained. Its export container also left one anonymous inherited PostgreSQL volume.
- Retry 2 stopped at guest custody when it detected that volume, before package building.
- The first isolated volume-recovery admission stopped below the historical capacity floor before boot. The next checked read-only empty-volume probe automatically removed its own anonymous volume during container removal, and the following explicit remove reported absence. That failure receipt is retained. Retry 3 subsequently confirmed the empty volume inventory before and after successful execution.
- A first runtime file-only admission encountered sandbox denial on Podman's inventory lock file. An authorized read-only admission then verified source/artifacts and deliberately stopped before any VM start. Actual runtime used the reviewed frozen controller.

These historical receipts remain separate from successful package and runtime receipts.

## Subsequent admission review correction

A later offline review found that the initial guest admission in controller `1745eba7ad57d629e3e4d4628f36cb7272eafce56a6fbb2a035084f6af586a46` combines some `test` commands with `&&` under `set -e`. POSIX exempts a failed first command of that compound list from automatic exit. The reviewer reproduced continuation after a failed mount query and after a nonempty container query. Initial guest inventory-query success is therefore unverified by that guard. The source review's original PASS is retained with this correction.

The separately checked package/consumer/recovery assertions and exact completed receipts retain their recorded outcomes. Final container inventory is independently parsed from the checked command's JSON output. Final zero-volume verification uses a checked standalone assignment followed by a standalone emptiness test, and the final normal VM stop and socket restoration have their own receipts. Successor admissions require separate standalone checks for platform, mount-query status/output and each container/volume query, with negative offline controls recorded against the successor source. Those controls belong to the successor's evidence.


## Tracked builder execution

The opt-in builder committed at `341573d2cde299d4b3adb8250af6240441353336` subsequently completed an actual native ARM64 execution. Its private wrapper admitted all 23 pinned inputs, ten exact committed Git blobs and four previously verified public source archives. The wrapper uses standalone guest custody checks and the corrected negative controls described above. Admission observed 803,262,906,368 available host bytes against the unchanged 512 GiB floor. The inner builder allowed 120 minutes, its outer command 125 minutes and the complete VM window 150 minutes, including a 15-minute cleanup reserve.

Operation `cedb2056c47bd5f5ae75bb0df0840684` completed all ten wrapper stages and 22 builder checks with exit zero. Both baseline and candidate Debian package builds, explicit optimized checks and paired ASan/UBSan checks returned zero. Each sanitizer parser runner reports 3,360 cases without errors and each recursion runner nine without errors. The ABI diagnostic remains exit 4; authored CVE reproduction, generic ABI approval, release qualification and risk acceptance remain false.

Cache evidence is retained separately from test status. The four pinned public source files were deliberately reused. Neither the toolchain-build nor package-build log reports a cached layer: the toolchain emits actual package installation output and the package RUN emits input checksum validation and fresh source extraction, with fresh package/check/sanitizer logs exported in the new 88-entry artifact manifest. The candidate-image build reused only its `USER root` and `ARG EXPECTED_ARCH` metadata layers; its package installation RUN executed. This run therefore exercised the tracked package and sanitizer commands, rather than merely re-reading the earlier recipe's cached result.

The newly built Debian package and complete candidate image have different hashes from the earlier experiment. The libxml2 provider itself has the same SHA-256 as the earlier admitted provider, independently checked inside the running new image. This establishes the exact tested provider bytes; it does not establish bitwise package/image reproducibility or repeat the earlier five-consumer, recovery, rollback, archive-admission or scan experiment on the new image. The earlier nine-Critical scan remains evidence for its own distinct candidate. No fresh scan or changed vulnerability disposition is inferred here.

The wrapper removed only operation-labelled build resources. Checked final container JSON is empty, the standalone final volume check passed, the VM stopped normally and zero active VMs, both socket-route conditions and the unchanged default connection were verified. Both controller and builder receipts have empty cleanup-error lists and no deadline overrun. The new candidate image was removed after its provider proof; private build artifacts remain retained.

Private evidence is `.local/upgrade-evidence/nov14-pg-libxml2-tracked-builder/execution-cedb2056/`. Independent actual review rechecked all 23 pins, ten committed blobs, all 88 artifact hashes, all required status fields and the loaded provider/package hashes.

| Tracked-entry artifact | SHA-256 |
| --- | --- |
| Wrapper source | `2a097b235bb15c0c8b0ad3d3a9fddd12a8c99617af8cb4c34f06c9cac6c4492d` |
| Execution input pins | `a89169d04eb80684fe603680061d5c6ca93bb0d0413583be32d1d60999b6808b` |
| Build receipt | `3edf7f021b1ab6d4b2120166a1bf8eb173ea41f70b239e998cdcf79ded54b02a` |
| Exported artifact manifest, 88 entries | `3b91b832681f2555bd815f1149d88f763f6ec37e9bd1089455a28f03a122bb97` |
| Newly built runtime Debian package | `39d4bee60ba4bd765cb9e514b99b69a8610d4a20a1ab6afac5906f44898220e0` |
| New candidate image ID | `43ee8fd968f0ca07f07b1fd5592dbe99a41b49f79038a9b630cd45c43dff2a9d` |
| Loaded libxml2 provider | `af1bde0a68f9454df32e838e763f500251495e21a6556dc9c959aa61f6f99b23` |
| Independent actual tracked-entry review | `c3fb8dafdfd91da9ec1b82c3aa7e0f8d813d6fe67a55dd49228a86af6c07d832` |
