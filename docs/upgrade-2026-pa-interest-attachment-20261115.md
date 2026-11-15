# Final 2025 Pennsylvania interest attachment rule

The final year-specific PA-40 Schedule A requires a resident or part-year
resident attachment when an adjustment line applies. Ordinary interest alone
has no $2,500 attachment threshold. Nonresidents do not submit this schedule.
Rendering and readiness now use the same predicate; ordinary interest of
$2,501, $3,000 or $999,999 cannot create a false missing attachment.

Source: [official final 2025 form and instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40a.pdf),
PDF pages 1 and 3, retrieved November 15, 2026. Five-page SHA-256:
`dd32da96a856d033725e772c9a7dc4339131b4abe776e4caa4e7de722c0cbfce`.
Separate spouse/joint ownership requirements remain distinct.

Spec first, actual predecessor failures and implementation are retained in
private evidence `nov15-pa-schedule-a-source-candidate`: the initial trigger
suite failed four cases and the subsequent nonresident case failed once.
Final author checks passed 50 tests; separate engineering review passed 55
including five independently authored complete-source residency/packet cases.
The reviewer retained and corrected its own incomplete-fixture failures.
Main adoption passed 43 tests in three selected suites, TypeScript, all 9,223
spec references and scoped lint (zero errors, three unchanged warnings).
The seven adopted files exactly match source freeze
`a462e842d58c816ac7b81f08996ff8ad853f348bc96fd2a473dd6a84cee0c5bc`;
independent review receipt:
`533686657659e3a02e8a0f13d2bb5770638ed839858585d368c05ebf87ecf46a`.

This corrects reference-summary inclusion and disclosures. The physical
Schedule A mapping, human review, final 2026 qualification and filing gates
remain separate. The existing closed filing gate is unchanged. The a32 runtime
rehearsals exclude this later source change; combined verification follows.
