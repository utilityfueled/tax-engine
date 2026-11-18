# Browser fixture source accounting repair

Web run `44248132606` at `91dbc3a523e4d8e798d47fd96caf8fbe715121a1`
stopped before browser cases. The source auditor found 2,006 tracked inputs
against 2,005 recorded pins. Its sole new input was the reviewed offline glibc
fixture `tests/fixtures/glibc-mandatory-pass/positive-output.json`: 7,375 bytes,
SHA256 `990ec3aa9bf540846db27bcffa888af20d1dc2eda0458423a2f005a0924d682e`.
The ordinary browser step failed before collection; source-order and exact
snapshot checks also establish the container browser command's pre-launch hold.
Build, smoke, Compose recovery/rollback, archive/SBOM/scan and recorded cleanup
have separate observed outcomes; none substitutes for browser execution.

The repair adds exactly that one source hash. Removing the added line restores
the original budget file byte-for-byte. All 2,005 prior pins, action/request
budgets, assertions, workers, retries, 30-second deadlines and four-second
privacy checks remain unchanged. No source exclusions or invented browser
results are added.

The new source regression failed before the pin addition, then both tests
passed. It exercises the unchanged auditor and retains missing, changed and
extra-source rejection. Independent source review passes. Root repeats both
tests, scoped lint, 9,534-line spec validation and inventory consistency. Every
prior 1,078 inventory row stays identical; one unsupported operations row is
added. Actual browser outcomes require a later source-bound run.

Private source manifest SHA256:
`ebb32f9c4fce88396a0dbad5f1900714fd721ee5feb1c768ec9858cafcfb02d0`.
Independent review SHA256:
`87a7ce338a228908f9da8ede6279ec63ef93293916d7575d086ee4f89b85ca93`.
Root checks SHA256:
`2c007e516afe09e5ee079e55f3d37278147ca02fd52c083e2280697d99e72f60`.
No runtime, release, filing or model qualification is claimed.

Run `44251314094` at `32f623a8` subsequently stopped before browser cases:
the retained original-entry contract rejected the dependent
`cases.auditSha256`, which still described the audit before the fixture pin.
The original test reproduced RED locally. Refreshing that single digest to
the exact audited bytes makes all 35 retained timing controls and both fixture
controls pass. An exact byte inverse verifies every other cases byte is
unchanged; no test, budget, collection or deadline changes. Spec and inventory
checks pass. JavaScript lint passes without warnings; JSON is parsed and checked
separately because ESLint does not configure JSON. The failed run stays failed.
Root receipt: `8c0919fb1c8c4964bf609d58e75f19f8005f98f0d4aa8470e07637c575906392`.
Independent exact-source RED/GREEN review passes: `5f426061115bba8d2e7890ec5755c2d4bd46940c0ac35ee81bf9a825e06e44ed`.
Actual browser outcome remains pending a source-bound run.
