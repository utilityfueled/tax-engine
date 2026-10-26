# Reuse the fixed synthetic evaluation corpus identity

The `456bd432` coverage job recorded a failure in the repeated model-comparison
case after 11 seconds, before cancellation prevented final error details. A
local instrumented run showed 272 corpus-hash calls in that case: the synthetic
entry helper recomputed the same unchanged 240-case corpus for every entry.

The test now computes that fixture identity once at module setup. Each entry
still computes its own fixture digest. Production validation and report code,
all 23 test cases, assertions, deadlines and coverage thresholds are unchanged.
This is synthetic test preparation; it supplies no provider, human-review or
promotion evidence.

Baseline and candidate instrumented runs each pass 23 tests. All twelve report
input, output and rejection fingerprints match. Corpus hashing in the repeated
case drops from 272 calls to two production validation calls; its observed local
duration drops from 3,247ms to 285ms. These are local diagnostic observations,
not a service benchmark. Both selected instrumented commands retain full-project
coverage collection and exit below the unchanged global thresholds.

The normal candidate cohort passes 35 tests in three files with one worker.
Focused lint has zero errors and 23 existing non-null assertion warnings.
An independent reviewer runs all 23 original cases in a separate copy with the
entire imported corpus deeply frozen and checks its complete JSON and digest
afterward. Those checks pass. The reviewer also verifies every report fingerprint
and unchanged production modules. The initial missing-Python prerequisite attempt
is retained separately; no tests ran in that attempt.

`eval-fixture-reuse-verification.json` and the independent report under local
upgrade evidence retain exact hashes and commands. The remote failure remains
historical evidence; a completed integrated and remote coverage run is still due.
