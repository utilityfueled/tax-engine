# Actual parent private-activity-bond preferences

Source implementation for historical 2025 and the isolated 2026 candidate.
No filing, year-readiness or human-review gate is enabled by this package.

## Sources refreshed 2026-10-25

- [Form 6251 instructions](https://www.irs.gov/instructions/i6251), final 2025,
  line 2g: actual specified private-activity interest and otherwise allowable
  deductions, statutory exceptions and elected child preferences.
- [Form 1099-INT instructions](https://www.irs.gov/instructions/i1099int),
  January 2024 continuous-use revision, boxes 8, 9 and 13: included preference
  and potential already-net premium reporting.
- [Form 1099-DIV instructions](https://www.irs.gov/instructions/i1099div),
  January 2024 continuous-use revision, boxes 12 and 13: included preference
  and fund expenses already reflected in the reported box.
- [IRC 57(a)(5)(A)-(B)](https://uscode.house.gov/us/usc/119-118/t26/s57/):
  parent interest preference reduced by otherwise allowable deductions.

## Core change and evidence

The spec precedes the failing canonical/PDF tests and Decimal implementation.
Actual INT9/DIV13 values flow to the AMT calculation without being counted again
in regular exempt income. Positive exempt income requires its actual preference
box, including established zero. Positive preferences require the actual return
year, owner, source identity, recipient confirmation and actual deduction amount.
Positive deductions require an allowance worksheet and confirmation against
duplicate deductions, including amounts already reflected in fund/OID or other
AMT worksheets. Identity checks reject duplicate INT/DIV/OID/child records.

Independent agent review found a per-statement flooring error: splitting the
same parent's interest 200 and deduction 200 across two statements produced
100 instead of zero. The spec was corrected before adding the failing split/
combined regression (`parent-pab-aggregation-red.log`). The corrected method
combines signed INT/DIV preferences and already-reconciled OID preferences before
one parent floor. Instrument premium adjustments remain in the OID calculation;
child preferences remain separately calculated for each child. Canonical tests
exercise both years and a mixed OID/INT/DIV deduction; the physical 2025 review
field is checked with pdf-lib.

Existing synthetic test statements now explicitly state established zero exempt
and preference boxes where their old fixtures omitted them. Existing monetary
amounts and expected-result assertions are unchanged. This makes their facts
complete without relaxing the production unknown-fact guard.

Immutable core tree `5c5f0e43a0dc6664e0af3ecaafc446593deef9aa`, based on
`c21b6ae`, passes all **17,201 tests across 764 files** in 364.77 seconds with
one worker, actual disposable PostgreSQL16 and pinned pypdf. Root types and
all 4,058 spec references pass. Scoped lint reports zero errors and 496 warnings
across the changed legacy fixtures and source tests; no lint rules changed.
Independent AI-agent source re-review passes five pure/canonical/reopened-PDF
checks with no remaining actionable finding.

The earlier diagnostic runs caught four incomplete PDF fixtures and an existing
guided adapter that dropped explicit zero preference boxes. Those fixtures now
supply their actual zero facts, and forwarding of the already-collected INT9/
DIV13 boxes is included in this core commit. All 32 affected Ohio/PDF cases pass
on the final isolated tree; their expected calculations and readiness assertions
were retained. The separate richer preference intake remains its own package.
Initial red evidence is `parent-pab-red.log`; aggregation red and focused green
evidence are `parent-pab-aggregation-red.log` and
`parent-pab-aggregation-green.log` under `.local/upgrade-evidence/`.

## Separate intake package

The guided source worksheet collects actual preference year/identity, recipient
confirmation and deduction allowance evidence. Edits invalidate confirmations;
unknown amounts, duplicate sources and unsupported premium methods stay blocked.
The intake and DOM regression are a separate reviewable change. Final 2026 form
qualification and independent human tax review remain external gates.

Final full-unit log SHA256: `53579ef4e84a2e27bce1e8d31288ec4a6a18bd2148d8a2494ec587d2a0281d20`.
