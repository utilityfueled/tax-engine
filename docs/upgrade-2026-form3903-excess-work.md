# Form 3903 reimbursement excess

Form 3903 compares qualifying expenses and reimbursements separately for each
move. The return transfers positive expenses over reimbursements to Schedule 1
line 14, and positive reimbursements over expenses to Form 1040 line 1h.
Amounts already included in W-2 box 1 remain in wages. Separately exempt
allowances and government-furnished services stay outside the Form 3903 line 4
comparison. The historical source and mileage example now use the published
2025 instructions and 21-cent rate.
[2025 instructions](https://www.irs.gov/pub/irs-prior/i3903--2025.pdf) ·
[2026 instructions](https://www.irs.gov/pub/irs-pdf/i3903.pdf).

An older saved amount can include an exempt allowance or omit an expense.
Before treating a positive difference as taxable, the engine requires
confirmation and all three original amounts, including any explicit zero.
The per-move result and federal aggregate leave an unconfirmed positive
difference unknown. The existing deduction worksheet continues to accept
historical input. An independently derived synthetic source showed how a
dislocation allowance could otherwise incorrectly create $120 in taxable
income. A separate independent calculation covered $97.28 in taxable excess,
$57.37 of deduction from another move, and Box 1 and disability-income
coexistence.

The historical PDF displays the audit-backed line 1h amount and source types
at their official locations. Saved checks reopen the document and verify
the separate W-2 amount, the reimbursement transfer, the combined disability
and reimbursement case, and the unchanged wage aggregation.

The original calculation and mapping produced four expected failures.
Later targeted runs reproduced missing confirmation, an exposed worksheet
result, and the combined saved label mismatch before their corrections.
An intermediate assertion against the closed 2026 federal route is preserved.
The final seven-suite run passed 651 tests. All three type checks, 8,698 spec
references, the inventory, and strict lint for the changed form and mapper
passed. The form test has eight inherited lint warnings. No final-year federal or state
route, candidate mapping, or filing gate was enabled. The 2026 dated
mileage and new eligibility rules, native fact collection, and independent
qualified tax review remain separate work.
