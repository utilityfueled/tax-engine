# Final 2026 Form 8801 source receipt

The IRS product catalog dates the final 2026 Form 8801 to November 23, 2026. The regular download and the annual archive returned identical bytes on November 24 at 14:38 UTC. The four-page PDF prints tax year 2026 and `Created 5/27/26`. The blank has 99,515 bytes and SHA-256 `782d879f1d6e3ca636c129a61092f957f86e028e056e5261e5feb3895410d8f1`. Its 57 blank text widgets are distributed 17, 11, 16 and 13 across the four US Letter pages. [IRS product catalog](https://www.irs.gov/forms-instructions-and-publications?order=posted_date&sort=desc) · [Current blank](https://www.irs.gov/pub/irs-pdf/f8801.pdf) · [Annual archive](https://www.irs.gov/pub/irs-prior/f8801--2026.pdf)

The final blank matches the draft on printed lines 1–55 after removing the draft cover and watermarks and normalizing layout whitespace and grouping braces. Part I uses 2025 figures, including the 25% phaseout on line 8 and the $239,100 and $119,550 rate breakpoints on line 11. Part II preserves the signed amount on line 18, takes the 2025 carryforward on line 19 and 2026 Form 6251 line 9 on line 23, transfers line 25 to Schedule 3 line 6b and carries line 26 to 2027. Part III uses the prior-year capital-gain worksheet and rates when applicable. The final blank confirms the existing individual calculation spec. [May 27 draft](https://www.irs.gov/pub/irs-dft/f8801--dft.pdf) · [2025 blank](https://www.irs.gov/pub/irs-prior/f8801--2025.pdf) · [Form 8801 spec](../spec/federal/form-8801.yaml)

The disabled candidate identifies the Part II widgets. A synthetic test exercises the existing calculation and reopens an in-memory watermarked copy with line 18 of −$694, available credit of $4,306, allowed credit of $3,000 and carryforward of $1,306. Final instructions, final current-year Form 6251, current-year transfers, and independent tax and map review remain open. The current instructions and current final Form 6251 both print 2025. [Form 8801 instructions](https://www.irs.gov/pub/irs-pdf/i8801.pdf) · [Current Form 6251](https://www.irs.gov/pub/irs-pdf/f6251.pdf) · [2026 Form 6251 draft](https://www.irs.gov/pub/irs-dft/f6251--dft.pdf)

The three new tests failed before the official blank and candidate were added. On Node 26.13.1 all 23 focused tests passed. Scoped lint passed, and the spec retained all 56 valid references. Engineering review checked the citations, asset checksum, transfer fields and absence from the public review and filing registries.

## Standalone no-credit review candidate

The internal renderer uses operative 2025 Forms 6251 and 8801 with distinct
private source references and independently matched owner facts. It reconciles
whole-dollar prior Form 6251 amounts and the actual filed Form 8801 line 26.
It admits the finite ordinary single-filer cohort and follows the final 2026
printed stop instructions in Parts I and II. A zero or negative line 21 leaves
lines 22–26 blank. A positive line 21 requires the final current-year forms.
The taxpayer identifying number and source references stay off the document.

Fifty-eight focused tests, scoped lint and independent review passed. An
independent reopen and visual check matched 11 canonical values and native
widget appearances. The negative specimen showed line 18 of −$3,189, prior
carry of $3,188 and line 21 of −$1, with the review notice on all four pages.
Final instructions, the positive-pool branch, qualified human review and
public export remain open.
[Final Form 8801](https://www.irs.gov/pub/irs-prior/f8801--2026.pdf) ·
[2025 Form 6251](https://www.irs.gov/pub/irs-prior/f6251--2025.pdf).
