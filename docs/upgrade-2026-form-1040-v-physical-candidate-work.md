# Final 2026 Form 1040-V physical candidate

The IRS product page's current revision and the 2026 annual archive resolve to
identical 97,210-byte PDFs. The form prints Created 8/19/26. Its SHA-256 is
`7533914c5674c1486e4c60dba1e852d65669aece7b840c3644761bac64e64335`.
The general downloads catalog lists a 2025 revision label beside a November 10,
2026 posting. The IRS annual index lists separate 2025 and 2026 rows. The
candidate pins the year-specific 2026 copy. [IRS product page](https://www.irs.gov/forms-pubs/about-form-1040-v),
[annual index](https://www.irs.gov/prior-year-forms-and-instructions?find=1040v&items_per_page=200&order=prior_year_products_picklist_revision_date&sort=desc),
[2026 PDF](https://www.irs.gov/pub/irs-prior/f1040v--2026.pdf),
[general downloads catalog](https://www.irs.gov/forms-instructions-and-publications?find=payment&page=0).

Page 1 contains 15 text widgets across four lines. The identifiers for the
first and second taxpayers, the single right-aligned check or money order
amount, and the separately printed name and address cells each have one exact
AcroForm location. The second page contains printed instructions and has no
widgets. The voucher uses the amount the taxpayer is paying by check or money
order and the names and address as shown on the return. The IRS instructions
say online payers leave it uncompleted. [2026 Form 1040-V](https://www.irs.gov/pub/irs-prior/f1040v--2026.pdf).

The four candidate tests failed before the asset and mapping were added. They
passed on Node 26.13.1. The PDF/spec runner reported 3,160 passing tests in
325 files. Targeted ESLint, type checking and all six candidate spec references
passed. A separate strict reader matched 15 canonical field and page annotation
identities and reopened all 15 diagnostic values with corresponding appearance
text. Visual review checked both pages, including the exact synthetic `1234.56`,
redacted identifiers, address placement, and the review notice on each page.
Synthetic artifacts and verification logs are retained locally under
`nov12-form1040v-candidate`.

This candidate remains outside the review and filing registries. It requires
independent review before use in any export or payment workflow. No amount
calculation, mailing decision, payment action or public route is implemented.
