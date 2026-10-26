# Actual Pennsylvania royalty property sources

This method calculates Pennsylvania royalty income from the original gross receipts and separately classified expenses. It does not copy the federal net. Each property retains its actual owner, tax year, nonbusiness classification and full-year Pennsylvania residency confirmation. Original expense identity, date, category and amount must reconcile before a state deduction is calculated.

## Official source and calculation

Refreshed 2026-10-26: [final 2025 PA Schedule E instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40e.pdf) and the [Pennsylvania personal income tax guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/net-income-loss-from-rents,-royalties,-copyrights-and-patents). Supported original copyright, patent and nonoperating mineral property receipts enter line 2. Actual commissions, insurance, legal, management and property-production taxes enter lines 6–9 and 14 only after their state classifications reconcile. For mineral rights, actual surface expenses remain separately audited and excluded. Sum each category with Decimal, then round its printed line once. Lines 19–21 retain total expenses and signed property net. The actual owner's Class 6 total controls the transfer; one spouse's class loss does not reduce the other's positive class income.

An independently entered state net or a federal allowance is never a substitute for the original property method. Missing state answers remain unknown. Existing unconfirmed legacy gross previews remain separately bounded. Business/NIL, dispositions, depreciation, depletion, interest, loss histories and part-year/nonresident methods remain separate; the complete source method cannot silently infer their treatment. Matching 2026 source dates can exercise the pure state calculation, while final-form and filing gates remain closed.

## Review output

The reference summary identifies the actual source year and each property's printed PA category, owner, gross, allowed expenses, excluded surface expenses and net. It retains zero-net properties and keeps each property together across pages. Its internal aggregate labels no longer claim false printed line numbers. Every page carries the review-only notice. A request-local opaque context recomputes the original PA state calculation before render redaction, then rejects changed original receipts or retained state results before template/output access. The summary is a reference, not an official filing copy.

## Evidence

- Spec-first source cases failed before implementation: five failures and one pass in `pa-royalty-source-red.log`. The retained expected outputs use literal PA category rounding and separate-owner totals, including $12,000.25 gross, $49.25 legal expense and $950.50 management expense producing $11,000 PA net; the federal unrounded source net remains separate.
- The source cohort passed 18 tests in three files. The broader affected cohort passed 1,020 tests in 64 files (`pa-royalty-cohort.log`), covering PA calculations and references, royalty intake, federal Schedule E, workspace export and readiness controls.
- Two reference/source-context cases failed before the PDF implementation. A later source fixture initially omitted a second original K-1's required EIN and ordinary-income field; the fixture was corrected without changing guards. The new pagination assertion also failed before property blocks were kept together (`pa-royalty-pagination-red.log`).
- The first frozen tree `4a9fd9d60787112f7b3f156243decdc988340249` passed 12 focused cases in three files, root/web types, 5,263 spec references and scoped lint (zero errors, nine warnings). Three saved references with five pages were reopened with an independent pypdf reader and visually inspected; actual amounts, all seven zero-net properties, page notices and private-source omission pass (`pa-royalty-artifacts/manifest.json` and `reopened.json`).
- Independent software review found that the public Schedule E helper ignored actual household status when its optional duplicate status was omitted. The canonical orchestrator already supplied both. A retained spec-linked red test reproduces improper spouse-loss offset; the fix uses the actual taxpayer status and retains conflicting-override rejection. The corrected freeze and unchanged independent probe are recorded before integration. This evidence is not human tax qualification or public-hosting readiness.

The actual Pennsylvania source collector is a separate follow-through. This core package alone does not claim that guided intake, final 2026 forms, all royalty methods or the entire state upgrade are complete.

## Integration review

Corrected frozen tree `6176dc7641c8d57f19ca0d7bf6d614ace779bd7d` passed 13 focused tests in three files, root/web types, 5,264 spec references and scoped lint (zero errors, nine warnings). Independent review verified all 15 owned hashes and passed 17 cases in four files, including its four unchanged probes. The omitted-status defect is fixed without changing explicit mismatch rejection. Review log SHA-256: `147835774e7faf34fe42a4469baedd5a2b7a8e4fa8c7dfe6ed6e8e514ccf4dc8`.

The package is integrated on top of passive-distribution commit `2669c37`, with the 14 non-ledger source/spec/test blobs unchanged from that corrected review. Rule versions advance to `2025.128` and `2026.125-law-integration-draft`; calculation, final-form, filing and human-review gates are unchanged. The local three-PDF/five-page inspection is bounded artifact evidence and does not establish staging or filing qualification.

Final integrated checks pass: 332 tests in nine affected files, root/web types, 5,277 spec references, metadata lint and diff checks (`pa-royalty-integrated-checks.json`). The broader 1,020-case cohort and separate 17-case review remain scoped to their recorded trees.
