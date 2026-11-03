# Native Pennsylvania return facts and residency tests

These tests exercise the actual React controls for 2025 on base `944eb778ecadb0aebd70c033fe38faebbf077045`. They mount each source panel with React state, enter records through native inputs and selects, and pass the confirmed result through the guided builder to the state calculation. Six cases exercise ordinary return facts and four exercise residency.

## Original records and expected amounts

| Source | Expected result |
| --- | --- |
| Resident W-2 wages of 50,000, bank interest of 120 and PA withholding of 2,539 | Tax on 50,120 rounds to 1,539. The 1,000 overpayment funds a 700 refund, 200 credit and 100 donation. |
| Domicile moves from New York to Pennsylvania on July 1 | Early PA services of 6,000 and all 20,000 of later wages produce 26,000 compensation. September personal interest of 40, dividends of 1,000 and a 300 RIC distribution produce 27,340 taxable income. Tax is 839, leaving 40 after 799 withholding. |
| Same annual bank and fund originals, changed actual credit dates | The 40 September bank credit moves to June 30. The 1,200 March fund credit moves to July 1. PA income becomes 28,500 and tax rounds to 875. |
| Two first-quarter receipts of 125.39 and 70.62, and separate evidence of a 37 credit | Estimated payments total 196.01. The prior election and current account statement both establish the separate 37 carry. |
| Prior filed PA-40 and Schedule SP | Prior taxable income of 3,000 produces 92 tax. The unmarried claimant had no dependents and no additional eligibility income. The 100% schedule must reconcile to the 92 forgiveness on the return. |
| Philadelphia goods purchase of 125, tax paid of 2 and an unrelated 125.50 gift from outside the household | Use tax is 8. The gift adds 126 to worldwide eligibility income, which becomes 50,246. |
| Actual April 15 balance remittance of 40 | The dated receipt identifies the PA-40 balance. Estimated and extension payments remain zero. |

The underlying resident, part-year, refund, investment and family originals come from the repository fixtures. Additional receipts and documentary elections are fictional test inputs. The complete family original names one son and two parents. Only the son qualifies as a PA dependent child. Blank inputs, mismatched source records, duplicate receipts, stale identity and incomplete dependent reviews each exercise a rejection or reconfirmation boundary. Saved drafts use a JSON round trip and a fresh mount. Privacy checks distinguish private source entry from what the panel or audit exposes.

The PA-40 instructions establish the 3.07% rate, the resident and nonresident income distinction and the Philadelphia use-tax rate. Section 121.8 governs the part-year periods, and the prior-year SP instructions supply the 100% forgiveness bracket. [2025 PA-40 instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf) · [61 Pa. Code § 121.8](https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/061/chapter121/s121.8.html&d=reduce) · [2024 PA Schedule SP](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2024/2024_pa-40sp.pdf)

## Verification

The two new YAML records name all ten mounted cases. Literal expectations were calculated from the source amounts with Python Decimal before any candidate execution. Pre-execution oracle SHA-256 `1898d645aef3442f91126616c9af6e20c1c8b32198ec49752aa3a436aa41ae59`.

The first run passed nine cases. The payment case proposed a prior credit from the base fixture's explicit no-return history. The existing confirmation correctly rejected it. The corrected test retains that rejection, supplies a fictional filed 2024 PA-40 with 10,000 taxable income and zero forgiveness, and exercises a separate 37 election versus 36 available-credit mismatch before correcting the available amount to 37. The first-run log SHA-256 is `755dc5d77fe79708b05780aec80c7f1b6b3efdaa6e8b60a2eb6ba978c0a0e5be`. All original amount assertions remain in place.

With that source correction all ten cases passed across two files in 3.00 seconds using one worker, followed by the root, contracts and web typechecks. The test log SHA-256 is `53aef32636c00d872eb36d9d6a60609886fdf7ba3b38e60d7cc14b28165d030c`. Strict lint then found one non-null assertion on the fixture's actual fund statement. The handoff replaces it with an explicit presence check. Strict lint, spec validation and integration of that final delta are recorded separately by the parent workstream.

```sh
pnpm test tests/apps/web/pa-ordinary-facts-native.test.tsx tests/apps/web/pa-residency-native.test.tsx --maxWorkers=1
```

## Current-main integration

On852563ea, allten mounted cases, three types, strictlint0,7,310spec links, strict AST references and inventory/check pass. Ten commands and exactlog hashes are retained under .local/upgrade-evidence/nov03-root-native-ordinary-residency-green/checks.json; integration receiptSHA256 733fa66d6537d942375c2f0c00dc9425fdba73aadb68c00b00cc1881f5685115. Both production panels retain exact944eb778 source bytes. This is mounted DOM evidence, not real browser or hosted qualification; full function coverage and suite gates remain open.
