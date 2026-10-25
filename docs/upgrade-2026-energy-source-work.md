# Form 5695 actual installation and physical-form sources

Status: source and calculation package validated locally; guided source collection and physical mapping follow. This is agent implementation/review evidence, not independent human approval or filing qualification.

## Source refresh

- [Final 2025 Form 5695 instructions](https://www.irs.gov/instructions/i5695) and [physical form](https://www.irs.gov/pub/irs-pdf/f5695.pdf), refreshed 2026-10-25. Current endpoint still serves2025; parent bulk refresh is `70f96ad`. This does not prove alternate URLs absent.
- [IRC25C](https://uscode.house.gov/us/usc/119-118/t26/s25C/) and [IRC25D](https://uscode.house.gov/us/usc/119-118/t26/s25D/). New-cost termination after2025 and confirmed carryforward-only2026 behavior remain unchanged.
- Actual PartI addresses, battery/fuel capacity and joint-occupancy rules; PartII original use, five-year life, existing home, manufacturer IDs, certified audit, enabled-property codes, association shares, joint costs and separate-spousal-main-home instructions were read directly.

## Source/core package

- Spec-first `spec/federal/form-5695-source.yaml`; new optional source fields never default missing answers or infer an installation address from mailing details. Complete source claims require both actual property arrays, home/source identities, actual ownership/use/qualification facts and confirmed prior carryforward including zero. Historical arrays remain unverified compatibility.
- Separate pure source resolver validates unique relationships, real nonoverlapping main-home dates, actual association fractions/cents, all-occupant costs and supported panel links. Known ineligibility yields zero credit while retaining cost evidence. An ineligible panel cannot move an earlier installation into2025.
- Corrected fuel-cell capacity to whole half-kilowatt increments. Reproduced the IRS Ava joint-cost example:12000 of20000 at5kW ->10002 allocated cost ->3001 tentative credit. Battery minimum3kWh is an explicit actual fact.
- Corrected printed line18b to uncapped30%; annual limit applies at28. Shared category credits use actual corresponding cost fractions. Further general allocation uses the taxpayer's printed line27 after category allocation, as the instructions explicitly state; an all-occupant hypothetical line27 cannot trigger it. Exact1200, sub-dollar source amounts that still round to1200, and1201 are tested. Parent independently read this boundary and agreed; human qualification remains pending.
- Actual MFJ separate main-home ownership/occupancy supports separate17–30 audit groups, combined30 and one shared31 tax limit. Source cents remain intact; printed monetary lines use Decimal whole-dollar rounding.
- A prior-year panel election requires actual same-home enabled IDs, compliance/200amps and no earlier credit claim. It changes only the calculation's effective year; original source dates remain preserved.

## Local validation

- Red evidence: `.local/upgrade-evidence/energy-physical-red.log`, `energy-insulation-red.log`, `energy-physical-boundaries-red.log` (four concrete failures), `energy-carry-source-red.log`.
-107 passing tests across source/core, federal credit/minimum-tax integration and existing5695 PDF mapping: `energy-source-core-focused.log`.
- Root TypeScript, spec coverage and focused lint results: `energy-source-core-types.log`, `energy-source-core-spec.log`, `energy-source-core-lint.log`.
- The earlier legacy test's18b1200 expectation was corrected to printed3000 for10000 insulation; allowed general credit remains1200 and total credit unchanged.

## Remaining owned work

- Collect actual home, category, allocation, panel, battery and carryforward facts in the guided interview; reconcile saved legacy totals without inventing values.
- Render physical addresses/answers, actual panel codes, joint/association explanations and separate-spousal-home pages from verified sources and persisted audits; require strict missing/wrong-audit rejection. Reopen, extract and visually inspect the generated PDF.
- Preserve final-year/source provenance, visible review notices and closed filing gates. Final2026 physical form and independent qualification remain external evidence, not implementation completion.
- After energy, complete the assigned actual529/education coordination source package.
