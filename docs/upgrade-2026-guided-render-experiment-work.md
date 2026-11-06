# Rejected guided render performance experiment

The November 4–5 experiment did not establish a browser improvement and is not
adopted. The final uninstrumented successor passes nine of ten unchanged cases;
the baseline passes all ten. The successor's Ohio known-zero reciprocal case reaches
the existing 30-second cumulative body deadline at the filing-rejection check,
after completing its review PDF. The capture does not establish server latency.
No assertion, timeout, retry, worker limit or readiness gate was changed.

The baseline is application commit
`045fbedbdfbe612cb3caa28956fa7228bb3df320`, tree
`cc964be84406697ce2b15e60f7d6c9cc148af2b7`. Four tracked experimental paths are
restored to their exact baseline/HEAD bytes; three new experimental files are
removed only after their complete patch and source copies were independently
hash-verified. Unrelated `.pnpm-store/` and `docs/reviews/` remain untouched.
There is no retained application or test change from this experiment.

## Measurements and limits

The first production pair passes ten cases per source with actual two workers,
30-second bodies and zero retries. The cyclic successor takes 87.9 seconds
against 68.1 seconds for the baseline; individual cases are 12–36% slower.
The unnecessary runtime import cycle is subsequently removed in the private
experiment, without claiming that this repairs the observed slowdown.

Acyclic browser-level B-A-A-B tracing covers complete lifecycles and passes eight
bodies. Its wrapper puts both bodies in one file, so actual concurrency is one
worker consistently, despite the configured maximum of two. Sampled application
bundle self CPU falls about 13.2% for PA and 6.5% for Ohio. Framework code is
included in that bucket; classifying frames by URL/type is an inference. Whole
flow improvement is not established. Injected accessibility-name/role and
snapshot traversal takes substantial time, and run-order variation is material.
Earlier page-level CDP profiles reset on navigation and cover only the final
document; they cannot support full-flow CPU attribution.

The final reverse-order, uninstrumented comparison runs the original ten bodies
with actual two workers, unchanged budgets and clean pinned environments. Its
successor takes 99.541 seconds with nine passes/one timeout; baseline takes
96.598 seconds with ten passes. There is no replacement retry or improvement
claim. The public AMD64 result remains 541 passes, 24 failures and five hosted
skips; this local experiment does not supersede that qualification failure.

During source review an omitted legacy null-target year guard is found. A real
Shell regression reproduces it, and the original guard is restored before final
archival; 19 focused controls and scoped lint pass. Measured browser fixtures
all have explicit 2025 target years. Final archived bytes therefore differ from
the measured acyclic bytes by an unmeasured legacy guard correction; they are
not claimed browser-qualified. Original author diagnostic failures are retained.

## Saved downloads and preservation

ROOT independently checks the first cyclic pair's 16 saved PDFs/eight Ohio
pairs: 292 paired pages have exact extracted-text and rendered-RGB equality.
All 87 unique successor page images are inspected through contact sheets, with
two additional full-page inspections. Strict object/stream/metadata, configured
privacy markers and active-content checks pass, including the absence of an
AcroForm. This is bounded saved-output engineering evidence, not professional
tax review, print certification, final 2026 form or filing qualification. PA
royalty cases do not download a PDF. The later acyclic downloads are retained
but are not covered by this physical parity review.

All paths below are relative to `.local/upgrade-evidence/nov04-guided-render-performance/`:

| Evidence | SHA256 |
| --- | --- |
| `final-evidence-manifest.json`, 2,180 files/489,902,655 bytes verified by ROOT | `c0d1b0c416890559d24db0c713ce04a1c283af86833013c3a19b4ce3014a4773` |
| `FINAL-REVIEW.md` | `d081132b70c5b221a8ca6b38118c019a31770d7a2746c9eff4fb6201de82d454` |
| `rejected-final-patch/product.patch`, seven exact paths | `ca457f4c7f0af5a5877146d2fbdfa175dcdc71975fa243a6ce5ad18a1ce885d3` |
| `restoration-receipt.json` | `315d0281f71d881e56fb843ec8d21ab150360b05e604a284a039c77cafd5a37f` |
| First actual pair receipt | `24a65b123d34ad77e669fe256329c554c92ef1e1a55462127ea1cc016c219af4` |
| First actual download manifest | `881d8b00ecd27f5ddc11bc7b37e9ef4f87d243efab6269a69c6f40f9847f5535` |
| `pdf-independent-review/visual-review.json` | `c9fa316a0c56ffdc888ee103f8a5264d03cd46756218dea1252453e361a1d793` |
| `pdf-independent-review/name-key-raw-supplement.json` | `0dbf0d490e553dd88cbfad9a2a169a0a69f50b4d83b5847b1e9d801b6a12eb75` |

Fresh exact-source native/container/browser qualification remains required.
Profiling suggests a separate accessibility-query investigation but does not
establish a product defect or justify changing selectors. No provider, VM,
deployment, filing or model-promotion operation is performed by this package.
