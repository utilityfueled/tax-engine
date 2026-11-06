# Child income character and parent transfers

Sources refreshed 2026-10-25: [Form8814 instructions](https://www.irs.gov/instructions/i8814), [Publication550](https://www.irs.gov/publications/p550), [Form8960 instructions](https://www.irs.gov/instructions/i8960), and [ScheduleD instructions](https://www.irs.gov/instructions/i1040sd). The actual child source distinguishes Alaska Permanent Fund dividends and capital distribution classifications. Character amounts are subsets of the original child totals, and missing answers remain unknown. Guided explicit negative answers supply known zero; positive source collection remains the next intake package.

The spec and failing tests preceded calculation changes. The IRS 4,000-interest/2,000-Alaska example produces 3,300 parent income, 1,100 allocated Alaska income and 2,200 investment income. Form8960line7 now includes the investment portion once. Child capital distributions enter ScheduleD before the parent's loss limit and carryforward: a 3,300 child distribution with a 10,000 parent short-term loss produces a 3,000 deduction and 3,700 remaining loss. Previously the return incorrectly added the child amount after applying the loss limit.

ScheduleDline13 now records actual parent and child distributions, with the existing QSBS exclusion retained as a separate adjustment. A saved two-page synthetic review PDF contains 3,800 distributions, 6,200 net loss and 3,000 deduction. Both page notices remain visible. Field values were reopened with pypdf and both pages visually inspected. This bounded mapping proof does not qualify ScheduleD: inspection separately exposed its existing hardcoded QOF-disposition checkbox and missing carryover line details, assigned to the next mapping package.

Special child gain fractions are computed from the actual source, but canonical positive collectibles/1250 results remain blocked until the completed ScheduleD18/19 netting method is available. Positive1202 requires its acquisition/issuer method. These are internal implementation tasks. Child4952 completed-source binding, positive character intake, foreign-account/trust disclosure and the existing ratio-rounding audit remain immediate follow-ups. Independent human review, final-year mapping qualification and filing gates remain unchanged.

Validation used the immutable tree `67523f93c8d91150a4d11818c003268d9f4c1eba`
on base `65336f7274dfefe580493c04dfdeee9a7d2e6ebd`. All17,326tests in797files
pass with one worker, configured synthetic PostgreSQL and the documented pypdf
runtime. Root, web and contracts typechecks pass; all4,184spec references pass.
Scoped lint reports zero errors and18warnings (17existing assertions/unused
variable and one new test assertion). The earlier full diagnostic found four
unconditional child-audit wording regressions and an obsolete Line13QSBS label;
the final run includes their corrections without changing calculated expectations.

Independent agent review passes70cases and reports no scoped finding. This is
code review evidence, not independent human tax qualification. Logs are under
`.local/upgrade-evidence/child-character-final-{unit,types,spec,lint}.log` and
`agent-child-income-character-review.log`. The actual two-page artifact is
`child-capital-render/schedule-d.pdf`; each saved page was rendered and inspected,
and pypdf reopening confirms its four distribution/loss fields and two review
notices. Rule metadata advances to2025.49/2026.45-law-integration-draft while
incomplete/review-pending status and filing gates remain closed.
