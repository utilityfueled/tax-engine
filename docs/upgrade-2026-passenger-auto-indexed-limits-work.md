# Published passenger automobile limits

The indexed table now matches [Rev. Proc. 2025-16, section 4.01 Tables 1/2](https://www.irs.gov/irb/2025-11_IRB)
and [Rev. Proc. 2026-15, section 4.01 Tables 1/2, printed page 7](https://www.irs.gov/pub/irs-drop/rp-26-15.pdf),
retrieved November 5. Values remain Decimal. The original placed-in-service
year selects the table, including when depreciation continues in a later year.

| Placement year and applicable table | First year | Second year | Third year | Each succeeding year |
| --- | ---: | ---: | ---: | ---: |
| 2025, applicable bonus | 20,200 | 19,600 | 11,800 | 7,060 |
| 2025, no bonus | 12,200 | 19,600 | 11,800 | 7,060 |
| 2026, applicable bonus | 20,300 | 19,800 | 11,900 | 7,160 |
| 2026, no bonus | 12,300 | 19,800 | 11,900 | 7,160 |

The product change is confined to the constants block and its authority comment.
Existing incorrect 2025 expectations, titles and comments are corrected against
the published values, preserving assertion counts. A separately reviewed stale
test comment is corrected during adoption. No utility formula, source validator,
readiness gate, coverage threshold or supported-state label changes.

Spec-first tests reproduce two actual numeric failures on the checkout before
the table correction. New tests examine all 16 published cells and 20 actual
parsed-input calculator paths, retaining `legacy_unqualified` and input
immutability. Distinct review independently extracts all cells from the official
HTML/PDF and checks four table relationships plus 14 separate API boundaries.
The private candidate passes 177 tests; actual checkout verification passes 198
tests across seven files using `pnpm test`, root typecheck, all 8,340 spec
references, inventory generation/check and unchanged repository lint. Inventory
adds one entry; it remains unsupported under the unchanged engine-path contract.

The strict extra lint attempt on two older test files fails on their existing
121 non-null-assertion warnings. An old/current diagnostic comparison
confirms all 121 identities, severity and source locations are unchanged; byte
offsets move after a comment edit. Changed product and new test have zero lint
warnings. Initial private bad-enum/import setup failures are retained separately
from the genuine numeric RED and final GREEN. No rule is suppressed or weakened.

This is a table correction, not a qualified passenger-auto calculation. Cap
proration, combined section 179/bonus/regular allocation, unsupported historic
placement years, distinct use percentages, changed-use/ADS/recapture, remaining
basis and post-recovery/disposition behavior remain required engineering work.
Table availability does not establish bonus eligibility, complete taxpayer
sources, final 2026 forms, professional tax review or filing readiness. The
earlier complete unit/coverage run pertains to the preceding source; its separate
browser run retains seven failures and five hosted skips. Current integration
and distribution qualification remain open.

Private evidence bindings:

- Candidate manifest: `583fea6bd02d3de1eb10953c8081ab58e78093f81854fc1b153bc00a250deb50` (21 verified members).
- Independent manifest: `2a138759adbae1bf745d7d7d443d0809471c787e9d700e9c3f68a2ca75cc642f` (11 verified members).
- Independent report: `406b922e8e3f3c1f372afda65177669356052b2767115c6b84bc2f722f85736c`.
- Checkout logs: `nov05-passenger-auto-limits-main-red`, `nov05-passenger-auto-limits-main-green`, and `nov05-passenger-auto-limits-main-checks`.
