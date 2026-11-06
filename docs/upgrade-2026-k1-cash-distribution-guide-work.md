# Actual K-1 cash distribution intake

This separate collector exposes the investment-only original attachment in
be0b6be. It collects cash, original box/code, source year, actual acquisition and
distribution dates, holding/character/exclusion answers and exact Form6198
source/item references beside the existing K-1. The original K-1, basis and
completed Form6198 records must still reconcile. No calculated gain, allowance,
basis recovery or deduction override is entered.

Adding a record starts empty. Blank, false and zero remain distinct, hidden
entity-specific values are retained, and substantive edits revoke outer and
nested confirmations. Removing the attachment preserves original cash/history
and therefore still rejects an unsupported positive gain. Existing known-zero
sources are unchanged. Actual personal and confirmed EIC residency/election
answers reach the same source validator without creating EIC facts.

The new spec preceded a missing-helper and missing-real-control red. Four
helper/canonical/DOM tests, the 461-test/five-file adjacent collector and strict
spec cohort, root and web types, 5,217 spec references and scoped lint (zero
errors, 14 test-only non-null warnings) pass on the development source. The
immutable d0efc377 tree on 848e1fc passes 474 tests in eight files, root types,
5,224 spec references and a production build. The reference count includes the
parent's newly committed royalty entries; the earlier 5,217 count is the
development base, not omitted tests.

Both desktop (1280px, partnership) and mobile (390px, S corporation) production
browser cases pass with zero retries against that identical production bundle.
The tests prove original31.00 cash/30.00 basis gives AGI100001, then actual1030.25
cash and matching Form6198 facts give reported AGI101000 after reconfirmation.
They also prove changed source references block, false/unknown survives reload,
private source strings are absent from posted data, and neither viewport
overflows. Screenshots were inspected. Two earlier test-only failures expected
unformatted strings; CurrencyField intentionally retains comma formatting in
both its display and saved editable source. The corrected assertions require
the actual strings while the normalization/canonical assertions remain exact.
No product code changed in those browser repairs.

Evidence is retained under `.local/upgrade-evidence/k1-cash-distribution-guide-*`:
red/green, adjacent, exact-tests/types/spec, build, lint, browser-display-red,
browser-corrected-display and browser-green logs, plus desktop/mobile images.
Independent federal-agent review of frozen 5a23077d verified all 11 hashes and
passed nine tests in three files: the four package cases plus five independent
controls for exact normalization, two original statements and reordering,
owner-specific residency/elections, household-edit confirmation invalidation,
and the holding anniversary. The review used a separate clone; its private
probes are not in this package. Final browser-tree checks passed 456 cases in
three files, web types and 5,224 spec references. Evidence: federal-distribution-
guide-review.log and its snapshot manifest. This is agent source/software
review, not human tax qualification.

Final integration on bc5c837 preserves every reviewed product/spec/test blob.
The exact 0b6d98ba candidate on bc5c837 passes 469 tests in six files, root
and web typechecks, and 5,239 spec references. This final cohort is the six
affected source/DOM/core/strict-reference files; the earlier 474/eight-file
cohort additionally included the core source/PDF paths and remains separately
recorded above. No failed or skipped case was omitted. Only this evidence text
changed after final checks. Broader
business/passive, mixed-block, special distribution and foreign-treatment
methods retain their explicit boundaries; no year or filing gate changes.
