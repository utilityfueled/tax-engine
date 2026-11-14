# Pennsylvania secondary-market debt discount: November 14 source check

The original corporate tokenized-debt full-sale method remains available for federal and Ohio estimates. Pennsylvania positive original market discount remains rejected. This check found useful disposition and basis authority, but did not establish which Pennsylvania income class receives secondary-market discount recognized federally under IRC §1276. No calculation, election, taxpayer fact, filing gate or PA admission changed.

## Controlling sources and the unresolved boundary

[61 Pa. Code §103.13(a), (c), (e)](https://www.pacodeandbulletin.gov/secure/pacode/data/061/chapter103/s103.13.html) establishes disposition gain from proceeds less adjusted basis, ordinarily acquisition cost, with the prescribed adjustments. Its separate-class rule prevents duplicate taxation; it does not choose the class for this discount. The [Department of Revenue's Net Gains Guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/net-gains-losses-from-the-sale%2C-exchange%2C-or-disposition-of-property) expressly includes bond dispositions and explains independent Pennsylvania basis, profit-only losses and residency sourcing.

[61 Pa. Code §103.16(a)–(c), (f)](https://www.pacodeandbulletin.gov/secure/pacode/data/061/chapter103/s103.16.html) separately includes debt-use charges in interest, expressly addresses original-issue discount and accrued coupons, and adopts the federal computation for unstated or imputed interest. It does not expressly identify secondary-market discount under §1276. The [PA Interest Guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/interest) and [DOR answer 3453](https://revenue-pa.custhelp.com/app/answers/detail/a_id/3453), updated August 28, 2026, did not resolve that distinction. [Final 2025 PA Schedule A](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40a.pdf) starts with federal taxable interest but also requires additions and reductions; silence about market discount does not establish conformity.

The precise unresolved question is: for a nonbusiness, secondary-market USD corporate debt purchased after original issuance, sold completely for cash, with no OID, premium, accrued coupon, prior discount inclusion, timing election, partial principal recovery or selling adjustment, does Pennsylvania classify the federal §1276 amount as interest or retain the entire separately documented proceeds-minus-PA-basis result in the disposition class? If interest, what controlling authority determines its amount and corresponding disposition adjustment? Independently documented PA cost basis alone does not answer that class-allocation question. This is a bounded research result, not a conclusion that no authority exists. No external question was sent and no human review was inferred.

## Source custody and verification

Public official bytes were refreshed on November 14, 2026, at approximately 21:28–21:29 UTC. The initial sandbox network failure and successful HTTP 200 retry are both preserved privately under `.local/upgrade-evidence/nov14-pa-market-discount-recheck/`; the retry did not access credentials or private accounts.

| Official artifact | SHA-256 |
| --- | --- |
| §103.16 HTML | `a30dc7d07c7a3d157f2570ce1658efdbcbf27b834ad497968a41615524a441de` |
| §103.13 HTML | `daf98de3a1e073b992dea13c05484e995963b966c993bcbc25c9b8158a91574c` |
| PA Interest Guide HTML | `5eb9df79a5e80c3185ebc9b6a71246e17420ea534ad9aa1c59d1f318d6e2b3a4` |
| Final 2025 PA-40 Schedule A PDF | `dd32da96a856d033725e772c9a7dc4339131b4abe776e4caa4e7de722c0cbfce` |
| DOR answer 3453 HTML | `611b36d2695fb10750e6086a1a63babbf669bdc7f64fe4a26cd4944f62dd096d` |
| Tax Reform Code HTML | `fbeb9475ab2cc4483121556709b4fe94959c78f3af2c2b044481eaee2519d9f4` |
| PA Net Gains Guide HTML | `ae8fbcb995efe863d23048c1ce2563015c95500186ea128e98f703c57509651b` |

The actual guard is in `src/engine/state/digital-asset-sources.ts`, with its source boundary in `spec/federal/form-1099-da-market-discount.yaml`. Existing focused tests passed: **3 files, 16 tests**, covering federal original-source market discount, the independent manual federal cases and state digital-asset sources, including the explicit positive-discount PA rejection. Logs are preserved as `existing-guards.stdout` and `existing-guards.stderr`. No new tax implementation was admitted on the basis of an analogy to imputed interest or general bond-sale language. Final annual 2026 forms and qualified human review remain independent release requirements.

Separate engineering review rehashes all seven official artifacts and both logs,
checks the precise OID/imputed-interest distinction and independently reruns the
same three files: sixteen tests pass. Its receipt is
`.local/upgrade-evidence/nov14-pa-market-discount-independent-review/REVIEW.json`,
SHA-256 `9a1baa6515d483a9344817ce4d620509a492f1309d4439ee34b4747e7dbefc96`.
The original source-research receipt is
`nov14-pa-market-discount-recheck/RESEARCH-RECEIPT.json`, SHA-256
`74e59504db997aef48e37bded052a7de76a68212d0c1df4fc21e984c3cc75c56`.
Neither engineering review supplies the missing qualified tax decision.
