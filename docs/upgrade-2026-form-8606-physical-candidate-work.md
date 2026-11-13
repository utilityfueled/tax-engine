# Final 2026 Form 8606 physical candidate

The IRS final PDF was posted November 10, 2026 and prints Created 4/21/26.
Its exact 92,889 bytes have SHA-256
`eeb2c5a11da6903e30c468572da0242c28f19ee135b9853562d7ce9fc037cb56`.
The regular instructions endpoint still serves 2025. The separate 2026
instructions identify themselves as a draft. [IRS final index](https://www.irs.gov/downloads/irs-pdf?order=field_pup_posted&sort=desc),
[final Form 8606](https://www.irs.gov/pub/irs-pdf/f8606.pdf),
[current instructions](https://www.irs.gov/pub/irs-pdf/i8606.pdf),
[draft 2026 instructions](https://www.irs.gov/pub/irs-dft/i8606--dft.pdf).

The candidate maps all 47 widgets across two pages. Independent source
inspection found 25 widgets on page one and 22 on page two. The 2025
blank has 23 and 22. The 2026 address separates city, state and ZIP.
Line 10 uses two widgets with a printed decimal point between them.
The 2026 preparer address and EIN use the opposite widget order from
2025. The signature and date areas identified as static in the spec
have no fields. The standalone address and preparer controls are blank
in both saved specimens.

Five tests failed before the candidate was added. An independent visual
recheck corrected the preparer's printed-name identity, and the exact
identity regression failed on the initial map. All 121 tests in seven
affected suites pass after correction. Strict lint, type checking, engine
build, all 8,713 spec references and the regenerated inventory pass.
The inventory adds one unsupported physical candidate. A separate strict
reader reopened both PDFs with 47 canonical leaves and 47 page widgets
each, matching saved appearances and one notice per page. Poppler
rendered all four pages at 125 dpi. The two line 10 values render as
0.375 and 1.000, and the displayed name and identifier are fictional or
redacted. Evidence is retained privately under
`nov12-form8606-final-physical` and `nov12-form8606-independent-physical`.

The candidate is excluded from the public review and filing registries.
Final instructions, independent tax review, 2026 Form 8915-F handling,
repayment and account-exclusion treatment, and the final 1040 transfer
remain to be qualified. The diagnostic field values exercise physical
placement and carry no tax result.
