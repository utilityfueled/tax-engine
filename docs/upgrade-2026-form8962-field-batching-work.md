# Form 8962 field traversal

This package changes only how the physical 2025 Form 8962 map writes its existing
fields. It reuses the existing bounded field batch. Field names, ordered values,
Decimal calculations, checkbox states, source checks, notices and output gates
are unchanged. The batch validates the mapped fields before applying them and
does not retain a cache on the mutable form.

## Evidence before the change

The exact `036eef86` coverage run retained eighteen five-second timeouts,
including the monthly marriage health PDF case. The Form 8962 map and shared
helper are byte-identical to the earlier `183c1bbc` CPU-profiled sources. The
earlier profile attributed repeated field lookup work to this map; it did not
establish the cause of all hosted-runner timeouts.

A private copy of `f70258c3` ran the unchanged monthly marriage tests and a fixed
observation over three actual source packets. All four tests in two files passed.
Each physical form enumerated all fields **141 times**. The one observed fill
time per case was 216.18, 172.45 and 194.64 milliseconds.

## Reviewed result

The same original sources and observation script pass after the change. Each
form enumerates its fields **once**; the corresponding observed fill times were
49.48, 30.52 and 23.38 milliseconds. These are individual local observations,
not a benchmark or a claim that the complete CI timeout problem is resolved.

An independent Python reader verifies unchanged original JSON and calculated
outputs, all **489 fields**, widget states, text and geometry across three PDFs.
All **six rendered pages** are pixel-identical to the baseline. Two actual
rendered pages were also inspected. The comparison has 36 checks and no failures.
The existing **37 tests in 11 files**, root types and scoped lint pass; lint
reports zero errors and three unchanged non-null assertion warnings.

Independent source review mechanically recovers the baseline from the candidate
by replacing the batch calls. No intermediate reads or asynchronous operations
depend on the queued writes. A missing/wrong-type mapping now rejects before
any queued writes, rather than after earlier internal writes; the failed
document is never returned or saved. The existing helper's first matching field
semantics and error checks remain intact.

Local evidence under `.local/upgrade-evidence/`:

| Evidence | SHA-256 |
| --- | --- |
| Candidate map | `26a12bf6d613840758333c641096ab290eb18857df6b2a1b8ac4d74080eb0acf` |
| Original map | `0ebb53e241683172579d5d539722342899635723f0feebb9b3b94d4a3b391407` |
| `parent-8962-field-comparison/receipt.json` | `4713051acc30d892c786df06f4907b9bd97ff709e613d0254600e2e509ac2b7b` |
| `ai-8962-field-batch-source-review.json` | `b7775d6fc8b0b8874dbb947f1ba6a6f8d1b15ac67c198c59fa01f20ebfcadedd` |

The before/after observation logs, original documents, rendered comparisons and
source adoption record remain retained. No tests, deadlines, coverage settings,
tax-rule versions or readiness gates change. Final integrated full coverage and
runtime evidence remain required.
