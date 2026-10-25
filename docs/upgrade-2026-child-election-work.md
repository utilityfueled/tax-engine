# Actual Form 8814 election eligibility

Implementation in progress for historical2025 and the isolated2026 candidate.
No filing, year-readiness or independent human-review gate is enabled.

Sources refreshed2026-10-25:

- [Final2025 Form8814 instructions](https://www.irs.gov/instructions/i8814):
  child age/student, return/payment restrictions and eligible parent selection.
- [IRC1(g)(5)/(7)](https://uscode.house.gov/us/usc/119-118/t26/s1/):
  strict income limits, parent selection and the elected AMT preference.
- [RevProc2025-32 section3.03](https://www.irs.gov/irb/2025-45_IRB):
 2026 election income strictly above1350 and below13500.
- [Historical2010 Pub17](https://www.irs.gov/pub/irs-prior/p17--2010.pdf),
  David/Linda/Philip parent-selection example, corroborates comparing taxable
  income before including the elected child's income. Only that comparison
  method is used; its historical dollar thresholds are not used.

The source validator runs before all elected income and child-AMT transfers.
It requires actual year, child identity, age/student sources, complete income
boxes, return/payment facts, parent selection and affirmative election intent.
An omitted box remains unknown after schema parsing and reparsing; actual zero
remains zero. A child need not be claimed as a dependent, but any matching
dependent identity must agree. Duplicate children and parent identities reject.

Parents filing separately use actual completed taxable-income comparison
worksheets excluding elected child income. The current-parent worksheet must
match this same canonical return recalculated with all child elections removed.
Any claimed child elected excess is restored to the dependent PTC income
aggregate, and the parent MAGI is derived again from its actual sources. The
source records cannot override calculated taxable income. Custody and the separate considered-
unmarried determination require actual confirmations. Remarriage substitutes
the stepparent; the detailed instructions apply custody rules when never-married
parents did not live together all year. No winner is inferred from a tie.

Planned timely filing is recorded separately from a timely election already
filed. Neither prepares or submits an actual filing. The numerical Form8814
helper remains available for mathematical comparison, but its income-only
result cannot establish election eligibility for the canonical parent return.

The canonical baseline tree5c5f0e4 accepted an election with wholly missing
eligibility facts. The expected rejection failed before the new helper in
`form8814-election-canonical-baseline-red.log`. Spec-linked helper tests were
written first; source cases and the considered-unmarried branch were red before
implementation. The independent agent review reproduced a false positive using a supplied
parent comparison100000 instead of canonical69250. A new failing test preceded
the source-binding fix, and all7 eligibility cases now pass, including an
actual Marketplace household whose income stays24000 after the comparison
calculation. Root types pass. Exact package and adjacent verification follows
separately; independent agent review is not human qualification.

Existing valid synthetic fixtures now state their actual synthetic election
facts without changing numerical expectations. The former below-threshold
packet fixture now requires rejection before any file is written; pure
numerical threshold tests retain their previous expected values. Child SSNs
remain in original complete sources, are removed by render-copy redaction and
never enter numeric audit descriptions.

Separate remaining work: actual guided election controls; Alaska dividend,
special capital-distribution and foreign-account source handoffs; final physical
forms and independent human tax qualification. This eligibility package does
not claim those methods or evidence exist.

## Package verification

Exact isolated source tree `667f1f85c662dde5fc40117adac7edaa2e9968fa`
(base `242e3ea`) passed the complete `pnpm test --maxWorkers=1`: **17,241
checks in775files**,342.42seconds, with disposable PostgreSQL and real pypdf.
No skipped-test substitution was used. Root types and4098spec references pass;
scoped lint has zero errors and52non-null warnings in source fixtures/tests.
The second independent agent review reran all7eligibility cases and found no
additional actionable issue. This is bounded agent review, not human tax
qualification. These checks precede later passive-loss changes and are not
claimed as final integrated release evidence.

Evidence in ignored `.local/upgrade-evidence/`:
- `child-election-full-unit.log` SHA256 `d154d028d3edb3887af0b6dd77833b9e381785854b5f2564829a8a8b7b0a4b23`.
- `child-election-final-types.log` SHA256 `32d1c9383c008856c8350be3bb50babdf5bbf1c5461b5278f638a8f035b721c8`.
- `child-election-final-spec.log` SHA256 `8ebfa6b61cbbec5230669b249dce57ed38c9f130b75c5acbe042423eb76d1f69`.
- `child-election-final-lint.log` SHA256 `7f59c04c5eb578cfb97d5773b4c23a6e35e4e39dc3c32518d2dc92af5e3a083e`.
- `federal-review-8814-comparison-green.log` SHA256 `13ad0e2cfd8ea15595b5535a886294ae9c32baa40fbf5ab227a5ae813880ec71`.
