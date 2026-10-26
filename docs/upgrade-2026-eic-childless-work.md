# Actual EIC dependency, qualifying-child and main-home sources

The initial claimant correction left dependency and main-home eligibility
separate. This package consumes each relevant filer's actual answers under
Publication 596 Rules 10 and 12–14. Both joint filers must satisfy the relevant requirements;
the either-spouse age rule does not replace either filer's own source facts.

Official sources refreshed October 26, 2026 UTC:

- [Final 2025 Publication 596](https://www.irs.gov/publications/p596), Rules
  10 and 12–14: dependency, another taxpayer's qualifying child, and the U.S. main-home
  requirement, including the narrow filing exception and military definition.
- [26 USC 32](https://uscode.house.gov/us/usc/119-118/t26/s32/),
  (c)(1)(A)(ii)(I)/(III), (B), (4), and (e).
- [Publication 559](https://www.irs.gov/publications/p559), final-return EIC;
  [26 USC 443](https://uscode.house.gov/us/usc/119-118/t26/s443/) and
  [Reg. 1.443-1](https://www.ecfr.gov/current/title-26/section-1.443-1),
  actual decedent short-year source context. No fixed day count or joint
  decedent-period calculation is inferred from these records.

The canonical helper reuses actual standard-deduction dependency answers. A
known claimable dependent receives no childless EIC unless the supplied
Rule 12 exception establishes that all potential claimants were not required
to file and did not file or filed solely for withholding/estimated-tax refunds.
The separate qualifying-child answer applies the Rules 10/13 filing exception;
dependency alone cannot establish it. The main-home answer uses the actual
applicable taxable year and source evidence, rather than general residency
months or an assumed 183 days. Counting foreign military duty requires the
actual qualifying order and its source reference; no minimum actual service
period is invented.

The optional packet preserves old saved records and unknown booleans. Actual
packets and potential positive 2026 claims need complete applicable answers;
source-free 2025 inputs remain explicitly unverified. A known dependent
restriction still applies to a historical packet omission. The guide forwards
actual answers, preserves false and unknown, and revokes confirmation on nested
source or household edits. Main-home controls are shown for the childless route;
the qualifying-child-of-another question is shown for every relevant claimant,
including a filer with an EIC qualifying child of their own. Its earlier nested
source spelling remains preserved and reconciled; an explicitly cleared new
answer cannot restore a stale old answer.
retained source records are not rewritten when a different route is selected.

Spec-first evidence is private in
`/private/tmp/tax-release-prereq-review-UEk43F/eic-childless-red.log`
(four original core failures) and `eic-childless-guide-red.log` (two missing
source-handoff/control failures). The corrected focused cohort passes 20 tests
across seven files. Six explicit source fixtures initially lacked the new
answers; they now supply actual synthetic answers, with no production defaults
or weakened assertions. Root/web types and scoped lint pass. The literal
positive controls remain the existing 2025 plateau 649 and indexed isolated
2026 plateau 664; negative actual dependency/qualifying-child/home facts yield
zero. Formula/table arithmetic is owned by a separate correction.

Full 2026 and filing qualification remain closed. This is source/software work,
not independent human tax or form qualification. Other qualifying-child,
income/table and recertification methods remain separate from this source slice.
Final immutable checks, independent review and browser evidence follow below.

The initial frozen childless tree `cb174a4f` passed 18,089 tests across 1,044
files, 5,022 strict references, root/web types, production build and four
desktop/mobile source/persistence/privacy cases. That freeze is retained as
evidence, not replaced or presented as the final revised package. A subsequent
Rule 10 probe demonstrated an actual defect: a known qualifying child of another
taxpayer with their own child and $10,000 earned income received $3,400 rather
than zero. The spec-linked permanent regression reproduced that result before
the shared claimant validator was corrected. Two additional red guide/DOM cases
showed the missing general source forwarding and unreachable control. The
revised package changes only claimant sources and controls; the EIC arithmetic
module and federal call sites remain untouched. Evidence is retained in
`eic-rule10-private-red.log`, `eic-rule10-permanent-red.log` and
`eic-rule10-guide-red.log` in the same private evidence directory.

The revised immutable tree `240617f45d9e2d8a6dfa693e1eaf5be4acab3b09`
passed 18,111 tests across 1,052 files (33 existing skipped tests), all 5,044
strict spec references, root/web types, scoped lint, and the production web
build. Four production browser cases passed with no retries, covering both
desktop/mobile claimant and childless source persistence and local privacy;
both new screenshots were inspected for readable controls and overflow.
The independent federal agent refreshed Pub596 Rules 10 and 12–14 and Pub559,
verified all 16 owned file hashes, and passed 23 tests across six files,
including five additional private joint, deceased-year, unknown-source and
confirmation controls. No actionable finding remained in this bounded review.
Its probes remain outside the product tree. The final integration preserves
the reviewed executable/spec/test blobs on base `0229ea5`; only this evidence
appendix differs. Rule-pack versions are 2025.108 and 2026.105. Physical 2025
Form1040 line 27c follow-through is a separately reviewed PDF package.
Final integration on `0229ea5` also passed 28 source/guide/strict-reference
tests plus three rule-pack tests, root types and all 5,044 spec references.
