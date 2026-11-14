# Human tax review source delta: guided K3 at 33f8f784

This is an **unassigned source index**, not a tax opinion, independent calculation or approval. The [November 4 packet](upgrade-2026-independent-review-packet-20261104.md), [November 14 nine-case assignment](upgrade-2026-nov14-human-tax-review.md) and [source delta through 9b6202e7](upgrade-2026-human-tax-review-delta-9b6202e7.md) retain their original source boundaries. This separate delta supplies the later guided qualified K3 source package at commit `33f8f7845be607a7de07d38cddf6de099377dcc5`, tree `f12eaf9d72d4b787e81a7f5bef937326353f7dd9`. It does not carry forward any earlier human decision or expand the six original state/residency assignments.

Reviewer identity, qualifications, independence, accepted scope, authority findings, independent worksheets/results, decisions and signatures remain blank. No reviewer has been assigned and no outreach is recorded.

## Detached sources and blank worksheet

Private delivery folder: `.local/upgrade-evidence/nov14-human-tax-review-delta-33f8f784/`.

| Artifact | SHA-256 |
| --- | --- |
| `source-delta-index.json`: thirteen exact committed sources, modes, Git blob IDs, sizes, byte digests and comparison with the 9b boundary | `b0953ad41429d52a2353ac82efd3cb5d2629f17e31b7c9fe15a2381cb10b9e59` |
| `UNASSIGNED-DECISIONS.json`: two blank year-specific human decision rows, bound to the source index | `94ad3c996e18ba5425872271da12f13520159a4631faa91fe3d006a23505a29a` |

The thirteen files are copied verbatim into `sources/`. Every recorded author hash was checked against the committed Git blob and current unchanged source bytes. The author's pre-commit receipt is retained separately with SHA-256 `19268e829bee80bb3b2290626899bfb3a97f46bcd41cfda2c7716860fe60e413`; its recorded pre-commit head is not mislabeled as the committed source. The source commit binds the whole checkout; this selected delivery is not a replacement for necessary engine or imported-fixture dependencies.

## Scope for a qualified reviewer

Review the actual-source admission of the existing §904(j) election without Form 1116, separately for the fictional 2025 and 2026 originals in `guidedForeignTaxK3Fixture(year)`. No engine tax formula changed in this package. The new guide admits only an actual qualified Schedule K3 (Form 1065) from a continuing domestic non-PTP partnership, complete passive-category foreign portfolio interest/dividends, exact fully basis-allowed current foreign tax, and explicit zero other K1 boxes/basis changes/prior basis, at-risk and passive suspensions. Portfolio income excluded from passive-activity income under §469 is distinct from the foreign-tax-credit passive category.

Originals must establish owner/recipient, actual tax year, entity EIN/name, K1 and qualified K3/country references, actual amounts, opening outside basis and its source, complete history and annual tax eligibility. The collector reconciles foreign income to interest plus ordinary dividends; qualified dividends are a subset. It matches the annual source row, including a positive-income/known-zero-tax source. It does not fabricate a statement account or payment date for the K3.

Derive the source eligibility, basis allowance, annual aggregate, exact $300/$600 joint-election boundary and applicable rounding independently from the fictional originals and authority **before** comparing saved specifications or engineering expectations. Include exact-threshold and fractional-excess variants, one-cent basis shortage, blank versus known zero, a bare K1, unsupported source insertion, and changed identity/year/annual reference. Establish that every actual 1099 and K3 source is included once. The detached blank worksheet requests the independent calculation and its digest; this delta supplies no new expected tax outputs.

Authorities recorded in the package's November 14 source review are [§904(j)](https://uscode.house.gov/us/usc/119-118/t26/s904/), [final 2025 Form 1116 instructions, election without Form 1116](https://www.irs.gov/instructions/i1116), and [§469(e)(1)](https://uscode.house.gov/us/usc/119-118/t26/s469/). They are references for independent review; this source-index work performed no new authority fetch and does not convert current final 2025 instructions into final 2026 instructions.

Bare K1s, Form 1116 and deduction methods, S corporations, PTPs, mixed-source allocations, other K1 boxes, old suspensions, basis shortages, territorial or other unqualified annual source facts, and composition with separate guided qualified-loss, charitable or current-minimum-tax-credit original packets remain rejected. An annual eligibility flag alone establishes no legal election or source fact. Review of this finite cohort establishes no broader pass-through method.

## Exact package bytes

| Committed source | SHA-256 |
| --- | --- |
| `spec/federal/foreign-tax-direct-credit.yaml` | `0de20fe70fba38c4a89c2785cbe712e9daf47f230c9cdb39084694094dd6e0fa` |
| `apps/web/src/components/guided-interview/foreign-tax-election-details.tsx` | `c6f0d8c0ccc353212c7f16d83832ec1d08e3ca4d0b77c0b35f29dd25c352c74d` |
| `apps/web/src/components/guided-interview/foreign-tax-k3-details.tsx` | `7987497522f8971600d1940b5a4ba2f2fcd580625aa464a8bfb48f3e5adfa610` |
| `apps/web/src/lib/guided-foreign-tax-election.ts` | `2cc8f8378a03ab26aa4350f208c08c061f99566a7811d2357b62455598eaf8e0` |
| `apps/web/src/lib/guided-foreign-tax-k3.ts` | `f0ae6f87972ad25cdeab3e5f5fc3882f6339127c998aa93f2f0441cc5d82e609` |
| `apps/web/src/lib/guided-interview-bridge.ts` | `63561d3fc5e42a1bc90aacb707c0f8d8159ab2bf448612cdaf19469888c33e18` |
| `apps/web/src/lib/guided-interview-flow.ts` | `be4692c875cf1d8aad1d8b5cec84b91c71a97debbb5a64bd32ba94d7d0140e92` |
| `apps/web/tests/guided-foreign-tax-k3.spec.ts` | `c29c1ca05ec7463bf49bc908104a57bc673f1f7f4ae6987751cfd38dca09bf8e` |
| `tests/fixtures/guided-foreign-tax-k3.ts` | `032fcca50ebe310cc2e823f27e249b724de4c1130353e83daf7bbe8a105f4808` |
| `tests/guided-interview/guided-foreign-tax-k3.test.ts` | `a878da36c639c5432abd68391a8775f3f063d18470ce8a0981c2c00d4ab66ec5` |
| `tests/guided-interview/guided-foreign-tax-k3-independent.test.ts` | `512249ee3ce5f6d66687266e23296c46504174f6b2f19da2ebc20c3e5d00f1f8` |
| `tests/apps/web/guided-foreign-tax-k3.test.tsx` | `e6096445a67bd7992fb00de05f9fe5d9d8b26b68728de0ffa5131ba58ad88020` |
| `scripts/browser-request-budgets.json` | `9ebb650db30759689ed1c0c5decc83d96c8411ea19ad259789bc640d99b85458` |


The [hosted K3 ledger](upgrade-2026-hosted-k3-20261114.md) separately records two actual synthetic 2025 source journeys, retained harness/admission failures and cleanup. Local tests exercise the year-specific collector in 2025 and 2026, but tests and runtime evidence are engineering evidence. They do not supply independent human labels, a complete 2026 return, final annual forms, filing qualification or model-promotion authorization.
