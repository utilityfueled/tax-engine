# Form 5695 actual installation and physical-form sources

Status: source/calculation `30fc3dd`, printed18b correction `190af2c`, guided source collection `b84205d`; physical mapping validated locally. This is agent implementation/review evidence, not independent human approval or filing qualification.

## Source refresh

- [Final 2025 Form 5695 instructions](https://www.irs.gov/instructions/i5695) and [physical form](https://www.irs.gov/pub/irs-pdf/f5695.pdf), refreshed 2026-10-25. Current endpoint still serves2025; parent bulk refresh is `70f96ad`. This does not prove alternate URLs absent.
- [IRC25C](https://uscode.house.gov/us/usc/119-118/t26/s25C/) and [IRC25D](https://uscode.house.gov/us/usc/119-118/t26/s25D/). New-cost termination after2025 and confirmed carryforward-only2026 behavior remain unchanged.
- Actual PartI addresses, battery/fuel capacity and joint-occupancy rules; PartII original use, five-year life, existing home, manufacturer IDs, certified audit, enabled-property codes, association shares, joint costs and separate-spousal-main-home instructions were read directly.

## Source/core package

- Spec-first `spec/federal/form-5695-source.yaml`; new optional source fields never default missing answers or infer an installation address from mailing details. Complete source claims require both actual property arrays, home/source identities, actual ownership/use/qualification facts and confirmed prior carryforward including zero. Historical arrays remain unverified compatibility.
- Separate pure source resolver validates unique relationships, real nonoverlapping main-home dates, actual association fractions/cents, all-occupant costs and supported panel links. Known ineligibility yields zero credit while retaining cost evidence. An ineligible panel cannot move an earlier installation into2025.
- Corrected fuel-cell capacity to whole half-kilowatt increments. Reproduced the IRS Ava joint-cost example:12000 of20000 at5kW ->10002 allocated cost ->3001 tentative credit. Battery minimum3kWh is an explicit actual fact.
- Printed line18b caps the insulation credit at1200; the combined annual limit also applies at28. Shared category credits use actual corresponding cost fractions. Further general allocation uses the taxpayer's printed line27 after category allocation, as the instructions explicitly state; an all-occupant hypothetical line27 cannot trigger it. Exact1200, sub-dollar source amounts that still round to1200, and1201 are tested. Parent independently read this boundary and agreed; human qualification remains pending.
- Actual MFJ separate main-home ownership/occupancy supports separate17–30 audit groups, combined30 and one shared31 tax limit. Source cents remain intact; printed monetary lines use Decimal whole-dollar rounding.
- A prior-year panel election requires actual same-home enabled IDs, compliance/200amps and no earlier credit claim. It changes only the calculation's effective year; original source dates remain preserved.

## Local validation

- Red evidence: `.local/upgrade-evidence/energy-physical-red.log`, `energy-insulation-red.log`, `energy-physical-boundaries-red.log` (four concrete failures), `energy-carry-source-red.log`.
- 107 passing tests across source/core, federal credit/minimum-tax integration and existing5695 PDF mapping: `energy-source-core-focused.log`.
- Root TypeScript, spec coverage and focused lint results: `energy-source-core-types.log`, `energy-source-core-spec.log`, `energy-source-core-lint.log`.
- Physical-form re-verification caught and corrected the erroneous uncapped18b change in30fc3dd. Both the registered and current official2025 PDF explicitly cap18b at1200. The restored regression checks18b=1200 and27=1200 for10000 insulation; allowed credit was already capped at1200. The correction has red-first evidence in `energy-18b-correction-red.log` and passing core tests in `energy-18b-correction-green.log`.

## Remaining owned work

- Guided and physical source mapping packages are implemented and verified below.
- Preserve final-year/source provenance, visible review notices and closed filing gates. Final2026 physical form and independent qualification remain external evidence, not implementation completion.
- After energy, complete the assigned actual529/education coordination source package.

## Guided physical facts package

- Added actual installation-home addresses, ownership/use/main-home periods, original-user/life/new-construction answers, battery capacity, association fractions/statements, all-occupant costs, panel links/election/prior-claim answers, and separate-spousal-home confirmation. No mailing address, source amounts, dates or qualification answers are supplied automatically; generated IDs identify local records only.
- 2025 preview now requires the complete source contract instead of reverting to unverified legacy arrays. Actual source cents are normalized with Decimal; a missing amount is never a zero. The conversion preserves known false answers, original installation dates and explicit empty arrays.2026 remains carryforward-only and rejects malformed retained source amounts.
- Every source edit clears stale confirmation; carryforward amount/year edits also clear its independent confirmation. Removing an abandoned blank record yields no energy input. Saved aggregate costs remain reconciliation-only, with no second count.
- Spec-first guided/DOM regressions first failed in `energy-guided-physical-red.log`, `energy-guided-controls-red.log` and `energy-guided-cancelled-red.log`. All575 guided/UI tests pass (`energy-guided-final.log`); all14 workspace filled-PDF tests pass (`energy-guided-pdf-download.log`), preserving the exact one-notice-per-page assertion. Root/web types and all spec refs pass; scoped lint has zero errors and nine pre-existing non-null warnings in unrelated bridge code.
- Synthetic existing solar/door/window/HVAC fixtures now state actual installation and carryforward facts explicitly; prior allowed monetary expectations were retained.

## Physical review mapping package

- Monetary widgets copy the persisted canonical audits. Physical eligibility answers, actual installation addresses, original/effective dates, manufacturer IDs and panel codes come from verified home/property sources. Known false answers remain false; excluded and overflow records stay in a source statement. The mailing address is never substituted.
- A non-address source binding retains source/category/home/effective-date/eligibility/QMID identity; exact cost, occupant and fuel allocations are checked against the source audit. Missing, duplicated, stale or contradictory source/group audits reject before template I/O. Carryforward also reconciles to its actual confirmed source.
- The PartI address follows the highest actual eligible nonfuel cost home; all additional addresses are retained. Actual joint/association boxes and source fractions/statements are rendered. Consecutive-year panel elections retain the original installation date and bind printed codes to actual enabled records.
- Separate spouse PartII worksheets keep distinct interactive fields and actual source amounts. The first form alone prints combined30 and shared31/32 with the prescribed annotation; the additional form ends at30. A cached-page issue found during rendering was corrected, with a regression preventing a duplicate blank PartI page.
- Form5695 attaches independently of Schedule3, preserving line16 when no current credit can be used. The return regression explicitly omits the zero-credit Schedule3 to exercise that optional packet boundary.
- Red-first evidence: `energy-physical-map-red.log`.114 focused core/source/PDF/workspace tests pass in `energy-physical-broad.log`; subsequent page-selection/known-false/extra-address tests pass in `energy-map-page-selection.log`. Root types, all3594 spec references and owned lint pass; two existing unrelated non-null warnings remain in fill-return.ts.
- All1021 PDF tests across99 files pass in `energy-map-full-pdf-bounded.log` with four workers and unchanged test timeouts. The unrestricted first run had1017 passes and four unrelated five-second packet-test timeouts; bounded concurrency resolved all four without source/test changes.
- Saved synthetic ordinary/joint/carry PDFs each have5 pages and167 terminal widgets; separate homes have8 pages and299 distinct terminal widgets. Independent pypdf extraction and saved-widget reads verify original values and exactly one review notice per page. Rendered all four ordinary pages, separate-home shared/individual pages, and joint allocation statement. The full-image display clipped two footers; direct150dpi footer renders confirmed both are visibly red. Evidence is under `.local/upgrade-evidence/energy-source-pdf/`, with generation and checks in `energy-source-render-final.log`.
- Current official endpoint and registered template remain final2025. No2026 physical template, filing qualification or human signoff was asserted.
