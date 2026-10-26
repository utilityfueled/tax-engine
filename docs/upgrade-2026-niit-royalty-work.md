# Portfolio royalties and net investment income tax

The Form 8960 return adapter reconstructed line 4c from the passive activity
pool alone. That removed portfolio royalties with the excluded active business
income, even though the royalties remain investment income. For a single filer
with $200,000 wages and $12,000 portfolio royalties, the previous return reported
zero NIIT; the corrected represented-source calculation reports $456.

Official sources refreshed October 26, 2026:

- [Form 8960 instructions](https://www.irs.gov/instructions/i8960), lines 4a–4b:
  completed Schedule 1 lines 3, 5 and 6 enter line 4a; only excepted income is
  removed on line 4b. Portfolio royalties do not become excepted income merely
  because they are outside the section 469 passive pool.
- [Schedule E instructions](https://www.irs.gov/instructions/i1040se), line 4:
  portfolio royalty sources enter Part I. Self-employed business royalties
  require their distinct business treatment.

The adapter retains the completed Schedule E royalty component once alongside
allowed passive income. It preserves suspended losses, excludes active ordinary
business income and keeps cents until final tax rounding. This is a correction
for represented sources, not a new assumption that unknown royalty expenses are
zero. Actual royalty expense, business classification and personal-property
rental methods remain unfinished; their readiness gates are unchanged.

The spec was written before four new failing calculation/PDF cases. All four
reproduced the omitted royalty component. The saved-field expectation was also
aligned with the existing parenthesized negative-number format; the original
failure log is retained. The correction passes 210 tests across 13 files,
including both entity types and ordinary activity classes, suspended/allowed
losses, original-input immutability, the MAGI cent boundary and reopened PDF
fields. Root types and 5,184 spec references pass; scoped lint has zero errors
and four preexisting federal non-null warnings.

Logs are local `niit-royalty-red.log`, `niit-royalty-green.log`,
`niit-royalty-types.log`, `niit-royalty-spec.log` and `niit-royalty-lint.log` under
`.local/upgrade-evidence/`. Independent software review verified all six owned hashes and passes seven tests
across three files, including three separately authored controls for active loss,
split/reordered source cents and PTP separation. The reviewer saved, reopened and
visually checked the Form 8960 with blank SSN and review notice; parent inspected
the saved rendering. Evidence is in `ai-niit-royalty-review-snapshot.json`,
`ai-niit-royalty-review-green.log` and `ai-niit-royalty-render/`. The reviewer
corrected only an initial leading-zero input typo; the failed probe is retained.
The final checkout integration passes 26 tests across six files, including the
current Marketplace and rule-pack controls. The five reviewed source/spec/test
blobs are unchanged; only this evidence and metadata .123/.120 were updated. No independent human review, final 2026 form qualification or
release readiness is claimed.
