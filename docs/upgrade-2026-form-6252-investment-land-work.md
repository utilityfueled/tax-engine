# 2026 Form 6252 investment-land projection

## Later installment years

Commit `8d666cc1` extends the internal projection to a confirmed prior-year
domestic investment-land sale under its unchanged fixed-price agreement.
The source ledger explicitly covers every prior year, including zero years.
The specimen retains `0.625000` from the original sale-year return. It has
$30,000 of prior payments, $30,000 of current payments and $18,750 of current
long-term gain. Zero-payment and final-payment controls pass. A retained
percentage that would change the engine's whole-dollar gain is rejected.
[Final IRS Form 6252 and instructions](https://www.irs.gov/pub/irs-prior/f6252--2026.pdf).

Both new projection tests failed before implementation. The final 124 scoped
tests, engine and web types, lint, inventory and all 8,890 spec references
passed. A separate Decimal derivation and strict PDF reader verified 25 text
values, two selections, all 49 original widgets, blank identity, four review
marks and removal of inherited active content. All four pages rendered and the
filled form page was visually checked. The readback specimen SHA-256 is
`8b089b4850815b6bdf24edf0d42808bbd4ffd3829c02159336a3f738fd92ade9`.
The specimen is private synthetic evidence. Public review and filing export
are still disabled. The dated ledger and printed precision requirements apply
to this projection only. Changed obligations, debt, deemed payments and
related parties require additional methods and qualified review.

Commit `a68f71ab1a6e3b9b95a4f2deb9e1941eb037ea93`, tree
`381d638501f8c011c701289afca7942031420d84`, projects one current-year,
fixed-price sale of domestic investment land to an unrelated buyer. The
candidate requires confirmed closing, basis and payment records, a holding
period greater than one year, separate principal, and at least one confirmed
payment after the year of sale. The scope excludes assumed debt, special
payments, recapture and other methods that require different source facts.
The line 1 property code is 4. Line 3 is No, line 4 is Yes, and Part III is
blank. [Final form and instructions](https://www.irs.gov/pub/irs-prior/f6252--2026.pdf) ·
[Publication 537](https://www.irs.gov/publications/p537).

The fresh Decimal calculation and an independent readback agree on the
$120,000 sale, $45,000 installment basis, $75,000 gross profit, 0.6250 ratio,
$30,000 current principal and $18,750 long-term gain. A known-zero receipt
stays zero. A six-place example verifies line 24 after rounding. The projection
refuses amounts when the printed arithmetic, branch or open balance disagrees
with the exact-source result. The maximum six printed decimal places is a
bounded candidate choice. Other ratios remain held when that precision would
change the whole-dollar gain.

The spec-linked test failed before implementation. A second failure records
the missing property code found in the rendered form's own instructions.
After correction, 97 focused tests in four files passed. The broader PDF and
adjacent engine run passed 2,354 tests in 330 files before the label correction.
The three type checks, engine build, scoped lint, inventory and 8,854 spec
references passed. The browser source digest was updated without changing cases
or request limits.

The final synthetic PDF SHA-256 is
`af864cd0ed184f05ffa95e2f37f707d83c0834950d05592d406b56c1260ca477`.
Strict pypdf reopened four pages and matched all 49 widget positions, 25 written
text values, two checkboxes, blank identity, four review notices and no active
catalog actions. Poppler rendered all pages, including the corrected page 1
code and the three instruction pages. The separate readback receipt SHA-256 is
`b880f90b512bb11b7b92be8e8347f047130bf75bfc5a1f709b3ca3a2ac85595d`.
The local logs and marked specimen are under
`.local/upgrade-evidence/nov13-form6252-investment-land/`.

The source adapter stays outside guided and export routing. Other installment
scenarios, final annual return composition, independent qualified tax review,
and public review and filing qualification remain open.
