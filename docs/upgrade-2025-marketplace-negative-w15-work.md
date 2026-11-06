# Publication 974 signed Worksheet W line 15

This package preserves a negative intermediate limit in the 2025 W/X/Y/Z
worksheets when actual nonspecified deductions from another business exceed the
remaining income of the specified-plan businesses. It combines that intermediate
with the actual nonspecified deductions before transferring one nonnegative
health deduction. It also adds original partnership gross-income statements so
the existing ordinary K-1 interview can supply the gross amounts required for
the owner's QBI attribution.

This is a source-backed software implementation and review artifact. It does not
establish independent human tax-law qualification, filing approval, or 2026
filing readiness. All existing filing and review gates remain in place.

## Source derivation

Official sources refreshed for this work:

- [Publication 974](https://www.irs.gov/publications/p974), Worksheets W, X,
  Y/Z, the earlier nonspecified stop, and the simplified/iterative methods.
- [Reg. 1.199A-3(b)(1)(vi)](https://www.ecfr.gov/current/title-26/section-1.199A-3),
  the individual's allowable health deduction and business gross income used
  in calculating it.
- [Reg. 1.702-1(c)](https://www.ecfr.gov/current/title-26/section-1.702-1),
  the partner's distributive share of partnership gross income.
- [Form 7206 instructions](https://www.irs.gov/instructions/i7206) and
  [the official form](https://www.irs.gov/pub/irs-pdf/f7206.pdf).

W15 subtracts the completed nonspecified deduction from W13. W16 uses the
smaller of W3 and W15; X30 and Y/Z20 likewise use the signed earned-income
limit. Those instructions do not insert a zero floor. W17/X31/Y-Z22 add the
actual nonspecified deduction back to that intermediate. The earlier published
nonspecified stop retains precedence when the specified-plan businesses have
no remaining income.

The admitted negative-limit cohort has one actual owner of every business
contributing specified income or a positive nonspecified deduction, and a
nonnegative combined claim. Other business income is not added to W13. For
QBI, the combined allowable owner deduction uses the actual gross income of
every business used to calculate it. A negative specified component is not a
separate negative QBI deduction. This application of the published rules is a
documented source interpretation; the numerical controls below are derived,
not examples published by the IRS.

## Original inputs and literal controls

Actual C income 5,000, F income 20,000, W-2 wages 25,000, specified premiums
6,000 with advances 3,600, and separate nonspecified premiums 6,000 yield:

- Reported SE deduction 1,767; attributable C share 353.4.
- W13 4,646.6, W14 6,000, W15/W16/X30 -1,353.4.
- Combined health 4,646.6; Schedule 1 transfer 4,647; AGI 43,586.
- PTC 3,577 and repayment 23.
- Actual gross ratio 5,000/20,000 gives exact QBI health shares
  929.32/3,717.28, reported 929/3,718; QBI deduction 3,717.

Two ordinary partnerships with net/Box 14 amounts 5,000/20,000 and independently
sourced gross amounts 10,000/40,000 produce the same result. A net amount is not
substituted for missing gross income. The attachment binds the actual K-1
year, original source index, owner, name, EIN, ordinary income, Box 14 amount
and classification. Missing, stale, conflicting, duplicate and unsupported
activity statements reject. Source selection copies only original identity and
reported facts; gross income and confirmation remain unanswered.

Controls also preserve exact -0.01 W15, actual zero advances, ordered IRA and
student-loan deductions, stable source order, the existing nonspecified stop,
unknown versus zero, original-input immutability and the 2026 boundary.

## Interview and review output

The gross statements are available alongside the existing K-1 health plan
selection. An edit revokes the affected gross, health, Marketplace and existing
K-1 source confirmations. The full shell requires re-confirming the actual
records; it does not silently restore confirmations. A blank gross amount
remains unknown after reload and suppresses the preview.

The original-input review context binds the complete gross statement and K-1
source before redaction. Both physical Form 7206 sheets retain their own
nonspecified amounts. The appendix explains why their physical line 14 values
are not additive, prints signed W15 and the one return-level transfer, and
shows actual gross amounts and QBI attribution. Balanced gross edits or QBI
audit tampering that preserve the total still reject before PDF template I/O.

## Verification record

Development evidence is retained under `.local/upgrade-evidence/health-negative-w15-*`.
The spec-first core regression initially failed at the old negative-W15 guard.
The gross-source regression failed without an actual denominator. The PDF
regressions reproduced the absent signed explanation and balanced QBI audit
tampering. Each is retained separately from its passing run.

The initial full-shell test re-confirmed health sources but omitted the existing
K-1 confirmations invalidated by that edit. Its failure is retained. The test
now opens the actual original/history controls and re-confirms those records;
no source invalidation behavior was weakened. The full-shell, guide and actual
workspace cohort then passed 4 tests in 3 files. Production desktop/mobile
checks passed 2/2 with no retries, and all four valid/unknown screenshots were
inspected. The private rebase onto delivered `7c11d1ca` passed 521 tests in 101 files with
one worker, root and web type checks, 5,731 strict specification references,
scoped lint with zero errors and 97 recorded warnings, and root and production
web builds. The unchanged desktop/mobile browser cases also passed 2/2 with
zero retries on that exact build. Two explicit implementation links retain all
133 existing links; inventory generation records 542 entries.

The earlier broader development run passed 512 tests and failed one existing
exact source-option expectation because it did not include the newly supplied
original K-1 snapshot. That assertion now checks every source field; the
original canonical assertions remain. Its initial failure is retained separately.

Ten saved PDFs (69 pages) and eight retained JSON records were produced from
the rebased executable sources. Three JSON records are original TaxYearInput
records saved before explicit calculation and PDF generation, three are
calculated results, and the other two are actual guide/workspace records saved
before bridge/download. The initial artifact producer incorrectly supplied an
empty private review context to the C/F fixture; the existing context guard
rejected it. The producer now supplies a context only when preparation returns
one; no runtime behavior changed. The initial producer and failure are retained.
Independent-reader and visual verification subsequently completed without a
product change. The author reader reproduced all three original-input
calculations, checked 60 physical values and 73 reference/workspace values,
and confirmed one review notice per page with bounded structured-identifier
checks. Four all-page contacts, four footer sheets and 13 readable pages were
inspected. The initial workspace text probe expected comma formatting in the
physical amount; its corrected reader uses the actual unformatted digits, with
the original failed reader retained. The producer-to-freeze comparison records
31 unchanged executable/spec/test paths. Evidence is bound by
`health-negative-w15-artifact-review-supplement.json`
(SHA256 `e60e412ae1853a0ace9fc8f4edc649f9512ae4788dbbbb2cb30d63666e1870ae`).

The independent parent source review passed 22 tests in nine files, including
eight separate controls, with all 34 frozen paths unchanged. It refreshed the
printed signed worksheets, owner rules and original partnership gross-income
sources. The report is `parent-negative-w15-source-review.json`
(SHA256 `08f1b4531ad937280440f6a9db3317a21dee140f927b7dad74653f0925487cb0`).
The parent separately derived the three original JSON inputs and compared the
actual guide, reopened all ten PDFs and 69 pages with 84 populated fields,
and checked 90 physical, 179 reference and ten workspace values. Four contacts,
four footer sheets and 14 readable pages were personally inspected. Its initial
privacy probe joined unrelated month digits into an identifier; the retained
reader failure was corrected with bounded identifier matching, without changing
any source or PDF. The report is `parent-negative-w15-pdf-review/checks.json`
(SHA256 `2b19cbea49eb4db5cee6aea32552fe67b907cd3e157522b04354ba5c9231070e`).
These are independent agent reviews, not human tax-law or filing qualification.

The final private rebase uses `456bd432`, whose changes after the reviewed base
are parent documentation only. All reviewed executable/spec/test blobs and the
135 implementation links remain byte-identical. Rule provenance advances to
2025.163 and 2026.160-law-integration-draft while preserving the explicit 2026
method guard and all readiness gates. Final checks and inventory preservation
are recorded in the final snapshot manifest.

The exact final rebase passed 168 tests in 29 files with one worker, including
the unchanged readiness, rule metadata, source-link, inventory, guide, PDF and
adjacent health controls. Root and web type checks, all 5,731 spec references,
the inventory check, and both production builds passed. Scoped lint reported
zero errors and 97 existing warnings. The final inventory has 542 entries and
135 implementation links; all 539 prior entry keys and 133 prior links remain.
The reviewed production browser and original/PDF evidence applies unchanged
because all 31 producer runtime/spec/test files are byte-identical.

Parent integration onto `456bd432` verified all 35 owned paths and every final
manifest log/report hash before applying the reviewed patch. The seven focused
engine, gross-source, guided, physical-PDF and workspace suites pass all 12
tests with one worker on the main checkout. Evidence:
`parent-health-negative-w15-main-tests.log`. All unrelated files remain intact.

## Finite health remainder

Delivered methods include actual shared/unshared and no-advance allocation,
coverage-family/noncoverage-family splitting, separate business/owner limits,
the explicit consistent reasonable allocation method, nonspecified stops,
and actual zero-credit full/reported-repayment payment sources. This package
adds the same-owner signed W15 method and its actual partnership gross source.

Remaining internal work is bounded to actual payer/eligible outside-person
sources and payment shares that differ from Part IV, the determined positive
noncoverage-advance payment cohorts, and marriage composition of existing
source methods. Source-complete owner/business combinations must preserve the
published owner and gross-income rules. No gross denominator or payer is
inferred from net income, policy allocation, or a confirmation alone.

The binding 2025 joint capped-repayment attribution across distinct owners
remains a precise interpretation question. A downstream QBI gross ratio is not
authority for allocating that upstream joint repayment. General positive-credit
noncoverage advances remain guarded where the payment-to-deductible-premium
bridge is not determined. These limitations are not claims of completed
implementation or external human qualification.
