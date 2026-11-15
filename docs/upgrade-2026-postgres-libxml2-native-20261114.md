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

## November 15: external W3C harness remains unexecuted

The bounded external W3C comparison is still pending. Earlier attempts stopped
at boot-daemon custody checks before guest work. A reviewed successor correctly
recognizes the exact persistent boot daemons while preserving process ownership,
argument values and uncertainty checks. Its actual operation
`f113493259b120d66d0c44cf` boots normally and builds the fresh toolchain, then the
harness compile container exits 2: `/bin/sh: 0: cannot open /build.sh: Permission denied`.
No corpus case runs. The compile-success gate still requires exit zero. The
original cleanup refuses this unexpected compile status and leaves a recorded
recovery requirement rather than silently accepting it.

A separately reviewed 600-second recovery admits only that exact stopped,
non-OOM exit-2 container. All 41 commands complete normally. It retains private
container and compiler/package evidence before removing the one stopped
container, two newly imported/built images and exact owned guest directory.
All 31 initial images remain; normal VM stop, original CPU/memory, default
connection and socket routes are restored without force. Actual observations
show enforcing SELinux with `user_home_t` labels on the three bind sources. These
observations support investigating container bind-label access; they do not
prove the precise denial mechanism. Unprivileged case-file permissions also need
source review before a successor. There is no W3C conformance or security
acceptance claim.

Private recovery receipt:
`8f78cc79f05dc44669c1377b9df5cb5ff0ced2a36a218f0f410eadba144402ba`;
independent source review:
`b1a218fbe1a8f295cd743f98c47dffc5a18f488cc0828d2381c63465fd67782d`;
independent actual restoration review:
`256de500a0efd5f1d6b3fde926aefe478f32b3bf66ba7cb95d6365f79ebc959f`.
All prior failure receipts remain retained and separate from successful cleanup.

## November 15: fresh W3C compilation passes; first case cannot launch

The separate V10 successor explicitly bypasses toolchain layer caching and uses
scoped bind relabeling with exact corpus permissions. All 165 input pins and 83
offline controls pass root and independent source review. Actual operation
`7b7fe62ed3e0dc11a4fa8b7f` builds a fresh toolchain, compiles both harnesses and
admits all 3,697 original corpus members and both exact provider hashes.

The first baseline container exits 126 before its loader or XML harness runs:
`crun: write to status file: File too large`. The shared-mount initialization
guard stops immediately without retry. One container launch is recorded; zero
XML cases complete and the paired comparison remains incomplete. This failure
does not establish parser behavior or conformance.

All 57 outer commands finish normally, with the separately proved normal-boot
daemon reconciliation retained. The exact case container is inspected, removed
and verified absent. Container/volume checks, owned image/directory cleanup,
normal VM stop, original CPU/memory and both routes/default restoration pass.
Cleanup has no errors or unresolved child operations. The retained archive has
226 members, including eight ordinary package symlinks; review reads fixed
regular members without extracting those links.

Private controller receipt:
`9c94c5382056a68abadca8fb9bd49921bd63620ebdc6fb04227df984fa430cc1`;
normal-cleanup receipt:
`226570e03da5e0db8387bb51a105295cba2161a19e4180d9bcb72292855fb364`;
guest-evidence archive:
`304a6d37dfd148c27e8b41511fa82919ea338c9552482e75994d6fdf217e26c9`;
root actual review:
`fadeeb2ef9c4d604910628eb6b8986f8a269d69978a75baf08a2c25f58c57f74`.
Independent actual failure and cleanup review:
`b43119103e53c109d83f4027b1cb9b0de93a628e56b6935a30fcace485453dd6`.
The failed run, preparation failures and successful cleanup remain distinct.
The file-size limit needs a separately reviewed correction before another run.
Conformance, candidate release and security acceptance remain false.


## November 15: corrected limit admitted; capacity stops before payload

A separate reviewed successor corrects the case container's file-size limit from
512 bytes to 524,288 bytes, preserving the existing 512 KiB output bound. Its
internal payload digest was corrected separately after source review rejected a
stale entry. The original failures remain retained. Actual operation
`b99133aea3b2bea0577813a3` stops at guest admission before creating its operation
path or loading any payload: available disk is 268,040,970,240 bytes, below the
unchanged 268,435,456,000-byte floor by 394,485,760 bytes. A bounded read-only
diagnostic confirms the shortfall, absent operation path and empty containers
and volumes; it does not establish the cause of disk use.

A separately reviewed normal recovery repeats exact host-process, disk, socket
and guest absence checks. All 18 commands pass. It normally stops the isolated
VM, verifies owned daemons gone and all VMs stopped, restores 2 CPUs/8192 MiB and
the original socket routes, and preserves the 384 GiB disk. No guest files or
images are deleted, no floor is lowered, and no unresolved child operation
remains. The corrected case limit has not yet been exercised by an XML case.

Private actual recovery receipt:
`78699a98a7264aeb5cbc20ebb4c08d64df757c5171b8aac1e261f01a16baa9cc`;
root actual review:
`4226ad1f020c5e8cb3b16c61ab71a29e31f9cda6d228fa1efef2c4ab5d3afc67`;
independent source review:
`7908a43a959a0c098cca2481aefe9526a9bb13efff63486466eb536fcb7e98a0`;
independent actual restoration review:
`4805b4630b3d9960891b054cf6b2eb28edc257fdca0f814b15be8f2702bbc45e`.
External conformance, candidate release and security acceptance remain pending.

## November 15: retain cache harness failure and normally recover

The separately reviewed owned-cache maintenance attempt boots the isolated VM
normally, then stops before guest observation or image deletion. Its inherited
supervisor returns no `childPid`, while the boot-custody consumer requires that
field. All seven actual commands exit zero, but the controller records
`KeyError:'childPid'` and retains the VM because boot custody is unconfirmed.
The original source reviews and mocked controls missed this interface defect;
their earlier passes do not establish successful maintenance.

A bounded read-only census independently derives the current unique daemon
group from exact argv, owner, parent, configuration, executable, disk and socket
identities. Start times fall within the actual boot interval. The historical
child PID was never recorded and is not reconstructed as direct evidence.
Separate recovery repeats fresh host and strict empty-guest/path-absence proofs,
then normally stops the VM. All eighteen commands pass, with original 2 CPUs,
8192 MiB, 384 GiB disk and socket routes restored; no child/operation uncertainty
or deadline overrun remains. No image, volume, container or guest file is deleted.

The minimal supervisor correction adds the actual owned `Popen.pid`, or null
when spawning failed. Real benign-process tests reproduce the missing field
against the failed source, then verify PID/PGID equality, the unchanged boot
consumer with a naturally closing descendant, and failed-spawn behavior.
Root and separate source review each pass 46 controls against 56 frozen inputs.
Corrected maintenance, disk reclamation and XML comparison remain unexecuted.

Failed maintenance receipt:
`f46b87411d2da41c178b5cd351e1aa0ea88d30ff1199d8ef54cb44fb32243007`;
independent failure/real-contract review:
`83c1bd16a0a865f25f56ccb050b43e721a8ba1fd4512cccac8087a94e1e437d0`;
actual normal-recovery receipt:
`d4af1a00914e79368621838765f13d90023733ed36b8e479b010155b0219cca4`;
root actual restoration review:
`3afbf1bc25949a2c77032694a66ba3704cdb0bf1097d0c3488b68509212d44d0`;
independent recovery source review:
`0af9125383966f5e4433684404d30410f2a08efb41f5c921eff27b42e07db833`;
independent actual restoration review:
`b15dc3454b33570a0f9972a30d0d7214ed2518a7861aa7dbb07ab49fa175edeb`.

## November 15: exact owned-cache maintenance succeeds

The distinct corrected packet passes all 65 actual commands. Its full inventory
contains 41 images. Saved full-parent, five unique build-step prefixes, creation
times, exact history/layer prefixes and current reference checks admit exactly
five V10 toolchain intermediates. Each explicit child-first removal uses
`--no-prune`; fresh before/after inventories preserve all 36 other images and
their content/reference metadata. No container, volume or guest file is removed.

Available guest disk rises from 268,041,056,256 to 268,508,549,120 bytes, a measured
gain of 467,492,864 bytes. The unchanged floor is 268,435,456,000 bytes; afterward
the observed disk and memory floors pass. This establishes the measured cleanup
effect, without attributing all earlier disk use to these images. Fresh empty
guest checks, normal stop, all-owned-process closure and original resources,
configuration, disk and socket routes pass. No force, global prune, resize,
unknown operation or deadline overrun occurs. XML conformance and release/security
acceptance remain separate unfinished gates.

Frozen manifest:
`d835a1cae66525b65c6de6830edc3d5c5fefafcda87e7c33bbb26a8242af5911`;
independent source review (330 inputs, 86 replayed and 207 separate controls):
`d225d29a441212653209b00703d517bcd8a13980f5d318d3fd60c63e728a35b1`;
actual maintenance receipt:
`2465475da1e24fa13bd18ed2794dd12eb6b6226263fcba5e06455b2788f074fa`;
root actual inventory/normal-restoration review:
`56678638d567fc075a235296d6e016c4a0c2270bd55a385ead284a7a5afdb55f`;
independent actual inventory/normal-restoration review:
`0132788e6f06ff255f5b0cc81b02293acc97d2893e4610c372ff48455d5093a8`.
