# Current Pennsylvania ticker disclosure controls

The full current-source unit run on `84a4cc878c2a4ac46daa58995643c8842064f866` executed all 24,261 tests with a new disposable loopback PostgreSQL 16.14 database: **24,259 passed, two failed, zero skipped**, across 1,813 files (1,812 passing). All 4,882 tracked regular source files remained byte-exact throughout. The temporary database was stopped and its own cluster removed. This run does not establish an all-green global gate or coverage.

Both failures came from the shared `exactOwners` assertion in `tests/apps/web/pa-married-native-ticker-geometry.test.tsx`: it still required “Paper export still needs the qualified married-return forms.” Commit `cffef1ac` had deliberately replaced that disclosure when source-validated PA40/SP review downloads became available. The observed rendering preserved both owner amounts and the current explicit filing/local-return denial. Independent static review confirmed this obsolete expectation rather than a demonstrated tax or layout defect.

The spec was updated first. The single shared disclosure assertion now requires the **complete** current paragraph: each owner's separate account, separate federal amounts, current source validation for supported PA40/SP review pages, and “Filing and separate local returns remain unqualified.” All monetary, owner, geometry, computing and clearing assertions remain unchanged. No application product, calculation, readiness gate, timeout or coverage setting changed.

Validation: four affected ticker controls and 115 adjacent controls in five files pass; spec validation reports 7,817/7,817 lines with valid refs; all 739 AST reference controls pass; strict lint for the changed test has zero warnings. Full current-source unit/coverage and distribution/staging/human/final-2026 qualification remain pending successors; this narrow rerun does not replace them.

Evidence is retained under `.local/upgrade-evidence/`:

- `nov03-head84a4-full-unit-pg/root-final-source-result.json`, original log SHA256 `15172146627152600be4bc768c1fa7cc3082362374aba3a82eedfef0d0e16d3d`, JSON `ae0238c465d05b15d05cddfbd5f5685406a405e2267dd29b33b36cf5a0aaa1ce`.
- Independent proposal/review `nov03-pa-married-ticker-disclosure-independent/independent-review-result.json`, SHA256 `15a519bcda71af482e0964a3539f942ab4538693e6b5fb676aedbe88abb9d4b7`.
- Spec-before-test receipt `nov03-pa-married-ticker-disclosure-main/spec-before-test-correction.json`.
- Actual five-check results `nov03-pa-married-ticker-disclosure-main-green/checks.json`; focused log `af6c7652ea40e438c388c918f6384e4d8ca18adcb9e9998f2c5f9ffea29fc8dc`, adjacent log `74fc66e788c5463b5d42a6c920db2775995fda216639dc2eb4ea8d262d36622b`.
