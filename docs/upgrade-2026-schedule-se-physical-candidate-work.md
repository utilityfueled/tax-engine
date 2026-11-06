# 2026 Schedule SE physical candidate

The downloaded final-path [IRS Schedule SE](https://www.irs.gov/pub/irs-pdf/f1040sse.pdf)
is retained with a complete physical field map, inspected fixture and executable
spec. The November 6 00:18:55 UTC GET returned 77,739 bytes with SHA256
`a42f5a19c0e84a966a49b5f4ca021d3f49c4fda2e087da0b00bf2003525f8655`.
Both pages print 2026. Printed Created 4/27/26 and the separate November 3 PDF
metadata date are recorded without conflating them.

The map covers all 27 leaves: 26 text fields and one checkbox, across two pages.
Fixtures record names, types, pages and rectangles. The narrow anchors at printed
line 7 ($184,500) and line 14 ($7,560) remain empty. Fictional diagnostic PDFs use
REDACTED in the SSN field. Saved values, appearances, both checkbox states,
privacy and review notices were checked, including the actual page-two bottom
notice after a clipped tool view initially obscured it.

The spec preceded a genuine missing-asset assertion failure. Four new physical
tests then passed; the combined SE/C/R/4952 suite passed 17 tests. Distinct review
passed 21 tests and independently inspected the saved PDF objects and rendered
pages. No monetary calculation, optional-method eligibility, export registry or
readiness gate changes. Existing 2026 export and filing refusals remain.

Main verification passed 75 focused tests in six files, 849 metadata controls in
two files, engine/contracts/web types, spec validation, inventory checks, both
production builds and whole-project lint. The initial stale inventory failure is
retained: regeneration adds exactly one unsupported physical-spec row, leaving
all 912 previous rows identical and 68 supported unchanged (913 total, 429 partial,
416 unsupported). A separate review confirms that delta. The source audit adds
exactly two hashes; all 150 contracts, 584 declared browser cases, five hosted
skips, request caps and deadlines remain unchanged. This package does not claim
a fresh browser or whole-suite execution.

Evidence under `.local/upgrade-evidence/`:

- Author `nov05-schedule-se-2026-template-private`, 57-member manifest
  `2bebd3c2346d84c7af4e23dbcc492aecf6e2de5c2887a3a4bb90e452f0b3ad77`.
- Distinct `nov05-schedule-se-2026-template-distinct-review`, 32-member manifest
  `729db24ac341b14e487411810df36469f321b9526cbe77f7036c6af29a2ed962`.
- Main `nov05-schedule-se-main-verification`, 32-member manifest
  `ef9f3ddbca4735d957a5480e6e4de788f6307f86b85bfd79245cae61ad937e3b`.
- Inventory distinct `nov05-schedule-se-inventory-distinct`, manifest
  `dfb7a1b747bbdfd53ea58d0798977edf18180feb8ebcd27e18f8b6ea27f471dc`.

The earlier complete local run applies to commit `6a5c8696`: all 12 gates passed,
26,857 tests in 1,933 files in both unit and coverage, coverage 91.82% statements,
87.67% branches, 90.85% functions and 95.11% lines, and 584 declared browser cases
with zero failures and five existing hosted skips. Its separate frozen manifest is
`e3a3ce9627e2343690bb6043026047b4e3601f92352a9329316e437ad46d2381`.
These observations do not qualify later source, remote CI, hosting or native images.
Human tax/security/AI review, complete final 2026 forms and distribution gates
remain open; physical availability alone does not authorize filing.
