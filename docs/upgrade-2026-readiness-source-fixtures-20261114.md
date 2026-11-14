# Preserve Form 982 readiness with actual sources

The frozen `8e7fd9a2` eight-worker unit and coverage runs each finish with 28,409
passes and two failures in `form982-readiness.test.ts`. Both failures use bare
bankruptcy claims now correctly rejected by the original-source guard. Unit
takes 360 seconds and coverage 489 seconds; both owned SCRAM PostgreSQL instances
stop normally and tracked source remains unchanged. Coverage is not a passing
gate on this revision. Its static lane passes all nine checks; browser continues
separately. Full failure evidence remains under `nov14-main-parallel-8e7fd9a2`.

The test-only correction uses complete mortgage originals for the third positive
readiness route, alongside actual NOL and later-attribute routes. Every existing
partial-packet, supported-calculation, filing-false, business-rule and exact
warning assertion remains. Actual zero mortgage exclusion, ordinary zero debt
without an affirmative claim and absent debt retain no Form 982 requirement.
An additional test explicitly rejects bare affirmative claims for both positive
and zero discharge. No application formula, readiness control or test threshold
changes.

The spec precedes the fixture correction. Twelve affected tests in three files
pass; an independent reviewer reruns all three readiness tests and validates
all 35 references in the affected spec, with no broken references. The review
also verifies both original full-run failures and preservation of the assertions.
Receipt `nov14-readiness-source-fixtures-independent/REVIEW.json` has SHA-256
`bc7579ff145a486a32619c667060f0db7fc421033730cedfdfb6a6ea4e2539a9`.

A fresh full unit and coverage run is still required on the combined successor.
Current mortgage and market-discount source/intake commits retain their own
separate evidence. All commits remain local under the main push hold.
