# RRTA saved-review operand scanning

The scanner reuses a successful operand-string check for an identical parsed
operation list within one inspection. It retains at most 4,096 identities and
falls back to full scanning at capacity. The operation lists remain alive and
unchanged until inspection ends. Every resource context, Do reference, cycle,
ambiguity, raw byte, decoded string, object graph and extracted page-text check
remains in place. The child retains its four-second deadline and64KiB output
cap; the ordinary unit deadline remains five seconds.

This follows actual ef7 GitHub RRTA privacy-scanner timeouts. An offline
cProfile of the unchanged scanner against the saved16-page synthetic PDF and
its18 private markers identified repeated operand work. That instrumented run
is diagnostic evidence. Three subsequent interleaved baseline/candidate pairs
all pass the existing four-second subprocess cap with identical full privacy
projections. Observed Mac wall ranges overlap:0.961–0.982s baseline and
0.934–0.980s candidate. Linux success remains unestablished.

The spec and desired tests precede implementation. An initial private runner
collected no tests because its web dependency link was absent; that setup
failure is retained. The corrected original-scanner run has one genuine desired
failure and one passing changed-marker control. The implementation passes30
focused and54 total privacy tests. Eight distinct independent inspect-API
controls also pass, including later private operands, inherited/missing/cyclic
resources, changed markers and full fallback. Twelve existing privacy/helper
function ASTs remain unchanged. Independent manifest:
`5c20089bc27a636bb70438e40f227b8ca6e9e6e2042eb82d465879fb6261846e`.

Current-checkout validation passes78 tests across three files, covering both
privacy suites and the unchanged inventory controls. Ordinary inventory
regeneration leaves the930 entries byte-identical, and its check passes.
Owned test lint has zero warnings/errors; all11 affected spec references
resolve. Scoped test types retain one exact pre-existing TS2352 in the
unchanged complete-facts fixture; the separate parent replay produces the
identical diagnostic, with no new errors or changed type configuration.

The request audit changes one existing Python source hash, and the diagnostic
case file changes only its required audit-byte binding. All592 cases,14
historical targets, deadlines, quotas, retries and worker settings remain
unchanged. Source preparation parent is ef7cbac53ff5d28a04f7a694527d8900d5420e89;
evidence is under .local/upgrade-evidence/nov06-rrta-operand-reuse-private.
No tax formula, fact, dependency, provider or readiness gate changes. Final
combined checks and actual successor runtime qualification remain required.
