# Retained remote browser qualification failures

The complete aa4 and d192 remote artifacts retain strict container browser
failures. They do not qualify the current application source. Root and independent
saved-artifact reviews reconcile every selected case, all eight batches, actual
image revision labels, unchanged two-worker/zero-retry/30-second policy and
external-server cleanup receipts. The original five skips remain unchanged.

| Source | Web run | Passed | Timed out | Other failures | Skipped |
| --- | --- | --- | --- | --- | --- |
| `aa4df8c226713480117350c32fe8c1a14fcdbbd1` | [43704582177](https://github.com/utilityfueled/tax-engine/actions/runs/43704582177) | 608 | 10 | 20 | 5 |
| `d1921cd0ba73cd69482af38ad2722d049a2ead8a` | [43705439474](https://github.com/utilityfueled/tax-engine/actions/runs/43705439474) | 626 | 5 | 7 | 5 |

Both separate self-host browser jobs pass 638 cases with five skips, using their
configured ordinary 90-second deadline. Those passes do not replace the strict
30-second container gate. aa4 CI passes all six jobs, with 28,729 tests in 2,098
files in each unit/coverage run. Coverage is 92.02% statements, 88.13% branches,
90.99% functions and 95.27% lines, above unchanged floors. Docker passes. GitHub
service teardown uses its platform container cleanup; this is not evidence of a
local PostgreSQL normal stop.

The d192 optional fourteen-target diagnostic fails all fourteen targets; eight
profiles are usable and six are unavailable. Exact generated JavaScript bytes
join to the retained local build. SHA processing samples include the two W-2
validation callers now changed separately, and resident-credit comparisons under
investigation. Sample weights are wall intervals, not process CPU or proved
causes of browser failures. No timeout allowance or retry is increased.

All 5,158 tracked source hashes match their respective runs. Fourteen of fifteen
retained sample hashes match; the mutable official `p4491` remote sample differs,
and its remote PDF bytes were not retained. This prevents an exact sample-byte
claim and does not establish a cause of the browser failures.

| Evidence | SHA-256 |
| --- | --- |
| aa4 complete container ZIP, 858,594,249 bytes | `8420a481a7e6be4a4a23973879695cf1e1aae49fb9c63a5d10ff641c7c97f783` |
| d192 complete container ZIP, 604,069,908 bytes | `870de72368972d1f8ac6a2200c305ad1734c943f271eb1ee2bc678700ab85873` |
| Root complete strict-container review | `2fec8b6766c06900bb63da9b61411736fd81d545e03faeab3dbebd9e4a4002ea` |
| Independent consolidated complete review | `e1a1ba738b14fdf1aef415614e36197d930f6a1c8b1d91c9b4b4120fbcf686e5` |

Private evidence is under `nov15-aa4-remote-terminal-review`,
`nov15-d192-remote-diagnostic-review`, `nov15-remote-container-root-review` and
`nov15-remote-aa4-d192-complete-farmland-review` in `.local/upgrade-evidence/`.
Later source commits require their own combined and runtime evidence. These
failures remain visible while targeted implementation and qualification continue.

## Later PA integration preflight refusal

[Web run 43710607738](https://github.com/utilityfueled/tax-engine/actions/runs/43710607738),
source `442bfd81b725ee1a74ab1a21a38b6b538e4549c8`, fails both browser jobs
before case execution. The committed audit had six stale PA hashes and omitted
the new renderer/fixture, moving the source closure from 1974 to1976 entries.
A fresh archive reproduces `Changed/new source requires action-count review`.
The complete 788,772-byte container artifact has sixteen image/recovery/SBOM
files and no browser collection, batch or trace results. Its SHA-256 is
`bb71652ac90180432968ed5c047b91a26f2e12da8b178b6793f1d92a722386c0`.
This is a source-audit refusal with zero executed cases, not another count of
the previous timeouts. The separately reviewed metadata commits address the
refusal; actual current-source runtime qualification remains required.
