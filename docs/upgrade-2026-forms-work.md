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
