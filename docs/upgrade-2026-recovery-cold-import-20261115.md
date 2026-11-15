# Recovery rehearsal: remove an unrelated cold import

Remote coverage at `9b2d6cbb` timed out while starting the real recovery command
under its existing 4,500 ms child deadline. The command imported the browser
workspace factory, which transitively loaded the calculation-engine barrel even
though recovery only needs an empty synthetic workspace.

The rehearsal now constructs that fixed synthetic shell from the shared contract
and checklist. A deep-equality test compares it with the actual browser factory,
then verifies fresh documents, checklist and nested audit arrays after mutation.
A real fresh Node/tsx import test rejects loading the engine barrel. No real
recovery SQL, eleven-table checks, backup/restore, issuance/receipt binding,
metadata migration/rollback, exact accounting or test deadline changes.

File-only tracing observes 656 loaded repository files before the change versus
25 repository files and zero engine barrels afterward. Measured startup changes
from about 1,060 ms to 140 ms locally. This confirms unnecessary startup work; it
does not identify the precise remote scheduler or CPU cause of the timeout.

The final three files pass independent source review, strict TypeScript and
lint. Author/peer file-only checks pass. Root additionally starts a fresh
loopback-only PostgreSQL 16.16 cluster with SCRAM and no Unix socket, executes all
three tests without skips, then stops that owned cluster normally and removes
its private URL/password files. The original real recovery child passes in
329 ms; the complete focused Vitest command takes 2.82 seconds. These are local
results. A new successful remote coverage run is still required.

Retained private source manifest:
`2b20de2c8ad3d037f37edbe207c4ec89fc67b6ff9adbd4b31f979b02f06cbb45`.
Independent source review:
`545f16ffaaadd711f8061e24d9829dcedc340e3ee492e3976ae58521eccd285d`.
The earlier failed CI timeout and intermediate type annotation correction remain
retained. No production database or external service is involved.
