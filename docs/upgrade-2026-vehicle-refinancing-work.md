# Actual vehicle refinancing

The ordinary original-borrower method now computes qualifying interest from the original purchase loan and each refinancing. Source records retain actual purchase costs, down payment, principal, prior outstanding balances, dates, lender/account identities, first-lien and related-party answers, and current-year interest and exclusions. Cash-out and nonqualifying portions never increase qualifying debt. Per-loan interest stays exact through the existing return cap, phase-down and whole-dollar rounding.

Sources refreshed October25,2026: [T.D.10054](https://www.irs.gov/irb/2026-39_irb), final1.163-16(d)(2),(4),(6),g andi, and [IRC163(h)(4)](https://uscode.house.gov/us/usc/119-118/t26/s163/). The regulation was published in September2026, is effective November9,2026 and applies to2025-2028. This record distinguishes the future effective date from its stated applicable years. Original-cost controls use the published40000/42000 negative-equity and36000/40000 financing examples; refinancing extensions are independently derived controls, not published IRS examples.

Spec preceded four failing cases. Initial implementation passed the new cases but exposed an existing expected refinancing error, repaired by explicitly rejecting absent records. A subsequent new exclusion test correctly encountered the earlier aggregate schema rejection; its expected message now includes that existing rejection. No old assertion or guard was removed. Frozen seven-path source manifest is `.local/upgrade-evidence/vehicle-refinancing-core-snapshot.json`, base2fdbb03. It passes55focused cases,69adjacent cases/9files, root types and4720spec references.

Separate agent review refreshed the final regulation and inspected all seven paths. Five package cases plus independent exact624.25 and525 controls, eight source mutations, lost original first-lien qualification and input immutability passed with no actionable finding. This is source/software review, not independent human tax qualification.

Changed borrowers, further advances, capitalized additions and unusual payment timing require their separate actual methods. The guide is a separate follow-through package. No year, filing, readiness or model gate is enabled. Rule versions advance to2025.79/2026.75-law-integration-draft.

Evidence SHA256 under `.local/upgrade-evidence/`:

- `vehicle-refinancing-before.log`: `022aac9fd5d6b6c3cb5c58300efee55eb362d2bf98c41b3c294fde34bdc017b5`
- `vehicle-refinancing-core-tests.log`: `eeff24aa219f4a8ddb26946e78f7fab0c67e9943b6dbec9517c1dda726ad4198`
- `vehicle-refinancing-core-adjacent.log`: `64312cac6470deb86b4639a5668d4cb19d6af68ec66b79a341dbc00b6edcabae`
- `vehicle-refinancing-core-types.log`: `658a474fdf7395d031ce697707440a108f5084c38f69ec7bcd941991a8968c11`
- `vehicle-refinancing-core-spec.log`: `0c19da4da847fe6a7a002e843255a6cecc75b6a354e0d6371b18a722e614158c`
- `ai-vehicle-refinancing-review.log`: `526463128a51c7cdd77dc14b50b085de2422f6a3755f537288985270c039a44d`
- `ai-vehicle-refinancing-probes.log`: `197150b75d76aa76973c808ec41bf71b0374e3fa534f5cd5cc956bcee8b72d8e`

Final isolated tree `2ba41969c0a66e4f1bad031ea5a0efe2a7514dfb`, rebased onto `9ce1686`, passes72tests/10files, root types,4728spec references and scoped lint (zero errors; one pre-existing senior-owner non-null warning). Only the two vehicle schema additions are staged from inputs; concurrent adoption changes are preserved.

- `vehicle-refinancing-final-tests.log`: `4ab2278340c5d5083dfd8c95075bcfea77206d102c95738241e0e74342861f18`
- `vehicle-refinancing-final-types.log`: `408e31adcbaf39fb7d6ba6382a2a7f182b5b4469c2c00e004167f1bad449b309`
- `vehicle-refinancing-final-spec.log`: `6c8b0fd8f5a954b88649328bc75a2c94a5c37666aa8c026c86dc0d45aff0ea4e`
- `vehicle-refinancing-final-lint.log`: `718b5c15c798cf00780587998893806434707323ae1ce8683801d3ad18eb97cb`
