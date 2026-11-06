# Actual state sources in workspace review exports

The workspace exporter now replays the canonical PA ordinary and Ohio residency
sources before calculation and identifier redaction. It privately prepares the
state rendering contexts from those originals. All three residency categories
use their actual finite methods; missing PA ordinary/completion or Ohio allocation
facts reject instead of silently producing a resident or federal-only packet.
No complete-data filing export or final2026 qualification is implied.

Only one product changes: `apps/web/src/lib/workspace-filled-return.ts`, exact
reviewed SHA256 `f8feef155114d5ad65752ffd197d07de3b3f7ce19a729ba76413f9f0627624c3`.
The ten supporting source/spec/test paths retain exact reviewed bytes. Existing
unsupported NJ source/scalar assertions remain explicit negatives with their
original facts; separate actual NY calendars/payroll and receipts preserve the
positive allocation/payment oracles. Legacy NRH arithmetic remains tested at
its separate primitive boundary. No engine formula or readiness gate changes.

Main source-first: four genuine failures/one pass before the product change.
Then61 tests/six files, types3, spec6999/6999, inventory generation/check, strict
zero-warning lint on the product and other clean owned tests, both builds and
diff check pass. The existing workspace fixture test has three non-null warnings
and zero errors under the unchanged repository lint policy; the stricter attempt
and its failure are retained rather than reported as a pass.

Actual15 root-main PDFs/253pages pass independent all-saved-object reference,
zero fields/widgets, notice, private SSN/account/signer and text checks. All253
rendered pages exactly match the independently inspected current private output.
Receipt `d1aecd6f7c4a1a246ffe964b41c422fd9507b058080a623679cea224eefd6e27`.
The earlier pre-OID reference has intentionally different ScheduleA disclosures:
13 packets/249pages retained exact prior rendering, and four changed/added pages
were separately inspected, receipt
`384c8c9e83aa25f3938a8eb8dfe2d45a0c81c284988721bdf523087b4cc88d1e`.
No false parity with the earlier missing ScheduleA packet is claimed.

Private source/adoption/red/green/build evidence: `nov02-parent-workspace-main*`.
The additional whole-workspace run passes180/181 tests across56 files. The
remaining PA/foreign-COD positive has no actual ordinary/completion source
packets and is blocked by the intentional source guard. Its original assertions
remain unchanged. Independent investigation of PA debt/foreign/NOL conformity
and actual required originals is active; no facts or refund outcomes are added
merely to pass that test. This run is a failure, not a global pass. Broader
state methods, actual UI source collection, human review, final forms, complete
filing exports and hosted/self-host release gates remain open.
