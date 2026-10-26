# Recovery rehearsal failure evidence

The native amd64 Web run for `1e04964` failed at the first upgrade's return
heading assertion. Its call log showed the return still loading. The unchanged
script subsequently passed all six phases locally on native arm64 with exact
`d32cb8c` and `1e04964` sources. That local result does not explain the remote
failure or establish an amd64 pass. Both outcomes remain in the checklist.

The rehearsal now retains the failing phase, completed phase evidence and
bounded browser diagnostics before its existing cleanup. It records fixed error
classifications, failed-request categories, HTTP error status, resource type and
hashed paths. It omits raw URLs, query strings, exception messages, page text,
browser storage and request bodies. A failed page probe returns only readiness
and heading/loading booleans, with a separate two-second diagnostic bound.
At most 100 events are retained; later events are counted. CI saves stderr in
the existing recovery log so failure evidence survives temporary-file cleanup.

No assertion, retry count, timeout, recovery phase, runtime security control or
readiness gate changes. The original exception still fails the process, and
cleanup still removes only the uniquely named synthetic rehearsal resources.
These diagnostics are for this local synthetic rehearsal, not application
telemetry or a general privacy guarantee. Verification and independent review
results will be recorded before delivery.

The three focused test files pass16 tests, including event caps, snapshot isolation,
unknown classifications and omitted private URL/error text. Scoped ESLint passes
with zero errors or warnings. The initial lint failure identified four global
references; these were changed to an explicit URL import and globalThis.document.
The earlier16-test pass and lint failure remain recorded.

The development script passed all six local native arm64 phases using the
already-built exactd32cb8c/1e04964 images: database restart, dump/restore, upgrade,
rollback and re-upgrade, plus encrypted browser backup/restore/delete with exact
cost, original document bytes, unknown year and large cents. This run preceded
only the equivalent global-reference lint correction; its exact source hashes
are retained. It is historical-image diagnostic validation, not latest-source
image qualification. The deliberately absent local-image control then exited1,
retained a structured image-inspection failure with zero completed phases and
created no Compose project. No failing check was converted to success.

A separate agent reviewed frozen tree `e54bbf06` and passed 21 tests in four
files, including five private controls. Those controls exercise the actual bash
pipe's failing exit, the exact catch body's closed and nonresponding page paths,
private URL omission and the mixed-event limit. All five reviewed files stayed
unchanged. Report `ai-recovery-diagnostics-review.json`, SHA256
`34835aa02e48c3a563a894d96372626510a3a6b5d1cca859fb4143a1dbe67a7e`.
No independent container replay or general security qualification is claimed.
