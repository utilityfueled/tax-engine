# 2026 Form 1040-V paper payment projection

Local commit `9f9a5598` maps a confirmed check or money order amount to line 3
of the final 2026 voucher. The source must include the confirmed 2026 Form
1040, 1040-SR or 1040-NR balance and the separately confirmed single paper
instrument. The projection accepts a partial payment and preserves two decimal
places. It refuses unknown, zero, fractional-cent and greater-than-balance
payments, other methods, and a single check of $100 million or more. This is
an internal diagnostic projection. A release still needs the final parent-return
integration, identity and address qualification, human review and authorization.
[Final 2026 Form 1040-V, line 3 and payment instructions](https://www.irs.gov/pub/irs-prior/f1040v--2026.pdf).

Both spec-linked tests failed before the projection existed. A separate saved-PDF
test confirmed that rewriting the official blank left the original Reader rights
signature in the first specimen. The corrected diagnostic uses the existing
template cleanup on the hash-verified source. The final run passed 52 tests in
six files, engine typecheck and build, scoped lint, inventory, and all 8,859
spec references. The final run transcript SHA-256 is
`19aa3fc0d2f92537b30580551fa5bf4c2ba0401edfe3585e8634a438a1b3b875`.

A separate strict pypdf readback and Decimal comparison confirmed that a
$1,234.56 check against a $1,500.00 balance writes only line 3. All 15 widget
locations remain present. Both pages carry the review notice and both rendered
pages were visually inspected. The saved artifact has blank identity and address
cells, with no active JavaScript, XFA or obsolete signature. PDF SHA-256
`84f34c6e602311d79177547bd377b07b3ffe7006a3bc8db4e63cce0c38d1d12d`.
Retained local evidence is under `.local/upgrade-evidence/nov13-form1040v-paper`.
