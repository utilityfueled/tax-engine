# Closed build-cache recovery — November 15, 2026

The completed cleanup removed ten reconstructible `apps/web/.next/cache`
directories from old managed verification worktrees. For each source below,
only the completed `static` and `browser` worktrees were selected:

| Historical source | Completed package |
| --- | --- |
| `611ad215` | `nov15-main-parallel-611ad215` |
| `f30723f9` | `nov15-main-parallel-f30723f9` |
| `8c1bd108` | `nov15-main-parallel-8c1bd108` |
| `19a6134b` | `nov15-main-parallel-19a6134b` |
| `9b2d6cbb` | `nov15-main-parallel-9b2d6cbb` |

Inspection session `87533` and apply session `94814` both received terminal
exit-zero acknowledgments. Before removal, the script required passed lane
results, exact worktree paths, owner and directory checks, recorded device/inode
identity, no cache symlinks, and no process or open-file references to those
worktrees. Removal used the exact cache basename relative to an owned parent
directory descriptor with symlink-safe removal.

The saved execution verified equal non-cache domain hashes before and after
cleanup, including file bytes, modes and literal symlink targets. Sources,
final runtime assets and reports were preserved. Dependency directories and
stores were outside the removal scope; no VM calls occurred. The independent
saved-artifact review confirmed all ten cache paths absent and rehashed all
30 workdir/result/source-pin custody files without repeating the expensive
non-cache census.

Observed host available disk increased from `542,774,960,128` to
`555,645,214,720` bytes: a concurrent net change of `12,870,254,592` bytes
(about 12.87 GB). This is not exclusive attribution of freed space to this
operation. The receipt's `admissionEstablished` field means only that the
recorded post-cleanup available disk exceeded the 512 GiB floor. It does not
establish current capacity or complete VM admission; fresh memory, disk,
socket, resource and custody checks remain necessary. No benchmark,
qualification, release or human approval is claimed.

Private evidence is retained under
`.local/upgrade-evidence/nov15-closed-webpack-cache-reclaim/`:

| Evidence | SHA-256 |
| --- | --- |
| Executed `reclaim.py` | `0ec52924c3a1a394945f68cb38eacd2c98b1ae85e98cb4cbba59ce722da622d1` |
| `INSPECTION.json` | `588e936bf68e7b9846d2bb95015276aa24f8027c445c793d7acf936311b478fd` |
| `RECEIPT.json` | `00444bb38a834d50cb54848ca576d6b353b613e09958a912b619827ffd0326c1` |
| `ROOT-TERMINAL-AND-SCOPE.json` | `5e9080902c3e901c645b7778344d89a7d3f7b00cfb24f65892af2cf0c96a8fa5` |

Independent review:
`.local/upgrade-evidence/nov15-closed-webpack-cache-reclaim-farmland-peer/REVIEW.json`,
SHA-256 `f851c40d62e46448cc21e450f47bc319993eb9f9887515e34d4b4c0a34e5dd5e`.

Two later bounded cleanup packages remove only four completed a137/1360
static/browser caches and six other completed verification-lane caches. The
four-target variant passes separate source review; root checks both actual
terminal acknowledgments and retained receipts. All non-cache source, final
assets, reports, package stores and VM state remain unchanged. Some other lanes
of the older six-target packages have historical failures; only the enumerated
completed lanes are in scope. No VM is started.

The last recorded available-disk observation is558,992,326,656bytes. Concurrent
net increases of4,295,405,568 and7,227,965,440bytes are not exclusive attribution
or fresh VM admission. The512GiB floor remains unchanged, with current memory,
disk and custody checks required before every actual rehearsal. Private receipts
are `nov15-completed-a137-1360-cache-reclaim/RECEIPT.json`
(`6fb20b2a534bc9a8e0d1e5907e24f1ad95b089e6f2c8494346c21edb7a06fcee`)
and `nov15-six-completed-lane-cache-reclaim/ROOT-REVIEW.json`.
The six-target variant has root source review, with no independent source-review
claim. Both actual apply commands exit0.
