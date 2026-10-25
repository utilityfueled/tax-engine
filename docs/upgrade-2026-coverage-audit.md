# Integrated coverage follow-up, October 25

The immutable `e8e169a39a4917744c634378628f717af748759b` snapshot completed
16,889 tests across 699 files: 16,888 passed and one failed, with zero skips.
It ran in 486.06 seconds against the explicitly disposable local PostgreSQL
service. Coverage met all unchanged thresholds: branches 86.59%, functions
92.09%, statements 92.78%, and lines 94.48%. The overall command failed.
Evidence: `.local/upgrade-evidence/stable-coverage-e8e169a.log`.

The failure was the Schedule A audit-form whitelist. It omitted the actual
OID and educator expense worksheets already emitted by the source-backed
calculation. The assertion now accepts these two specific identities and also
requires exactly one zero-valued `ordinary-loss` and `itemized` entry for its
empty-source fixture. All prior audit assertions remain. No calculation,
threshold, exclusion or readiness gate changes. Bounded independent agent review
caught the second omitted worksheet after the first correction. This is code
review, not independent human tax qualification.

All 63 Schedule A edge cases pass on the isolated staged tree. This focused
repair does not establish that the current integrated full suite passes; another
complete run remains required after the in-progress source packages converge.
