# Fixture-defined NEW212 browser controls — November 16, 2026

The initial NEW212 field-entry helper now uses explicit native control kinds from
the existing fixture and current Ohio components. All 181 initial values and their
order are preserved: 130 fill/Tab pairs and 51 selects. Three later edits retain
their existing dynamic control discovery. Strict label/native actions still
reject missing, duplicate, wrong-kind and unknown controls. No calculation or
product code changes.

The spec and failing test preceded implementation. Three permanent component and
source-contract tests pass; 967 focused/reference tests and 180 finite-dependency,
CPU and native-control checks pass. Actual desktop/mobile DOM replay preserves
all 181 values and 376 events per case; six negative cases reject without later
actions. The first private replay failed a guessed event-count assertion after
full-array equality passed. Its fresh successor corrected only that private count
assertion and passed all eight cases. Both original managed production browser
journeys pass in 19.3 seconds with normal cleanup, strict 30-second deadlines and
zero retries. These results establish protocol parity, not application speed or
remote readiness.

Normal web types, lint, spec validation and deterministic inventory checks pass.
All 655 browser identities, five original skips, fourteen diagnostic targets,
eight rate windows and the two-worker ceiling are preserved. Generated metadata
changes only the required source hashes, one helper in the dependency closure
(1,999 to 2,000 files) and inventory.

The preceding pushed revision `9b946adf` passed all twelve local checks:
28,934 tests in 2,124 files in each unit/coverage lane; coverage 92.04% statements,
88.20% branches, 91.09% functions and 95.31% lines; 650 browser passes and five
original skips. That does not qualify this new revision; its complete checks
follow this commit. Current remote, native and signed-billing qualification remain
open, alongside the recorded human-review and final-form gates.

Evidence: source review `f417a7e6a8fb999cc0a65fed20c7f82c714393e37ce91be156b884048a55f058`;
actual DOM review `5150154629fe791d268e68caf711094b332708296fb1e1956dfd8fb355d3276a`;
managed application terminal session 27379, exit 0, chunk 99ea09. Private original
failures and their source captures remain retained. Filing and model promotion
remain disabled.
