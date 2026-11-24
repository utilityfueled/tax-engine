# Final 2026 Schedule B source receipt

The IRS product catalog lists the final English Schedule B blank as revision
2026, posted November 24, 2026. It lists the separate 2026 instructions as
posted November 20. An earlier catalog response still showed the 2025 blank.
The live catalog and the About page's current revision link now identify the
new source. [IRS product catalog](https://www.irs.gov/forms-instructions-and-publications?find=1040&items_per_page=25&order=posted_date&page=0&sort=desc) ·
[About Schedule B](https://www.irs.gov/forms-pubs/about-schedule-b-form-1040) ·
[Final 2026 instructions](https://www.irs.gov/pub/irs-pdf/i1040sb.pdf).

The official current URL returned HTTP 200 at 20:32:40 UTC on November 24.
The annual archive returned HTTP 200 at 20:33:02 UTC with identical bytes.
The 72,863-byte PDF prints tax year 2026 and `Created 6/9/26`. It has SHA-256
`f4b1827b12113dcdc2b5e14181b3c658fa5553a277dea02e5106000b592815af`.
[Current PDF](https://www.irs.gov/pub/irs-pdf/f1040sb.pdf) ·
[Annual archive](https://www.irs.gov/pub/irs-prior/f1040sb--2026.pdf).

The single US Letter page has 72 native widgets. The 66 text fields include
14 interest and 15 dividend row pairs, summary amounts, header fields and
two country fields. The remaining six widgets are three unchecked Yes/No
pairs in Part III. The printed line 4 directs interest to Form 1040 or
1040-SR line 2b, and line 6 directs dividends to line 3b. The pinned blank
and its instructions support source inspection. Final annual Form 1040,
its instructions and tax tables, public mapping, and independent
qualification remain open. [Form 1040](https://www.irs.gov/forms-pubs/about-form-1040).

The source-pin tests verify the exact bytes, printed year, line destinations,
all native widget names and the closed export gates. All 132 focused tests
passed on Node 26.13.1. Scoped lint passed.

## Standalone ordinary review candidate

The renderer checks a complete inventory of 2026 Forms 1099-INT and 1099-DIV
against the return. Each original supplies its own confirmed recipient,
payer, full payer TIN, exact account reference and positive Box 1 or 1a
amount. Account comparison preserves case, punctuation and internal
spacing. Only exterior form spacing is ignored.
The calculation must require Schedule B, and the return must confirm No
for foreign accounts and foreign trusts. Other income methods and statements
that exceed the 14 interest or 15 dividend rows remain outside this cohort.

Exact cents reach the existing Schedule B calculator. The PDF shows whole
dollars and holds when printed payer rows would not add to the rounded exact
total. Private names and identifiers stay off the watermarked PDF. Payer
labels identify the source kind and its ordinal. The FinCEN follow-up and
country fields stay blank. The standalone mapper remains unregistered for
public review and filing while final annual Form 1040 materials are pending.
[2026 Schedule B instructions](https://www.irs.gov/pub/irs-pdf/i1040sb.pdf) ·
[Whole-dollar reporting rule](https://www.govinfo.gov/content/pkg/CFR-2025-title26-vol20/pdf/CFR-2025-title26-vol20-sec301-6102-1.pdf).

The isolated verification passed 163 tests, seven spec lines, lint, root
and contract typechecks, and the inventory check. Independent checks
reopened the rendered PDF at its native fields and confirmed that case,
punctuation and internal spacing distinguish different account references.
