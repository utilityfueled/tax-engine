# Actual Ohio exempt-interest sources

The Ohio interview now collects an actual year-specific issuer-allocation
worksheet for federal tax-exempt interest, including exempt dividends and net
OID. It preserves unknown fields and explicit zero, checks exact Decimal totals
against current sources, and clears confirmation when investments change.
Missing Ohio facts leave the federal preview available and the Ohio preview
unavailable. Preview and review-download paths use the same allocation helper.

The actual non-Ohio state/local portion enters the Ohio addition once. An actual
federally exempt but Ohio-taxable federal/territory portion enters the existing
other-additions aggregate. Ohio and legally exempt other portions produce no
addition. The core Ohio adapter now also requires an explicit issuer allocation
for positive federal exempt interest from INT, DIV and passthrough sources;
the existing verified OID gate remains. An explicit core non-Ohio allocation
continues to be an input supplied by the caller; the guided path additionally
reconciles the complete source worksheet.

Official sources refreshed 2026-10-25:

- [ORC 5747.01](https://codes.ohio.gov/ohio-revised-code/section-5747.01),
  effective March 5, 2026, subsections (A)(1)-(3).
- [Final 2025 Ohio IT1040 instructions](https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf),
  Schedule of Adjustments lines 1 and 10. This is not final 2026 form qualification.

The spec was written first in `spec/state/guided-ohio-interest.yaml`.
Five failing regressions demonstrated the missing source collection, source
confirmation, overlay and core INT/DIV gate. A sixth source-reconciliation
assertion failed before validation began comparing current source totals.
All 119 focused tests in five files subsequently passed, including DOM controls
and existing Ohio adapter/OID coverage. Root types passed. Logs:
`.local/upgrade-evidence/ohio-interest-{red,reconciliation-red,focused}.log`
and `ohio-interest-working-types.log`.

Isolated staged tree `c308df5e54e906014c8b6462809529bcfc3ebf76` passed 1,326
guided, Ohio core and workspace-download tests across 60 files. A subsequent
type-safe guard and test cleanup was verified at tree
`aab7681256185066e06f7a004fd54e1d227ecab8`: 18 focused/DOM/Ohio-reference-PDF
tests, root and web types, and all 3,628 spec references pass. Scoped lint has
zero errors and two pre-existing Ohio adapter warnings. Evidence is in
`ohio-interest-staged-tests.log`, `ohio-interest-staged-final-smoke.log` and
`ohio-interest-staged-final-lint.log`; the type/spec command outputs are retained
in the task transcript. Independent agent review is pending; no human review
is claimed.

Final 2026 forms, filing readiness, launch-state demand and professional
qualification remain gated. This package adds source fidelity; it does not
qualify the Ohio return or publish a release.
