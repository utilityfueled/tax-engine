# Schedule A actual itemization election

The 2025 review mapper omitted physical line 18 even when the taxpayer explicitly
selected itemized deductions below the actual standard deduction. The final
[2025 Schedule A instructions, line 18](https://www.irs.gov/instructions/i1040sca)
were refreshed on October 25, 2026. The mapper now checks the box only when the
input election and canonical selected method are both itemized and the canonical
itemized amount is less than the actual standard amount. No election is inferred.

The spec preceded a saved-PDF regression that failed with expected true/actual
false (`charity-election-red.log`). Five literal cases retain automatic,
standard, equal-amount and larger-itemized behavior. Exact tree
`6e53a7b1b7aa0ca0e802ccee4148ad5f4e916695` passed 24 PDF tests in four files,
root typecheck, 4,711 spec references and scoped lint with zero warnings/errors.
The parent independently read the condition and official source and reran the
saved-PDF test's five cases on that exact tree without an actionable finding;
this is agent software/source review, not human qualification.

The saved synthetic PDF was reopened: line 17 is 12,000, line 18 is checked,
the identifier is blank and the actual standard amount is 15,750. Visual
inspection confirms the checkbox and one red review notice. PDF, reopened JSON
and PNG are in `.local/upgrade-evidence/charity-election-pdf/`. No calculation,
rule-pack version, export gate or filing qualification changes in this correction.
