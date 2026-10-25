# Review and filing export work

## Audited credit mappings — 2026-10-25

Refreshed the official final 2025 [Schedule 3](https://www.irs.gov/pub/irs-pdf/f1040s3.pdf)
and [Schedule 8812](https://www.irs.gov/pub/irs-pdf/f1040s8.pdf). Schedule 3 line 7
contains only the other-credit subtotal, separately from line 8; extension
payments appear on line 10. The old mapping repeated the grand total on line 7
and omitted line 10. Both now copy the engine's audited lines.

Schedule 8812 now copies verified dependent counts, MAGI addbacks, actual credit
limits, earned income and payroll alternatives. It no longer recomputes these
from raw dependent flags, W-2 wages, a hardcoded refund cap or tax minus total
credits. Actual Puerto Rico residency controls the printed payroll branch.
Unknown legacy possession-income components stay blank; reserved line 15 stays
blank. Missing, duplicate or nonfinite required audit entries reject the export.

Three new mapping regressions failed before the correction. The final focused
run passed 39 tests, engine types and scoped lint. These checks establish mapping
agreement with audited results, not independent tax-law review or filing
qualification. Evidence: `.local/upgrade-evidence/credit-audit-pdf-{red,green,types}.log`.
Both years remain unavailable for filing; 2026 review mappings remain unavailable.

## Separate complete-data filing pipeline

`src/pdf/filing-return.ts` provides a distinct library pipeline that retains
complete identifiers, requires scenario-specific fact validation, recalculates
the return, and assembles only the scenario's complete, unique final-form list.
It checks year/rule-version parity, tax/security/release evidence, each mapping
review and the SHA-256 of every template before any renderer runs. Empty and
review-marked documents are rejected. It never falls back to a review mapping.

The compiled `QUALIFIED_FILING_SCENARIOS` registry is empty and frozen. No request,
environment variable, AI result or caller-supplied manifest can register a
scenario. Current rule packs independently block filing. The public review route
still rejects a filing purpose; no filing button or enabled endpoint is added.
Registering final forms, their complete-fact validators and dedicated renderers,
and connecting the qualified scenario to the public download flow require the
missing independent qualification and release authorization.

Twenty-seven focused pipeline/policy tests pass, plus engine types and scoped
lint. A mocked synthetic renderer exercises the future complete-data path and
failure cases; it is explicitly not an official form, tax calculation oracle or
independent review. The unmocked production-registry test proves both 2025 and
2026 filing requests remain unavailable. No usable filing packet is claimed.

## Education source mapping and complete-input review calculation

Official 2025 Form 8863 and its instructions were refreshed on 2026-10-24:
https://www.irs.gov/pub/irs-pdf/f8863.pdf and
https://www.irs.gov/instructions/i8863 (Parts I/II, credit-limit worksheet,
Part III lines 20–31). The spec contract preceded regression tests: eight
mapping assertions failed before replacement. The mapper now copies the
persisted audit, including actual MAGI/refundability/liability limits, requires
complete unique global audit lines and exact student-line counts, and preserves
unknown answers. Every actual AOC/LLC student gets a separate Part III; more
than two institutions get an extra page completed only through line 22. A
legacy unallocated LLC total is not assigned to an AOC student. This does not
qualify a legacy incomplete record or enable filing.

Seventy-six focused PDF, identifier and workspace download tests pass. Engine
and web types and spec validation pass; scoped lint has zero errors (existing
and fixture non-null warnings remain). A four-page synthetic packet was rendered
and all four pages visually inspected, including exact EIN digits, blank person
IDs, the separate LLC amount and institutional overflow with no duplicated
credit. Rendered local evidence: `.local/upgrade-evidence/education-review.pdf`.
The local review pipeline calculates with complete facts before clearing
structured person/payer identifiers from input and calculated state copies.
Decimal audit values and original records are preserved. Review filenames,
notices, no-store behavior and the empty filing qualification registry remain.
