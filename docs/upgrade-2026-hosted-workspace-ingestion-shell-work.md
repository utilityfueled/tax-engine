# Hosted ingestion shell work

Source-first investigation at exact b254. An actual Preview upload rejected shell metadata before any PDF output. Reproduction uses existing create/reconcile/ingest/save APIs, the committed official2025 W2 file size and filename; no calculated values, credentials, browser storage or hosted requests are injected. Existing2026 gate stays closed.

Contracts declare string[] queues. Both ingestion and workspace hydration derive queue entries from canonical question prompts, and summary only counts the queue. Hosted schema instead permits fact IDs only. Proposed repair adds the exact canonical public prompt enum alongside existing fact IDs; it does not normalize existing IDs, permit arbitrary strings, alter local data or broaden opaque document IDs. All other typed/privacy fields stay untouched.

Source-first tests/spec are frozen before product edits. No runtime result is recorded yet. Filename-derived document IDs are separate: names with spaces currently fail opaque ID validation and filenames inside IDs may contain private text. This package must not weaken that guard or claim it repaired that separate issue. No live Preview, final-year, filing or release qualification is implied.

## Bounded private results

The source-first status above is historical. Initial31 controls (new14+old17) yielded3 genuine prompt-schema failures and28 passes. A same-workspace setup successor preserved all assertions and reproduced the selected pipeline failure on the unchanged product (1 failed,13 unselected); that evidence is separate. The reviewed two-line finite prompt/ID union then passed31 unchanged controls. A portable test successor pins the same witnessed sample filename/size instead of reading an ignored download; its31 controls also pass. The full local workspace object/JSON remains unchanged, private answers are stripped, arbitrary/modified prompts and unknown identities remain denied, and existing ID output stays exact.

Adjacent storage/persistence/hosted-route64 tests across3 files pass; types3 and8159/8159 spec references pass. The actual spec AST774 tests pass; an earlier command mislabeledAST actually ran the14 implementation-link validation controls and is retained as an extra check. Owned ESLint exits0 with zero warnings. Inventory generation/check pass. No builds, full suite, PDF authoring, browser, real provider or hosted mutation occurred. Tests used the existing5-second deadline and worker1 under pinned local Node26.13.0.

Initial missing ignored sample during manifest preparation and both original source/RED/GREEN freezes remain retained. The final test has no ignored-file runtime dependency; witness SHA2566a52ad63693de54220a3326b22c4d0fb34f4c25084366537087312975a55ae96 pins source size1343180. The two product lines never changed after firstGREEN. Independent source review0dbcdcd0 approves that product boundary; final metadata-only fixture successor remains separately attributed. No actual Preview success, filing or release qualification is claimed. Filename-derived IDs remain a distinct next security package.

## Main-worktree integration

Root adopted the exact independently reviewed finite prompt union, portable
source-linked tests/spec and generated inventory against b25496d5. Main checks
pass:31 focused controls,64 adjacent controls, three typechecks, spec references,
spec AST, inventory check, owned ESLint with zero warnings and both builds
(eleven checksets). The unchanged original17 privacy controls remain included.
All eleven log hashes and exit codes are retained in the ignored root-main
receipt; no test deadlines, coverage thresholds, year or filing gates changed.

This fixes the reproduced queue contract mismatch. Actual successor Preview
upload, final-source global checks and the separate filename-derived-ID privacy
repair remain pending. No production deployment or release claim is made.
