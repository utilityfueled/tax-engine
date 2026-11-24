# Final 2026 Form 4137 source and review worksheet

The IRS catalog posted final Form 4137 on November 24, 2026 at
16:11:11. The current and annual archive copies retrieved at
21:51:40 UTC both measured 84,583 bytes. Both copies have SHA-256
`9bd93a180bb4e438fc7fa6c0f912f696e14f40d3e8fb62e5749b8c925900980a`.
The face prints 2026 and “Created 4/30/26.” An independent retrieval
confirmed both copies and the prior 2025 revision.
[IRS catalog](https://www.irs.gov/downloads/irs-pdf) ·
[Current IRS Form 4137](https://www.irs.gov/pub/irs-pdf/f4137.pdf) ·
[2026 archive](https://www.irs.gov/pub/irs-prior/f4137--2026.pdf) ·
[2025 archive](https://www.irs.gov/pub/irs-prior/f4137--2025.pdf).

Line 7 prints the $184,500 Social Security wage base, which also caps
the line 8 RRTA component. Line 4 still transfers to Form 1040 line 1c.
Line 13 now prints Schedule 2 line 16a. Page 2 refers to line 17c for
the separate W-2 Box 12 code A/B uncollected tip payroll tax. The
current main Form 1040 and Schedule 2 copies still print 2025, and their
2026 archive URLs returned 404 at retrieval.
[SSA contribution and benefit base](https://www.ssa.gov/oact/cola/cbb.html) ·
[Current Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) ·
[Current Schedule 2](https://www.irs.gov/pub/irs-pdf/f1040s2.pdf).

## Standalone ordinary review worksheet

The final source retains 34 blank native text fields on page 1, including
five employer rows and the read-only widget beside the printed wage base.
Page 2 contains the annual instructions. The isolated renderer reconciles
one primary taxpayer's complete confirmed 2026 tip records and same-owner
W-2 payroll through the existing payroll calculation. It requires one to
five linked ordinary employers and actual zero for special payroll
amounts outside this case. Positive allocated tips must reconcile to an
employee's actual W-2 and an employer row. It stops when the displayed
whole-dollar rows and totals disagree with the retained calculation.

Independent technical review reproduced three incorrect admissions before
the fixes. A copied wage-only W-2 used wage-base room twice, a single W-2
exceeded the Boxes 3 and 7 cap, and a linked W-2 carried code TP without
reconciling to the employer's reported tips. All three now stop. Controls
retained Medicare tax with legitimate aggregate payroll above the cap and
preserved unknown code TP.
[2026 W-2 instructions](https://www.irs.gov/instructions/iw2w3).

The candidate shows only ordinal employer labels and amounts, with the
review notice on both pages. Independent inspection of a synthetic
render verified the widget placement, blank identifier fields and visible
notices. The candidate remains outside the public PDF registries.
Qualified review, additional recipient and continuation scenarios, and
final annual transfer verification remain open.
[Spec](../spec/federal/form-4137-2026-template.yaml) ·
[Fixtures](../tests/pdf/form-4137-2026-candidate.test.ts).
