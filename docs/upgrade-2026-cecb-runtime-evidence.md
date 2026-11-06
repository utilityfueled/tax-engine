# Current cecb image, recovery and browser evidence

November 6, 2026. Application source `cecb99444f63aca4ad8cc4411675c0fa2cf630de`, tree `94ec345bb3f5cca1fc348560fd15ba0008f80c24`. Later documentation commits are not substituted for that tested source.

The [CI run](https://github.com/utilityfueled/tax-engine/actions/runs/42202025531) passes all six jobs, including 27,143 unit and coverage tests across 1,952 files and 87.67% branches against the unchanged 85% gate. The separate [Web run](https://github.com/utilityfueled/tax-engine/actions/runs/42202025336) remains failed:

| Runtime | Passed | Failed | Original hosted skips |
| --- | ---: | ---: | ---: |
| Managed self-host | 587 | 0 | 5 |
| Actual Linux container | 573 | 14 | 5 |

All 592 container declarations have one result, retry zero and two configured workers. Seven unsuccessful results are classified `failed` and seven `timedOut`; all fourteen carry the original 30,000ms case-deadline error. Families are Ohio business part-year (2), resident credit (4), reciprocal (4) and school-district part-year (4). Both RRTA paper cases pass in both jobs, with no failure-phase records; this supplies no positive phase-duration measurement. No test, deadline, assertion, quota, concurrency, privacy check or readiness gate changed.

## Actual image and recovery

Artifact `13498605138` is 613,368,942 bytes, SHA256 `1301653391cd0e45a87469bd45d083609e33dd9996c175169c8876082911a142`. Its actual candidate and browser image are `sha256:b7c01ffc1847a871dda3f3a3afa63fc668a402e101ec9be8843067a338cba13f`, Linux/amd64. Primary Git metadata binds merge `e2942b0c9195235c3a06a11f8b9c217b4e17a92d` to the exact source tree above and cecb parent. The four source-binding member hashes match actual image inspection, Syft, CycloneDX and Grype bytes. Independently decoding both embedded image configurations reproduces the immutable candidate ID and all ten rootfs layer IDs.

The saved smoke reports healthy assets, read-only root, UID 1001, Node 26.13.0/x64 and no provider keys. Six recorded Compose phases pass: previous, upgrade, database restart, database dump/restore, rollback and re-upgrade. Database, browser-facts and document hashes remain equal across all six. Checks cover exact cost restoration, reapplied/idempotent metadata cleanup, encrypted full-original recovery, wrong-password/tamper rejection, unknown years, exact cents and deletion. Previous/rollback use the recorded Node 24.22.1 image; candidate phases use the bound Node 26.13.0 image. These are saved synthetic CI assertions, not a new native or hosted execution. The recovery privacy check covers its raw synthetic markers rather than every possible encoded representation.

The actual CycloneDX SBOM contains 2,883 components. Grype records 182 matches across 81 advisory IDs, including 62 High matches across 19 High IDs and no match with a reported fixed version. Every per-ID installed package name/version set, severity set and match count equals the [current register](upgrade-2026-image-advisories-20261106.json), SHA256 `a2b987b40c7aa42440564cfee13c96555843ee5c329d14a143f1a49dadf88868`: zero differences. This does not establish vendor fix availability or exploitability. Accountable ownership, acceptance and the overdue advisory recheck remain unresolved; no exception is accepted here.

## Failed browser diagnosis

All fourteen actual traces were examined. There are 2,634 completed native control snapshots, each reporting exactly one control. Nonoverlapping snapshot/fill/Tab/select intervals occupy 12.119–19.392 seconds per case. Available records contain no HTTP status zero or at least 400, console error or page error. Those observations do not establish an absent unrecorded error or a removable cost.

A separate interval sweep assigns overlapping calls only once and keeps runner/library call IDs separate. Screenshots, geometry, navigation, saved-source reads, clicks, review waits and parent gaps are retained independently. Most uncovered time consists of many short gaps intersecting runner API/assertion envelopes. These are wall intervals, not CPU, disk or application-compute measurements. Post-body hooks explain additional reported duration and cannot explain the exhausted body budget. The resident-credit next navigation is the normal reopen at test line 100, correcting an initial report's cleanup label without changing interval totals. No actionable shared defect or equivalent-work optimization is established. A bounded opt-in profiling proposal is being prepared separately; no profiling execution is claimed here.

Private evidence under `.local/upgrade-evidence/`:

| Packet | Manifest SHA256 |
| --- | --- |
| `nov06-cecb-remote-ci-monitor` (64 members) | `f98e66757e9c3ec5b3acb2c9723984552fe3f6929c3a210ba74217ffe78c21ca` |
| `nov06-cecb-container-runtime-independent` (8 members) | `8b0d8490141d8447ee7665e002faada783bd27b55259b049ac2f518b7bbae12d` |
| `nov06-cecb-wall-accounting-addendum` (15 members) | `968b1c72ee2601ca785e1fb3179d2114b78fc1032e148ac5f975b9bb1e9c2901` |
| `nov06-cecb-wall-accounting-source-correction` (1 member) | `c62613f3e68fefe8b46bc151549b40bac92649854d923bcca8fd081075bfc6bd` |

ROOT rehashed every listed member and read the reports/correction. The distinct runtime reviewer independently rehashed the complete ZIP, read only 27 exact named members without extraction, recomputed the source/image/scan/recovery bindings and found no projection discrepancy. That is artifact reconciliation, not independent human review of prior product authorship. Original failed runs remain failed. Complete container qualification, ARM64/native rehearsal, hosted outages/retries, human reviews, final 2026 forms, AI settlement and release readiness remain open.
