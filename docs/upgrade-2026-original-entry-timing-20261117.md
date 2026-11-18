# Original entry timing diagnostic

This package adds a default-off observer around the existing Ohio resident-credit
`typeOriginals` callback. It is diagnostic instrumentation; there is no actual
browser measurement or new qualification result from this package.

The manual Web workflow requires both `cpu_full_batches` and `cpu_phase_metrics`.
The runner independently checks those inputs. Original actions, assertions,
request budgets, workers, retries and case/privacy deadlines remain unchanged.

The collector accepts only the reviewed Chromium revision, one unchanged default
execution context and seven fixed numeric counters. It requests `threadTicks`;
Timestamp remains a monotonic wall-time counter. These are inspected-main-thread
measurements including automation, not whole-process CPU, application-only time,
idle time or exclusive stacked categories. See the official
[Performance protocol](https://chromedevtools.github.io/devtools-protocol/tot/Performance/)
and the [pinned Chromium implementation](https://github.com/chromium/chromium/blob/f842f52ef39fd97b449eb27cff414bf05a98ddce/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc).

Records exclude page text, URLs, context identifiers and raw errors. Counter
records are bounded to 4,096 bytes, a 30-second original phase and one-second
command budgets. Negative deltas, context changes, incomplete work and uncertain
cleanup remain unavailable. A separate receipt binds the exact record hash only
after the enclosing runner's existing source/image/inventory checks close.
Historical rejected profiles and failed strict runs remain failed.

Verification: 35 retained public Node controls and 27 existing CPU diagnostic
tests pass; all three typechecks, spec validation, generated inventory checks,
scoped lint and full workflow actionlint pass. The ordinary Web job now executes
the Node controls. Before adoption, after adoption and with both observers enabled,
all 655 collected cases match the unchanged frozen collection hash
`c486b270fbc2136a6f6b11c3b0ae1c64c8e03107dc34fc5c77ed7f90aa355525`.
The request-source audit passes. No browser journey was executed for these checks.

Private authority: `nov18-performance-metrics-cleanup-successor/MANIFEST.json`,
SHA256 `be7cf22794705eaeaaf1c31b39e3f1d362466049c4d10a0161a756c6e4309a6d`.
Root validation and the exact collection receipt are retained under
`.local/upgrade-evidence/nov18-phase-root-adoption/`. Root changes preserve the
original workflow inverse while adding CI execution and fixing two existing
shellcheck warnings; the original workflow hash remains asserted.

Independent review: `nov18-phase-independent-review/REVIEW.json`, SHA256
`22b687fe399608459db7374774d54ce0e76f098aad3311d30d606b125592a75a`.

Full CI at365ba0af caught an existing contract requiring the exact original
awaited entry call. A separate repair preserves that call inside the observer
callback and leaves the existing test unchanged. Its four tests and all35phase
controls pass; both actual655-case collection modes and the request audit match
the same frozen values. Historical CI failure remains recorded; complete new
source CI and actual runtime results remain separate. Private fix authority:
`nov18-phase-awaited-call-compatibility/MANIFEST.json`, SHA256
`573ed7ce1d404dfeb0e5282980609ca0c130f5240fda84fc1177bb8fbc938494`.
