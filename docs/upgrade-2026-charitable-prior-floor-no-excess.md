# Prior charitable floor with no surviving percentage excess

A sole prior source in a floor-hit category can now complete the existing 2026
charitable method when its entire opening is treated as paid, the category has
no current allowance, and the complete percentage ledger has no surviving
excess. The floor reduces the deduction without restoring the consumed original
balance or creating a new contribution year. No NOL-origin context, pooled
ownership, partial original consumption, or competing prior vintage is admitted.

The source derivation uses [IRC 170(b)(1)(I) and (d)(1)(C)](https://uscode.house.gov/us/usc/119-136/t26/s170/),
[Regulation 1.170A-10(b)(2) and (c)(2)](https://www.ecfr.gov/current/title-26/section-1.170A-10),
and the current-before-prior and original-year carry rules in
[Publication 526](https://www.irs.gov/publications/p526), refreshed November 6, 2026.
The enacted floor applies after 2025. The carry regulation distinguishes
treated-paid consumption from deductible amounts; the new floor-carry provision
requires a carryable excess without the floor. This finite endpoint has none.
The law does not exempt the prior deemed-paid contribution merely because its
receipt predates 2026, and a smaller deduction alone does not create carry.
This is a statutory/regulatory derivation, not a matching published example.

The independent fictional original is a 2025 public-charity long-term stock gift
of $35,000, basis $10,000, with a $100,000 contribution base and no other gifts or
NOL reduction. The original $30,000 percentage allowance leaves an actual $5,000
excess. At a 2026 base of $100,000 with current public cash of $10,000:

| Current D source | Prior treated as paid | Prior deductible | Total allowable charity | Closing carry |
| --- | --- | --- | --- | --- |
| $0 | $5,000 | $4,500 | $14,500 | $0 |
| $499.99 | $5,000 | $4,999.99 | $14,999.99 | $0 |
| $500 | $5,000 | $5,000 | $15,000 | $0 |
| $500.01 | $5,000 | $5,000 | $15,000.01 | $0 |

These amounts remain Decimal until the existing completed-return rounding stage.
The original $500 current-D boundary is unchanged. A final-year source with
actual intervening consumption keeps that consumption and its original expiry;
an unrelated already-expired source still expires independently. The selected
itemized consumer preserves the post-floor prior deductible amount rather than
resetting it to the larger treated-paid amount. Standard and explicit
nonitemized selections retain zero prior deduction and their separate current
section 170(p) calculation. No new input field accepts a computed allocation.

Private work is based on exact commit `72addca70629766331f10b5c8079b93a14f4e545`.
Source custody, original inputs, commands, and retained failures are in
`.local/upgrade-evidence/nov06-charitable-prior-floor-no-excess-private`.
The research packet is separately frozen in
`.local/upgrade-evidence/nov06-charitable-prior-floor-independent-research`.

Validation retained the actual baseline 2-pass/5-fail guard run before runtime
edits, followed by seven unchanged passing new controls. Two existing blanket
denials were then observed failing separately: the original D499.99 assertion
(5 pass/1 fail), and the nonitemized G10000/B5000/priorC10000 assertion in the
first adjacent run (71 pass/1 fail). Only those now-obsolete denial expectations
and their source explanations changed. The D500 expectation, amended-B offset
guards, monetary originals, all remaining assertions, 5-second test deadlines,
two-worker limit, and disabled file parallelism are preserved.

The final named cohort passes 72 tests in 19 files. Product types pass; owned
test compilation retains 11 byte-identical diagnostics in unchanged
`tests/fixtures/simple-w2.ts`, independently reproduced from its exact archived
baseline type closure, with zero new diagnostics. Scoped lint has zero errors
and warnings. All 25 references in the three affected specs validate. The first
product typecheck's optional-index narrowing diagnostic is retained; the fix
uses a direct typed comparison, without casts or non-null assertions.

Independent source research agrees with the four finite numerical endpoints;
the distinct software review now passes with no material finding. No physical 2026 PDF, full production
calculation, filing, or qualified human tax/privacy review is claimed. The actual
2026 constant gate remains closed. Surviving percentage excess and competing
current/prior or multiple-prior floor attribution remain separate methods; this
change neither chooses their vintage nor re-ages their clocks.


Current-checkout integration independently reproduced the genuine baseline:
two passes and five guard failures before either runtime file changed. The
unchanged 19-file cohort then passes all 72 tests in 7.56 seconds, with no retry,
TERM or surviving owned process group. All three product type checks, 8,664
spec references, generated inventory and its check, seven-file lint (zero errors
and warnings), and engine build pass. Integration receipts are in
`.local/upgrade-evidence/nov06-prior-floor-main`. These checks include the later
health and browser-audit changes in the checkout; they do not replace the full
combined run or distribution rehearsals.


Distinct software review verifies the full eleven-path inverse, all 99 author
evidence members and the complete source copy before and after. Its unchanged
19-file replay passes 72 tests; 15 additional controls pass, including sub-cent
floor crossings, a different original/base, two distinct prior categories,
residual floor reaching current cash, and ambiguous-source refusals. Both runs
close naturally at the original limits. The reviewer retained and corrected one
worksheet-call setup failure without changing expected values. The 35-member
review manifest is `49c7a7bf33a574d2ae492647cfc9bd28e81f6196547e69311a085966f440e574`
at `.local/upgrade-evidence/nov06-charity-prior-floor-independent/software-stage2`.
ROOT read its full report and rehashed all members. This is independent agent
review; the required qualified human opinion is still absent.
