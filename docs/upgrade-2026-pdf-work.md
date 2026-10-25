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
