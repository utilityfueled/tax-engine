# ARM64 PostgreSQL gosu rebuild evidence

On November 14, 2026, the candidate-only builder at `9c2ff98dc836fb455b3d7abb3c03f23b0152462b` completed native ARM64 construction, privilege-drop, PostgreSQL recovery, independent archive-load and cleanup checks. The raw scan retained **6 Critical and 106 High matches**. Risk acceptance and release qualification remain false; default Compose and production images are unchanged.

The unmodified upstream source is gosu 1.20, commit `29b939aa5bd4dc588af765b8248f6e39150d2565`, rebuilt with pinned supported Go 1.27.4. Dependencies remain upstream's `github.com/moby/sys/user v0.4.1` and `golang.org/x/sys v0.1.0`. The upstream signed 1.20 binaries still use Go 1.24.6, so they were not substituted for the source build. [Upstream release](https://github.com/tianon/gosu/releases/tag/1.20), [Go releases](https://go.dev/doc/devel/release)

The explicit base is the previously archived libxml2 candidate `daba4110c60c630ce3a114cd55f4014f66856ae44069862c51a7fe7ca028392c`, archive SHA-256 `8bec1caa494cb2397865231fdf89052d1a501e24d0a024c47f95670769bea2f0`. Its source and ABI limits remain in [the libxml2 evidence ledger](upgrade-2026-postgres-libxml2-native-20261114.md).

## Actual execution

Operation `bcab63b4` completed **80 wrapper stages and 15 builder checks**, all exit zero, with no cleanup errors or deadline overrun. Admission checked 38 pinned inputs, ten exact committed Git blobs, seven public source/module inputs and the official ARM64 SDK. Module checksums, compiler metadata and static ELF architecture were verified. Build networking and pulls were disabled. The 90-minute total includes 15 minutes for cleanup; the inner builder allows 45 minutes and its outer command 50. Fresh admission retained the 512 GiB capacity floor and the isolated native VM's no-mount/empty-container/empty-volume guards.

- Named/numeric UID/GID, supplementary groups and HOME matched the PostgreSQL account. Actual PID1 exec and ordinary TERM produced the expected exit 42.
- The real PostgreSQL entrypoint initialized fresh synthetic storage as the postgres OS user. TCP SCRAM authentication, exact `NUMERIC(38,8)` value `9007199254740991.01000001`, XML and binary facts survived normal restart and custom-format dump/restore. The prior image opened the same stopped volume and passed rollback assertions.
- All six existing PostgreSQL/XML consumer and provider hashes remained identical to the admitted base. The new gosu executable is byte-identical to the first experiment; the image and notice bundle changed.
- The exported Docker archive's config matched the candidate ID. A separate, initially empty VFS graphRoot/runRoot loaded that archive and independently reproduced its image ID and actual gosu file hash.
- The installed third-party notice bundle matched the exported artifact and contained the full 1,453-byte Go SDK LICENSE, as well as the module notices. [Go license](https://raw.githubusercontent.com/golang/go/go1.27.4/LICENSE)

The predecessor's held guest directory was removed only after exact path/owner, both archive hashes and empty independent-store checks. Base-image cleanup observed `owned-base-already-absent` after a checked existence query. Unknown statuses, inspect failures and identity/label mismatches still fail. Final inventories, ordinary VM stop, both socket-route conditions and the unchanged default connection passed; active VM count is zero and no guest directory remains held.

## Scan and release boundary

| Severity | Matches |
| --- | ---: |
| Critical | 6 |
| High | 106 |
| Medium | 168 |
| Low | 52 |
| Negligible | 138 |
| Unknown | 34 |

The three previously reported embedded-Go Critical matches are absent from this scan. The remaining six Critical rows are four glibc package matches for CVE-2026-5450, private libxml2's Debian-namespace match for CVE-2026-6653, and SQLite CVE-2025-7458. Explicit empty scanner configurations, the pinned local advisory database and raw JSON are retained; no findings were suppressed. Scanner exit zero establishes completed scanning, not acceptance.

Native AMD64 evidence, accountable maintenance/security ownership and dispositions for retained findings remain outstanding. This narrower runtime does not establish generic libxml2 ABI approval, execute its authored CVE reproducer, or repeat the full application browser/Compose qualification on this distinct image. No image was promoted, published or deployed.

## Retained correction and artifact ledger

The initial `a370431d` experiment (`execution-ea7d713d`) completed its build/runtime/recovery/scan assertions but failed cleanup when inspecting an already-absent imported base. Its third-party bundle also omitted the statically linked Go standard-library notice. Both original artifacts and the failed receipt remain unchanged. Commit `9c2ff98d` adds the exact SDK notice, compares it against the maintained pinned copy and rejects omitted/truncated/altered exported notices. Its focused tests passed 60 checks; the successor's 29 offline controls cover admission, deadlines and strict idempotent cleanup.

Successful private runtime evidence is `.local/upgrade-evidence/nov14-gosu-native-rehearsal-successor/execution-bcab63b4/`. Independent actual review rehashed all 38 inputs, ten Git blobs, all five artifact entries, the archive/config, notices and raw scan, and verified final cleanup. Synthetic credentials and private runtime logs remain outside tracked documentation.

| Artifact | SHA-256 |
| --- | --- |
| Candidate image ID | `ee29c6683d421b2fcd5017f78906fad81aa5bab970ea63548cdf36ac323ed1a7` |
| Candidate Docker archive | `60c78b4213c3b7d599502ef64f5bea2188d3afc4fdb8d1b932ef1fa989204db8` |
| Gosu executable, both experiments | `31d5409710d24fd43e5d660e8bf49dceafb5764cc2a5c2343ec4d55ccda764cb` |
| Installed third-party notices | `3d998ab076413e0dc539b2107e958fd4fce4fe48d4fef74959d9c882a742c2f4` |
| Runtime controller | `4dd21e61a0345b9f8e0738a1b891cd460da70530b761488febfe29afb1d0e900` |
| Execution input pins | `1c37408269901485f3ce18ac81640c5981d252c76d353f36d70678584f997bd1` |
| Builder receipt | `a50ea30450481dd84451c4969b09f6a548f3e5aa2bea19723cb6b065bf64eb05` |
| Wrapper receipt | `3af753fea8543c38dcbfbb2d28ffc271dbf92fdbf6a0438187fdae402e903e3c` |
| Cleanup receipt | `0ac8018d866d71b4ad97ecd7cd0fb0a3cea331dfcfa30c4f5492f15dfbcc39bc` |
| Runtime result | `2367b6c582b7fae003710679802c88148381f4c66af43d24968e4c2f35dd47cb` |
| CycloneDX SBOM | `5f9f0393b71786338bf6a55171a51f69c046e769ce0d6a20b7dd69670e6f379c` |
| Raw Grype scan | `9d4efdd8b50de26b5369126dff4d4b2b15488bf8411710b572da0f173dda40d7` |
| Independent actual review | `b14e3ed1bdf25009e0daf037bb1bc01a51d65f15c84e728a33aecc864248e16f` |
