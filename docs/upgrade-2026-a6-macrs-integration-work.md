# Exact MACRS source integration

All 11 local integration checks pass on
`a6c70671f1fa176d0197d1defa25c8775d217202`, with 5,179 tracked-file hashes
unchanged before and after every check. Both full unit and coverage runs pass
25,788 tests across 1,886 files, with no reported skips. The ordinary suite
includes all 53 real PostgreSQL controls using the disposable local database.

| Coverage | Result | Unchanged gate |
| --- | ---: | ---: |
| Statements | 91.84% | 90% |
| Branches | 87.62% | 85% |
| Functions | 90.80% | 90% |
| Lines | 95.09% | 90% |

Root, contracts and web types; spec and inventory checks; engine and webpack web
builds; normal repository lint; and the model-cost matrix check also pass.
Existing lint and PostgreSQL future-SSL warnings remain in the logs. No test,
threshold, privacy control or readiness gate changed.

The complete source pins, command receipts, raw V8 coverage, Clover output and
logs are retained in
`.local/upgrade-evidence/nov05-native-disposition-final-integration/`.
Its 30-member manifest is
`a75217141fc2a8308681a653f5499e949790a7f785c61ce0833e6a4fcc21adb0`.
The absent, unconfigured `coverage-summary.json` was not used as evidence.

This qualifies these local checks on the named source. The reviewed 574-case
browser controller still needs actual execution. Remote CI was in progress at
the saved observation; hosted/native artifacts, remaining methods, human
reviews, final 2026 forms and release qualification remain open. Earlier full
browser failures and five hosted skips remain separately attributed.
