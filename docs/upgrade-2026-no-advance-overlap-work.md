# Overlapping no-advance Marketplace policies

This package implements a bounded Situation 3 source method for concurrent original Marketplace policies. Each original premium uses the full monthly benchmarks of its two actual tax families. The current return's full benchmark enters the household month once. Actual concurrent unshared premiums and advances remain included once. The guide collects the complete monthly family and location records, and the review PDF displays the resulting group trace.

## Source derivation

Refreshed October 26, 2026:

- [Treas. Reg. 1.36B-3](https://www.ecfr.gov/current/title-26/section-1.36B-3), paragraphs (b)(2), (f)(4), (f)(5), and (h)(1): monthly coverage-family membership, applicable benchmark groups, and the premium allocation between tax families.
- [Final 2025 Form 8962 instructions](https://www.irs.gov/instructions/i8962), Allocation Situation 3, Gary/Jim example, monthly columns (a)/(b), and Part IV: use the full family benchmarks to allocate the premium; the printed fraction belongs in column (e), with (f)/(g) blank. Repeated benchmarks for the same family are not added again. Actual distinct applicable location benchmarks are summed.

Combining these rules for overlapping policies is a derived method. The IRS does not publish the exact overlapping-policy examples below. The two-place Part IV fraction is display precision; it does not replace the source ratio in monetary calculations. All source money remains Decimal, and source amounts are retained before monthly/form reporting.

## Actual source contract and limits

`sharedPolicyAllocations.noAdvanceCoverageFamilies` records source year/reference/confirmation and exactly the required overlapping months. Each month's taxpayer families must match the actual identities and union of covered people on the original policies and their actual family assignments. Complete-family and complete-policy confirmations are independently required. Each original covered person belongs to one actual rating-area group for that family/month, with a source reference and applicable benchmark. Unknown, missing, duplicated, stale, or contradictory facts reject.

Existing per-policy Situation 3 benchmark records must reconcile with the full monthly families; the new ledger does not silently overwrite them. Source order does not change the calculation. A later single-policy month uses its own actual family and benchmark. Printed-blank original Box B stays a known blank, while unknown source amounts stay unknown.

The initial route requires all coverage policies for the participating families to be present in the original ledger. Other-family coverage outside that ledger needs its separate supporting-source method. Concurrent Situation 4 allocations, marriage alternatives, self-employed health coordination, QSEHRA, and special eligibility combinations remain distinct methods. These are implementation boundaries, not claims that the taxpayer is legally ineligible. This package does not complete every Marketplace combination, qualify a 2026 form, or open full 2026 filing.

## Literal controls

- Two premiums 600 and 900, own full benchmark 1,200 and other full benchmark 600: allocated premiums 400 and 600; household premium 1,000, benchmark 1,200 once, advances zero. Both displayed fractions are .67.
- Own location groups 500 + 700 and other location groups 600 + 300: the actual ratio is 1,200/2,100. The tests retain amounts beyond ordinary cents and prove that a displayed .57 does not create a residual allocation.
- A concurrent unshared premium 600, correct benchmark 1,200 and advance 100 plus the first shared premium: household premium 1,000, benchmark 1,200, advance 100.
- Different counterpart families with benchmarks 600 and 300: 600 × 1,200/1,800 + 900 × 1,200/1,500 = 1,120. A later single-policy month with premium 1,100 and benchmarks 500/600 contributes 500, with a benchmark of 500. Reversing source/family order preserves the results.
- Canonical actual MFJ wages 30,000 and the first one-month source produce allowed PTC 1,000 and advances zero. A retained benchmark of 2,400 rejects.

## Verification before independent review

Work base: `389a6ee442ad18b87fdbcb22d10b924427142eb0`. No main/index or metadata edits were made while implementing the package.

- Spec-first core evidence: four intended failures before the complete-family calculation; missing source-copy and PDF trace failures; a real-panel missing-control failure. The initial Python prerequisite failure is retained separately and is not counted as a behavioral red.
- Nine new cases in four files pass. The adjacent exact cohort passes 662 tests in 29 files, including strict spec validation and the prior allocation methods.
- Root and web type checks pass. Spec validation resolves 5,248 references. Scoped lint has zero errors and 121 warnings; no lint rules were weakened. Production build passes.
- The unchanged production desktop/mobile source flows pass 2/2 with zero retries. Both screenshots were inspected. They verify actual capture, unknown benchmarks, source confirmations, calculated amounts, reload, confirmation invalidation after clearing a source, preserved originals, no horizontal overflow, and no source identifiers in network request bodies.
- Six saved physical and reference PDFs cover the same-family, concurrent-unshared, and distinct-counterpart/partial-period cases. A second PDF reader verifies 42 literal fields across 17 pages, every-page review notices, person-identifier redaction and omitted private family references. All 17 page and footer renders were inspected, with readable physical monthly/Part IV pages and the complete-group trace checked separately. Existing policy-number reporting remains intentional; an initial artifact-only probe incorrectly treated that displayed policy identifier as prohibited and was corrected without a product change. Its failed log is retained.

Evidence is under `.local/upgrade-evidence/no-advance-overlap-*` in the private work archive; `no-advance-overlap-pdf/artifacts.json` and `saved-pdf-verification.json` identify the exact saved bytes and field checks. Software/source checks are not human tax or form qualification.

## Independent review and final integration

The complete-facts agent reviewed frozen tree `16e76b3f44bf35d7d8b6f1d5f9a38cf8b4275577` in a separate clone and verified every owned hash before and after. Fourteen tests in five files passed, including five independent controls for exact thirds versus printed .33, a third unshared source with exact cents, normalized duplicate groups/identities, original-source reorder and exact rebinding, and capture preserving unknown source values. The reviewer refreshed final Form 8962 instructions and Reg. 1.36B-3 and reported no actionable finding in this bounded method. The retained review log SHA-256 is `655fd255208e04cb27033f2237b0303c24a35706c47e320fc961b12754b8dcce`; private probes are excluded from the package.

Final integration starts from committed `b334f1945c3c7ba07cb25e30aefd5d601d39dfe4`, with all fourteen non-ledger reviewed blobs unchanged. Rule provenance advances to 2025.129 / 2026.126; release and human qualification gates stay closed. Fresh integration checks pass 665 tests across 29 files, root and web type checks, and all spec references with zero missing or broken references. The production build, two browser flows and saved-artifact evidence above use the same reviewed product blobs. The final scoped diff passes whitespace validation.
