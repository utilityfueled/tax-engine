# Current cash-farm NOL origin with an actual filed carryback waiver

This package adds one source-backed **2025** current-loss method. It does not elect a carryback waiver for the taxpayer. It requires records of an actual timely original return with its actual attached, irrevocable, entire-period §172(b)(3) statement. Unwaived carrybacks, historical farm-loss use, amended-return relief, other farming methods and annual 2026 calculation/export remain closed.

## Authority and scope

Official sources were retrieved on November 14, 2026. Form 172 instructions explain the farm-only NOL cap and actual waiver; Publication 225 applies the farm limitations and excess business loss before the farm carryback; Form 6251 instructions require an independent AMT NOL computation and apply the regular carryback waiver to AMT.

| Official source | Retrieved version | SHA-256 |
| --- | --- | --- |
| [Form 172 instructions](https://www.irs.gov/instructions/i172) | December 2024 revision | `295e0cba681624469d9ecd9af76a4f2b93f3898ffcab4c25ec38b16bccbd731b` |
| [Publication 225](https://www.irs.gov/publications/p225) | Final 2025 | `33100d5a5106f685ea78e75fbbd9d3364fa8ba31dda98bc7344f4f75d688b2fb` |
| [Form 6251 instructions](https://www.irs.gov/instructions/i6251) | Final 2025 | `d09974bea4c313aa52f096f03226f335db052ad47847a289dd50a8a3a46667f3` |
| [IRC §172](https://uscode.house.gov/us/usc/119-120/t26/s172/) | Current through Public Law 119-120, October 7, 2026 | `a9c2b2685801fb5936c6e66762675eb847dbce05f23df7cdf27ce268a2dc7a15` |

The finite cohort is a single taxpayer's primary-owned, active domestic cash farm with raised-product receipts and current paid-and-used seed expense. Every other original Schedule F receipt and expense box is explicitly known zero. The sources must establish full at-risk and nonpassive treatment, empty prior limitation histories, deductible seeds after all applicable farm limits, and no prepayment, §464 limitation, tax shelter, required §263A capitalization, accounting/basis election, capital cost or preproductive cost.

The independent regular and AMT original ledgers bind the actual canonical farm identity, owner, tax year, receipts and expenses. The existing same-basis AMT conditions remain. The method also requires a complete actual reconciled Form 461 packet and known-empty independent regular/AMT prior NOL histories. Other businesses, cancellation of debt, itemized deductions and additional attribution methods remain rejected.

The waiver records must identify an original calendar-2025 return filed January 1–April 15, 2026, with its statement executed no later than filing and attached to that return. Extension, amended-return and planned-election paths are rejected. These are source facts and confirmations, not proof that software authenticated an IRS acknowledgment.

## Calculation and verification

Each original ledger runs through the existing cash Schedule F calculation. Each farm-only §172(d) origin is independently recomputed after the actual Form 461 limitation, then capped by its own full regular or AMT NOL. Verified waiver means zero carryback use. Current EBL remains a separate addition to the forward carry, once. Existing nonfarm current-origin calculations are preserved.

| Fictional original facts | Full regular NOL | Full AMT NOL | Separate EBL | New regular / AMT carry |
| --- | ---: | ---: | ---: | ---: |
| Receipts 10,000; seeds 110,000; wages 20,000; interest 5,000 | 80,000 | 75,000 | 0 | 80,000 / 75,000 |
| Receipts 10,000; seeds 510,000; same wages/interest | 293,000 | 288,000 | 187,000 | 480,000 / 475,000 |

The first source-backed canonical tests genuinely failed the existing unsupported farm guard: three failures and two negative controls passed. Final focused `pnpm test` passed **84 tests across eight files**. Strict test-reference and spec-validator suites passed **958 tests**, and all five new CLI spec references resolved. Root TypeScript and owned-file lint passed. Source cents remain exact before presentation rounding; original source references, election dates and EIN remain absent from the result/audit and actual verified-AI, hosted-shell and provider projections.

An independent reviewer reconstructed the exact farm-only overlay from base `6bacf762`, excluding concurrent foreign-income changes. It verified all eight source pins and four official body hashes, then passed **11 tests across two files**, including six independent tests. Those tests cover both full-origin caps, changed wage offsets, EBL conservation, source cents, known/unknown facts, malformed independent AMT originals, invalid waiver dates and privacy. These are engineering checks against official authority, not qualified human tax review.

Private, ignored evidence:

- Author source freeze: `.local/upgrade-evidence/nov14-form172-farming-waiver/SOURCE-FREEZE.json`, SHA-256 `7539f9d6e72662b8e54884cbd572a994e3fcbd480cd3f3ba050bcc9f2f58c5d0`.
- Independent review: `.local/upgrade-evidence/nov14-form172-farming-independent-review/REVIEW.json`, SHA-256 `2566b64dcfde19ce4c8ab2b50a0e8b79141b972c3af8bc188bf65e00003ce4bc`.

The original RED, an optional-field implementation failure, initial typecheck failure and canceled accidentally broad test invocation are retained separately. No cloud, provider, production or native VM operation was performed for this package. Qualified human review, final annual forms, unsupported carryback/history methods and the broader release gates remain required.
