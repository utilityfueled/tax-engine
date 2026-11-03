# Batch strict reading of actual Ohio PDF packets

The unchanged thirteen W2-reference controls make repeated Python subprocess
calls for each saved packet, including rereading files that were just checked.
In the current integration run, two five-mode cases hit the existing 5,000 ms
limit: the broad run retained 2,001 passes/two timeouts; isolated replay retained
eleven passes/two timeouts. An exact private archive of unchanged `4c735073`
passed all thirteen, taking 12.16 seconds in test bodies. The baseline did not
fail; the workload was close to the existing deadline.

The test helper now parses every actual saved PDF once per packet in one Python
process. Every file still receives pinned pypdf 6.10.0 strict parsing, field and
widget checks. All original titles, fixtures, monetary literals, privacy/value
assertions, saved-file retention and the five-second deadline remain intact.
Only the local lookup replaces redundant parsing; no cross-packet or cross-write
cache exists. Product code and tax arithmetic are unchanged.

Independent offline review approves the exact two-path spec/test diff, with no
findings. Receipt:
`.local/upgrade-evidence/nov03-oh-pdf-reader-batching-independent/independent-offline-review.json`,
SHA256 `2bbca41e3dee027102cce939db857d7dd6c7b247cfe207be8e6e3a0c9109fd87`.
The reviewed spec/hash lineage precedes runtime and preserves the original files.

Fresh current-main replay passes all thirteen in 2.43 seconds of test bodies.
Root types, spec validation, all 788 spec/AST controls, strict test lint with zero
warnings and diff checks pass: six commands. Evidence:
`.local/upgrade-evidence/nov03-root-oh-pdf-reader-batching-green/checks.json`,
SHA256 `28c3cb5554351b92ab4bd9539f3cf122efc24e103d39b6bad9fe575176bcbb78`.
No threshold or coverage exclusion changed. The broader integration and final
release checks remain distinct work.
