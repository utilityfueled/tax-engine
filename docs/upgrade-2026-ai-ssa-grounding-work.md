# SSA income source-box grounding

The actual development smoke exposed SSA-1099 proposals that quoted a real
amount from the wrong numbered box. Prospective application binding
`source-proposals/3` and income policy `income-extraction/3` now enforce the
finite numbered-box source contract before accepting a known monetary fact.
Gross, repaid, net and withholding map to boxes 3, 4, 5 and 6 respectively;
Decimal compares the printed amount. Unknown values remain unknown, and a
missing net amount is never calculated. The same guard applies to the document
adapter and evaluation caller, independently of golden values or provider.

The guard accepts only one explicit SSA-1099 and one supported printed amount
per numbered box. Duplicate boxes, recognized mixed forms, unsupported shapes,
wrong kinds and mismatched anchors deny. A form-number-shaped amount such as
1099.50 remains an amount only within its fully validated numeric span.
This is a finite text-layout boundary, not generic OCR or source authentication.
The source is [IRS Publication 915, 2025 Appendix, pages 20–22](https://www.irs.gov/pub/irs-pdf/p915.pdf);
those box definitions do not qualify final 2026 forms or taxability.

Spec-first work and genuine failing caller tests are retained. The first
independent review found two mixed-form admissions; the second found five
valid-number collisions. Both failed candidates remain immutable. The third
candidate closes those findings: author 120 tests and distinct review 163 tests
pass. The distinct review includes 43 additional controls. Its initial
unsupported spacing fixture failed once; only that new fixture was corrected
to the existing grammar, and the original failure is retained.

Current checkout integration on baseline `80af163d` passes 925 tests in 16 files,
including all 805 strict global spec-reference tests. Root, contracts and web
types, model-binding checks, spec validation (8,375 references), both builds and
repository lint pass. Three inventory suites add 66 passing controls. The first
stale-inventory check failed and remains recorded; ordinary regeneration adds
one unsupported entry, preserves all 877 old entries and keeps 68 supported.
No validator, readiness gate or test threshold was weakened.

Root reviewed the exact ten candidate paths and verified 4,610 unchanged
non-document source hashes through static checks. The main evidence packet has
32 members and SHA-256
`c16aa235faafd2cfb5028a21a77bb40e58de641baade57f981c9a67732151472`.
Author V3 manifest:
`194c1e666f3c159bba5bc9f8a4633a378c0ee8d8d9c530058963375bf9a339de`;
distinct V3 manifest:
`5839d48098ac52f65a5eae875d6eb9db463d460a8638e6bb5450b87f8aaa922e`.
Private local packets retain exact sources, prior failures and command receipts.

All historical provider outputs, costs and expected goldens are unchanged.
This package makes zero paid calls and does not retroactively rescore the
39-request development smoke. It is not human or held-out AI qualification.
Current full unit/coverage/browser, hosted and immutable self-host artifact
qualification remain required; the prior full browser result binds earlier
source. Filing and model promotion remain disabled.
