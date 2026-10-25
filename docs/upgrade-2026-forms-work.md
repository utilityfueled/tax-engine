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

## Audit-source forwarding and omitted dependents

The historical 1040 map now consumes separate audited W-2, unreported-tip,
Form 8919 and other-wage lines, plus W-2/1099/other withholding. It no longer
copies all wages into line 1a or leaves withholding sources blank. Audited gross
overpayment (34) is separate from the refund after an estimated-tax penalty
(35a), and missing required source entries fail explicitly. More than four
dependents now requires an attachment map instead of silently truncating people.

Three new regressions first failed. The 31 focused 1040 mapping tests then pass,
including saved/reopened source sublines and a synthetic $1,000 gross overpayment,
$50 penalty and $950 refund. Root types and scoped lint pass. These changes use
the printed coordinates inspected in the preceding package; independent final
revision qualification and complete-data attachments remain open.

## Current official source availability — 2026-10-25

Refreshed all 37 federal blank-form endpoints represented by the historical
manifest. The [source register](upgrade-2026-form-source-refresh.json) records
the exact URL, retrieval time, SHA-256, printed year and creation date for each
response. Thirty-six endpoints still serve 2025; Form 4952 serves its final
2026 revision, created May 28, 2026. This describes those endpoint responses;
it is not proof that a different final/draft URL does not exist.

The 2026 Form 4952 has different first-page field names from the 2025 copy.
Its source and inspection map are a separate pending package. No changed or
newly available source is registered for export by this refresh. Existing 2025
assets retain their pinned bytes. Independent final mapping review and the
complete 2026 packet remain open. Raw downloaded responses and extraction
checks are local evidence in `.local/upgrade-evidence/form-sources-current/`.

## Visible review notices through every template and packet path — 2026-10-25

Registered templates now receive the visible review notice before a mapper can
return early. An unavailable mapping year fails before reading any supplied path;
the original exact-byte registry and filing restrictions remain enforced.
Document Subject metadata cannot establish that a notice is visible. Each
finalization replaces only the dedicated notice drawing stream, keeping one
notice on saved, reopened, appended and merged pages and preserving other page
content and form fields. This also preserves the existing merged-packet test's
strict one-notice-per-page assertion.

The regressions first reproduced missing notices, metadata suppression, path I/O
before the year gate and duplicate text after reload. The final focused run
passes18 tests, including all41 registered templates and14 workspace PDF cases.
Root types, all spec references and scoped lint pass. An independent agent
review found no actionable findings and reran the4 policy cases; this is not
human qualification. The final synthetic1040 plus appended-page PDF was saved,
reopened and rendered:3 pages,229 canonical fields,one extracted and visibly
rendered notice per page. Evidence is under `.local/upgrade-evidence/` with
`pdf-review-notice-*` and `review-policy-independent-ai-agent.log` names.

The immutable staged tree `95336b8bd2f664e17eb73ed247ada800f78b3ab2` passed the
entire configured PDF suite and workspace download tests (1,028 tests,98 files).
The log is `pdf-review-notice-staged-suite.log`.
The first direct Vitest PDF run used the wrong Python environment and failed;
the first configured suite caught the year-gate regression while it was being
fixed. Neither is a passing gate. No output was newly qualified for filing or
2026 export.

## Final 2026 Form 4952 physical candidate — 2026-10-25

The [official final form](https://www.irs.gov/pub/irs-pdf/f4952.pdf), created
May 28, 2026, was downloaded again and its SHA-256 remains
`90b9fc0bd6778983521b61ed5c94cc5668e62af858e38e94a1a6fd4b631bfb6d`.
Its four pages match the source already preserved under `forms/blank/2026/`
in `d1b26ef`. The
separate immutable candidate map identifies all 17 text fields, including the
nested line 4a widget and the changed, unpadded field names. It is not connected
to an application route, public filler, review registry or filing registry.
All current 2026 year and export restrictions remain unchanged.

The spec preceded a failed missing-module test. The three new tests now pass,
and the expanded 2025/2026 mapping and review-notice suite passes 63 checks.
Root types and scoped lint pass. Independently inspected printed rectangles
check each mapping. A synthetic worksheet proof was saved and reopened; pypdf
independently verified all 17 canonical values against the page widgets and
nonempty appearances, with one review notice on each of four pages. All four
rendered pages were visually inspected for alignment and readable notices.
The first renderer invocation lacked its local font configuration; the corrected
run used `.local/pdf-fonts.conf` and a writable local font cache.

This prepares a concrete source/map for independent human qualification. It
does not qualify the form, supply missing 2026 return forms or open any export.
The synthetic worksheet proves field placement, not independent tax-law review.
A separate agent reopened the official source, checked its hash and all 17
printed locations, inspected the rendered first page, and reran the three
candidate tests without actionable findings. This is agent review; the human
qualification gate remains pending.
Local evidence: `.local/upgrade-evidence/form4952-candidate-{red,green,expanded,types,lint,canonical}.log`
(the canonical check is `.txt`), `form4952-2026-candidate.pdf` and its four PNGs.


## Complete review packets without duplicate serialization — 2026-10-25

`fillReturn` now applies the final visible notice while each completed template
is still in memory, after any requested flattening, then writes it once. All44
in-memory template paths use this finalizer. The per-packet path set records only
successful writes. Reference generators that write their own files retain their
separate reload/finalization step. There is no shared document cache or change to
source values, year checks, exact template hashes, redaction or filing gates.

The two new real-file tests first failed because each template was written
twice. Both editable and flattened output now write once; independent pypdf text
extraction checks exactly one visible review notice per page, and reopening the
editable1040 preserves its85000 wage field. The focused64tests pass. Exact staged
tree `77675b7487e023266807eff840774698d1b2c52b` passes all1,103PDF tests in111files,
root types and scoped lint (zero errors, two existing non-null warnings).
An independent agent reviewed the44 call sites and reran the two new tests with
no actionable findings. This is bounded software review, not form qualification.

The same immutable tree passes the full coverage run:17,100tests/744files,
92.74%statements,86.59%branches,92.37%functions and94.70%lines. The85%branch gate,
all other thresholds, test timeouts and covered source scope remain unchanged.
The run uses Node24.22.1,pnpm10.34.8,pypdf6.10.0 and the disposable loopback
PostgreSQL service, with one worker. It excludes concurrent uncommitted tax/facts
work. Remote coverage on the resulting commit still requires verification; this
local pass does not establish hosted staging or final release readiness.

Evidence under `.local/upgrade-evidence/`:
`pdf-single-write-focused-red.log`, `pdf-single-write-focused-green.log`,
`pdf-single-write-broad.log`, `pdf-single-write-full-coverage.log`, and
`ai-pdf-serialization-review.log`. Two earlier accidentally unfiltered WIP runs
were aborted and are not evidence of a passing gate.
