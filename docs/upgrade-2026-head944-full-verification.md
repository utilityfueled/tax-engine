# Full verification at 944eb778

The complete local coverage run used the pinned Node 24.22.1 toolchain and
unchanged coverage configuration at commit
`944eb778ecadb0aebd70c033fe38faebbf077045`. Its nonzero result remains a release
blocker; focused package checks do not replace this run.

Command: `pnpm test:coverage --coverage.reportOnFailure --reporter=json` with
the full JSON saved under `.local/upgrade-evidence/nov03-head944-coverage/`.
The run completed with 22,132 passes, eight failures and 33 pending tests.
Branches reached 86.79%, exceeding the required 85%. Functions reached 87.88%,
below the existing 90% gate. Statements were 90.92%; lines were 94.18%.
No thresholds or coverage exclusions changed.

The eight failures are the business withholding positive, OID positive,
joint retirement positive, two state-routing positives, unemployment
withholding positive, its imported claim-of-right duplicate, and the saved
royalty review-PDF flow. Preserve the original assertions and exact source
amounts while resolving them. The government unemployment case still needs
controlling payment classification and qualified tax review; it is not
evidence that an erroneous agency amount qualifies as PA-40 withholding.

The 33 pending tests require an isolated PostgreSQL database: ten AI-ledger,
seven database-outage, seven metadata-migration, four workspace-persistence
and five recovery tests. Pending tests establish no hosted qualification.

The full log SHA-256 is
`c655f43cc81200a470128e91e1ab1cceb65fabd4cde346e2c18899beea6aa789`.
`summary.json`, the original test-result JSON, `coverage/coverage-final.json`
and the per-file missing-function inventory are retained locally. Additional
native integration tests must exercise real source collection, invalidation,
unknown values, recovery and calculation boundaries; coverage alone is not
their correctness oracle.

The matching Vercel Preview is metadata-READY at
`https://tax-engine-2c5j5aez3-utility-fueled-llc.vercel.app`, deployment
`dpl_4DAYuTXRgqVyorDeMMZVWYDBzsj4`. CI run 41594318930 and Web run
41594318912 were still running when refreshed. A READY preview does not prove
SMTP delivery, recovery, account isolation, live billing, human review or
release readiness. Production, filing and model promotion remain disabled.
