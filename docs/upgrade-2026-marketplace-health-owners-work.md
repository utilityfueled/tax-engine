# Actual two-owner Marketplace health deductions

## Scope and status

Private implementation after `31a1c4a`; exact snapshot `3358091cc06fa1cea1f88ee6629f3d338ba4fad7` has completed bounded independent agent review and verification. Final scoped integration is based on `d1d1ff04c46236afb45acaf6df8dc58e12ef6317`, with rule metadata `2025.104` / `2026.100-law-integration-draft`; filing/readiness statuses are unchanged. The existing Form7206 sources already identify the plan, original Marketplace policy, payer, covered person, business and actual primary/spouse owner. This package replaces the blanket multiple-owner rejection for the bounded method below. It adds no current deduction input, taxpayer income override or fabricated ownership allocation.

The package changes the owner attribution helper and its Form7206 caller, retains its audits in the review PDF, and proves that the existing guided controls can supply an actual primary Schedule C plus spouse shareholder W2. No guided product or root schema changes are needed. A direct-source C/F pair and multiple businesses of one owner are also exercised.

## Controlling sources and derived method

Refreshed 2026-10-25:

- [IRC162(l)(2)(A)](https://uscode.house.gov/us/usc/119-120/t26/s162/): the taxpayer's earned-income restriction.
- [Reg1.162(l)-1(a)(1)-(3)](https://www.ecfr.gov/current/title-26/section-1.162(l)-1): premium/credit and nonadvance-plus-repayment constraints; specified premiums.
- [RevProc2014-41 sections3,5.02,5.03](https://www.irs.gov/pub/irs-drop/rp-14-41.pdf): permitted methods, the Simplified calculation sequence and its limits.
- [Pub974 Worksheet W and Simplified steps](https://www.irs.gov/publications/p974): separate business rows, combined return deduction, and the published reasonable allocation of credit by enrollment premiums.
- [Form7206 instructions](https://www.irs.gov/instructions/i7206): business-established plans and source limits, including more-than-two-percent shareholder wages.
- [Reg1.199A-3(b)(1)(vi)](https://www.ecfr.gov/current/title-26/section-1.199A-3): health deduction attribution using the individual's actual gross income used in calculating the deduction.
- [Reg1.6013-4](https://www.ecfr.gov/current/title-26/section-1.6013-4): the joint return combines two taxpayers' income and deductions; separate self-employment calculations remain.

For this supported route, each owner's combined remaining earned income covers all of that owner's specified premiums, and the combined maximum equals all specified premiums. No spouse income borrowing or residual from a binding repayment cap is needed. Initial 2025 Worksheet W attribution is each owner's actual premiums less attributable advances. The maximum stage uses each owner's actual specified premiums. Final eligible attribution is each owner's sum of actual premiums after the already computed Step2 allocated credit. Its combined amount must reconcile to the canonical joint specified deduction.

Only after that owner attribution does QBI use actual gross income within the same owner. A shareholder's nonQBI deduction is not charged to the other spouse's business. This is a derived interpretation of the cited sources, not a published IRS two-owner numerical oracle. The existing joint whole-dollar transfer and deterministic reporting reconciliation are retained; exact original cents are not changed to force a display sum.

## Independent literal controls

- Primary C30000, spouse F20000, premiums6000/3000, benchmark8400, no advances. Separate SE half deductions2119/1413. Step1 income37468; 183% of20440 and .0132 produce495 contribution and7905 Step2 credit. Net premiums are730/365, joint deduction1095. Final AGI45373 gives1289 contribution and7111 final PTC. Joint gross-income60:40 is not used to split the owners' deduction.
- Existing guide: primary C30000, spouse shareholder W2 Box1 20000 including premiums, Box5 17000; same actual policies. Step1 income38881 produces7778 Step2 credit; joint deduction1222 and final AGI46659/PTC6944. Primary QBI receives815 after whole-dollar reporting, and the spouse shareholder's407 remains nonQBI.
- Multiple businesses of one owner: primary C30000/F20000, spouse W2 20000, premiums6000/3000/3000. Step2 credit10073 and joint deduction1927. Primary net1445.25 is split by its30k/20k gross ratio to867.15/578.10; spouse net481.75 stays separate.
- Isolated 2026 constants: original zero or full advances preserve Step2 credit6343, joint deduction2657 and final credit5395; full9000 advances produce3605 repayment. Actual 2026 full-return readiness remains closed.

## Verification

The original missing-helper and blanket multiple-owner failure were reproduced before implementation. Exact snapshot `3358091cc06fa1cea1f88ee6629f3d338ba4fad7` passed 260 tests across 36 files, root/web types, all 4,989 spec references, scoped lint with zero errors and five pre-existing PDF warnings, and the production web build. The cohort covers pure calculations, canonical returns, actual guided source conversion, real controls, saved PDF output, and adjacent Marketplace/passive/NOL/QBI methods. Logs are retained under `.local/upgrade-evidence/health-owners-exact-{tests,types-spec-lint,build}.log`.

The parent independently refreshed Pub974 and the individual-gross-income rule, read the source/calculation/PDF changes, and passed 15 tests across seven files, including three private probes. Those additional probes cover partial specified-premium/APTC shares, plan order independence, and balanced owner redistribution in both retained audit containers. Review evidence is in `.local/upgrade-evidence/parent-health-owners-review.log`; the review probes remain outside the committed source. This is bounded agent software/source review, not human tax/form qualification.

Both generated review PDFs were saved, independently reopened with pypdf, and rendered. Each has four pages and 18 physical fields; every page retains the review notice and no synthetic SSN remains. All eight rendered pages were inspected, with full-size owner-section review on primary page4 and spouse page3. The source-derived owner audits reconcile fresh calculation to both retained audit containers and reject missing, duplicated or changed amounts; the joint transfer is clearly nonadditive. Parent re-open/visual evidence and exact PDF SHA256 hashes are in `.local/upgrade-evidence/parent-health-owners-pdf-review.json`, and the PDFs/PNGs are under `.local/upgrade-evidence/health-owners-render/`.

Final integration will retain the reviewed executable/spec/test blobs unchanged and record its fresh metadata/rebase checks separately.

## Finite remaining owner methods

1. Binding owner earned-income limits or binding combined 2025 repayment-cap deduction: explicit internal implementation still required; no arbitrary ownership ratio is supplied here.
2. Within-one-owner multiple income sources that lack the existing actual gross-income contract, including some K1/shareholder mixtures: preserve the existing precise source-method guard.
3. Existing excluded Marketplace methods, including special coverage/allocations outside the separately completed shared-policy and marriage contracts, remain governed by their own documented boundaries.

These are distinct from independent human tax/form qualification and closed filing gates. This package does not claim either qualification or general completion of every multiple-owner scenario.

## Final integration checks

All 13 executable/spec/test/fixture paths are byte-identical to independently reviewed `3358091`. The final rebase changes only the owned evidence ledger and adds the separate rule-source record/version. Fresh final source tree `d7536604ecc0ff2d811fe336e956e67a1d98f0f5` passed 21 tests across eight files, including package/metadata/strict-spec checks, root/web types, and all 4,996 references. Logs are `health-owners-final-tests.log` and `health-owners-final-types-spec.log`. The only subsequent difference is this completed evidence text; all reviewed source and metadata blobs remain unchanged.
