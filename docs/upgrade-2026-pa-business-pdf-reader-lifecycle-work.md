# PA business PDF test-reader lifecycle

The exacta4ac local full unit run stalled in
`tests/pdf/pa-ordinary-business-source-pdf.test.ts`. It completed1,852 files;
the remaining file never produced a terminal result. Native samples show its
Python child waiting in stdin read before PDF parsing while the Node worker
waits in synchronous process execution. That synchronous call prevents Vitest's
120-second case timer from firing. This is retained incomplete-run evidence,
not a tax assertion failure or a passed full run.

The one-line correction imports the existing `file-stdin-exec` helper instead
of Node's direct `execFileSync`. It supplies identical bytes through a real
file descriptor, retains the exact Python code/arguments and uses the existing
30-second native timeout with descriptor/file cleanup. All three case bodies,
privacy/amount/source assertions and120-second case deadlines remain byte exact.
No calculation, production code, global threshold or timeout changes.

ROOT reviewed the full original test, existing helper, minimal patch and actual
native stacks. The explicitly owned test process group was terminated; the
unchanged outer harness records tests exit−15 and runs cleanup. PostgreSQL
stopped, its port is free, the temporary cluster is removed and frozen source
bytes remain exact. Coverage and later checks did not run in that attempt.
The first loopback-identity harness correction is also retained separately.

After adoption, the original three cases pass in2.576 seconds at unchanged
budgets. Root/contracts/web types, spec validation, inventory generation/check
and strict file lint all pass. The single PDF-operation marker precedes that
new focused run; three merged review outputs are retained privately. An initial
marker-path precondition failure performed zero markers/tests and is retained.

Private diagnostic/attempt terminal SHA256:
`8c65d1f685e33537d13553b7b12c70a8d8afc7e6bcbd9962b26f4cbef6c543e6`.
Focused main-check receipt SHA256:
`aaf2536c147c749af498823499ae92b63cd2f04815b95bf5d4ea8b9138d9b885`.
Evidence remains under ignored
`nov04-pa-business-pdf-reader-lifecycle`; no stopped run is relabeled successful.
Full successor unit/coverage and native/hosted/global qualification remain open.
