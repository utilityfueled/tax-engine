# Ohio SD 100 resident income successor ledger

Status: isolated helper implemented after genuine missing-module red; bounded checks pass. Independent review and canonical source admission remain pending. Internal 2025 earned-income lines 29–33 only.

Source refresh on November 2, 2026: final 2025 booklet printed pages 59–61 and final SD 100 form available; the old DOR schooldistrict and school-district-income-tax-page paths returned 404. The bare statute now describes January 1, 2026; the three actual 2025 versions of section 5748.01 were reviewed separately. The applicable individual earned-income and resident-period definitions agree. Evidence contract: `.local/upgrade-evidence/nov02-ohio-payment-sources/sd-resident-income-successor/source-contract-before-spec.json`.

The published Eric/Angela amounts are 58,000 resident wages, 89,000 annual SE, .5863 residency factor, 9,000 annual federal adjustments, and 4,000 specifically pre-move 529 deduction. Expected reported cells: 58,000 / 52,181 / 110,181 / 104,904 / 104,904. The global-MAGI factor shortcut produces 97,326 and cannot reproduce the original.

The booklet does not supply annual wages or a prior district code. Both remain explicitly not supplied. A separately labeled synthetic full calendar uses prior 9999 only to exercise the published numerical original with the same 214 selected days. That synthetic input is not an asserted actual taxpayer fact. Known annual 529 amount 4,000 remains known alongside actual resident zero.

- [x] Exact committed private base and five-path ownership receipt.
- [x] Official sources refreshed; contract before spec.
- [x] Spec before fixture/tests; eleven meaningful tests, including signed SE, annual cap, source-specific allocation, full calendars, differing joint timeline guard, one-day factor, and nonprivate audit.
- [x] Genuine missing-module red on this source; product absent and receipt retained as `missing-module-red.json`.
- [x] Product after red; first output 85/85 green across 11 new plus 74 existing SD 100 tests.
- [x] Root/web/contracts types; Ohio specs 333/333; owned ESLint with zero warnings. Full-year line 32 uses actual annual MAGI as the printed instructions require; known annual/resident conflicts are guarded.
- [x] Frozen five-file source, patch and manifest at `state-05-green` for root.
- [x] Independent scoped review:16 independently derived controls plus11 author and74 existing controls pass101tests/3files; exact frozen five-file bytes and all4,161 unowned base files remain unchanged.

Separate canonical gates remain: actual source completeness/identity/year/classification, per-owner residency proof, district existence/type and tax effective dates, different joint owner timelines, full traditional district method, payments and prior sources, penalty methods, physical forms, filing and final 2026 qualification. No shared adapter/model, frozen OH18, guide V2, or canonical eligibility changes are in this package.


Root current-main checks pass191tests/3files, all three type checks,6682/6682
spec references, inventory generation/check, zero-warning strict owned lint and
library build. Receipts are `.local/upgrade-evidence/nov02-parent-ohio-sd-main-checks/checks.json`
and `nov02-ohio-sd-resident-income-independent-review/independent-review-result.json`.
Independent receipt SHA256:b9a1d7bf0ca32b752a5934b02c7d1d2f85a92c3f45ba03a12bcba5a714a6ef97.
These checks establish the pure final2025 worksheet only. The separate canonical,
source, district, printed-form and filing qualification gates above remain open.
