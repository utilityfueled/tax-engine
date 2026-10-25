# Form revisions and export qualification

## Physical year separation, 2026-10-24

The 41 existing PDF templates now live in `forms/blank/2025/`; their 90 mapping
modules live in `src/pdf/mappings/2025/`. Existing module entry points re-export
these historical implementations for API compatibility. The calculation-year
check precedes disk access in direct mappings that accept a full return.

The review template manifest pins every existing file by SHA-256. A changed or
unregistered template fails before filling. These hashes establish byte identity,
not that the underlying IRS/state revision was reviewed. Every manifest entry
remains `unreviewed-legacy-snapshot`; the 2025 pack remains `legacy-review-only`
with `filingQualified: false`. No template is registered for 2026. There is no
fallback from an unknown, incomplete or mismatched year to 2025.

The return coordinator resolves the explicit year directory from its template
root. Web template discovery and container asset checks follow the same layout.
Test fixture paths changed with the physical move; tax expectations did not.
Tests that supplied incomplete hand-built return objects now state their actual
2025 year, so a missing year cannot bypass the export gate.

Validation: the registry regression first failed because the registry module did
not exist. It now checks every template, tampering, unknown names/years, and a
direct schedule with mismatched years. All 903 PDF tests in 85 files pass through
`pnpm test tests/pdf` with the configured Python/pypdf environment. Root build,
root/web typechecks and scoped ESLint pass (existing lint warnings remain).
The inventory check identifies stale generated spec metadata from concurrently
added tax specs; refresh it after those packages close. It is still a required
global gate. This package changes no template bytes or mapped tax-line values.

## Remaining qualification

- Reject missing or wrong-type mapped fields instead of silently discarding data.
- Reopen and inspect canonical field values and rendered appearances, including
  independent final-revision review for every enabled scenario.
- Add the complete-data filing artifact separately from review downloads and
  encrypted recovery archives, retaining qualification and readiness gates.
- Register final official 2026 templates only with source/revision and independent
  mapping evidence. Physical year separation does not satisfy that review.
- Demand-selected state qualification and published support must agree with the
  actual year, residency, scenario and output capabilities.

## Exact mapped writes

Shared PDF field setters now reject absent fields and wrong field types, including
empty writes. Empty text and false checkboxes explicitly clear previous values.
Two regressions first failed against the old silent behavior; all 905 PDF tests
then passed. This validates write behavior, not the semantic location of a field.
Inspection of the official 2025 Form 1040 revealed existing field names pointing
to the wrong printed lines and transposed dependent entries. Correcting those
locations with independent source-position assertions is a separate package.

## Historical 1040 semantic correction

Source refreshed: [official 2025 Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf),
created September 5, 2025, retrieved October 24, 2026. Its printed line locations
and widget rectangles revealed the old map used incorrect line offsets after
1h, prior-layout deduction/tax coordinates, the wrong filing-status boxes, and
transposed dependent rows/columns. QSS now has its own checkbox. Credits use the
credit row, not the dependent residency row. Page 2 repeats AGI correctly.

The map now takes final audited tax lines rather than recomputing taxes, includes
Schedule 1-A in deductions, and distinguishes other refundable payments (32),
total payments (33), overpayment (34), and refund (35a). Missing required audited
tax lines fail. Engine integration corrections for payment/credit components and
penalties are tracked separately in the federal package.

Three independent source-location tests failed before the correction; the whole
PDF suite then passed 908 tests. A further missing-audit regression and widget
appearance-state checks were added. The synthetic $150,000 single-W-2 example
uses independently derived $25,067 tax and $4,933 refund. Both saved pages were
rendered and visually inspected; text, canonical values and selected checkbox
appearance agree. Synthetic output and PNGs are local ignored evidence under
`.local/upgrade-evidence/1040-synthetic-review*`. A local fontconfig/cache was
needed by the bundled renderer. No taxpayer data or external service was used.

This is a correction to the historical review map, not final-form qualification.
Independent review, remaining field/fact coverage and final 2026 forms are still
required before any filing artifact can be enabled.
