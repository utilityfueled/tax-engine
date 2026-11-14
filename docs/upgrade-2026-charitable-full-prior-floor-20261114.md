# Entire prior charitable category absorbed by the floor

November 14, 2026. Multiple original carryover vintages in one category can now
be reconciled when the 2026 charitable floor disallows the entire otherwise
allowable category. Every affected original has zero deduction, so this case
does not require an arbitrary partial allocation between vintages.

The method requires fully treated original amounts of the same medium, no
current allowance in that category, no remaining percentage excess, no pooled
filing-unit sources and no NOL-origin context. The original treated-as-paid
consumption remains intact. It does not restore balances or create a new 2026
carryover. Partial multi-vintage attribution and mixed cash/property media remain
unavailable. The selected-return reconciliation also rejects a prior-floor proof
relabelled as a current-only method.

Authority: [IRC §170](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section170&num=0&edition=prelim),
[Treasury regulation 1.170A-10](https://www.ecfr.gov/current/title-26/section-1.170A-10),
and [final 2025 Publication 526](https://www.irs.gov/publications/p526) for
original carryover history. The latter is not final 2026 form qualification.
Research and spec preceded the actual failing tests. The original rejection,
proof-mutation failure and intermediate fixture corrections remain in evidence.
No existing rejection test was removed or weakened.

Verification passed 257 tests across 62 charitable engine files, 198 spec
references, typecheck, confined lint and diff checks. A separate agent reviewed
all eight author files and the parent's independent test/spec, passed nine
repository tests, and passed 18 independent probes across all five categories,
multiple categories and mixed-medium rejection.

The parent's separate archived-baseline test distinguishes an exact 500-dollar
prior category from floors of 500.001 and 499.999 dollars: full absorption passes,
while a fractional-cent partial allocation rejects. It fails on `90806a8a` and
passes here. Monetary decisions use Decimal without rounding away that boundary.

Private evidence:

- `nov14-charitable-full-floor-research/FINAL-REVIEW.json`, SHA-256
  `701c0f27e8b241ed07f92fba06dec2c79797933175cf7dcee94b55093ff72cc2`.
- `nov14-charitable-full-floor-independent-review/review.json`, SHA-256
  `b9b0631d31055e87c4e4dc63c130e20bc1d56ad90b217db3841201f0d15b3e13`.
- `nov14-charitable-full-floor-independent/receipt.json` records the separate
  fractional-cent RED/GREEN evidence.

These are engineering checks. Full 2026 readiness, physical final forms, filing
and qualified human review remain closed. Combined current-source checks and
runtime artifacts are recorded separately. This commit stays local under the
user's production-deployment hold.
