# Social Security worksheet export evidence

Updated 2026-10-25. Official source: [2025 Publication 915](https://www.irs.gov/pub/irs-pdf/p915.pdf), Worksheet 1 and the Worksheets 2/4 lump-sum comparison. The calculator integration is a separate federal package; this package changes only its review summary and tests.

- [x] Spec updated before three observed PDF regressions: the publication worksheet was mislabeled, incomplete audit evidence was accepted, and the comparison cited the wrong standard line.
- [x] Summary reads official `Pub915 WS1` lines 1–19 when income exclusions apply and `SS Worksheet` lines 1–18 otherwise. Publication 915's married-filing-separately lived-together branch omits lines 9–16 as directed.
- [x] Exclusions, gross source benefits, standard taxable benefits, current and earlier-year lump-sum amounts, and Form 1040 lines 6a/6b reconcile to actual audits. Compatibility line aliases no longer supply printed worksheet values.
- [x] Missing, duplicate, wrong-form, nonfinite or inconsistent evidence rejects. Exact tax-year checks run before summary construction. A higher lump-sum comparison preserves the standard method.
- [x] Every generated page retains the review-only warning. Synthetic two-page Publication 915 output rendered and visually inspected; decoded streams and extracted text confirm the warning on both pages.
- [x] 35 adjacent calculator, integration and PDF tests pass; root types, warning-free scoped lint and the complete 3,289-reference spec check pass. Local evidence: `.local/upgrade-evidence/social-security-pdf/`.
- [ ] This remains a 2025 review summary. Final 2026 mapping and independent filing qualification remain unavailable; no readiness gate was changed.

The parent upgrade ledger records the scoped commit and subsequent full-suite verification. No real taxpayer records, provider calls or live-service funds were used.
