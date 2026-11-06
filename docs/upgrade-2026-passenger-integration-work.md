# Current passenger source integration

All 11 local checks pass on `88f517cc987628e8f0b314fe2fcd3e621b97af18`.
The full unit and coverage runs each pass 25,806 tests across 1,888 files, with
no reported skips. The existing 53 real PostgreSQL controls run against the
owned disposable local database. All 5,187 tracked source hashes agree between
the full and static/build runs and remain unchanged throughout each check.

| Coverage | Result | Unchanged gate |
| --- | ---: | ---: |
| Statements | 91.84% | 90% |
| Branches | 87.63% | 85% |
| Functions | 90.81% | 90% |
| Lines | 95.10% | 90% |

Root, contracts and web types; spec/inventory; engine and webpack web builds;
repository lint; and the model matrix check also pass. Existing lint and
PostgreSQL future-SSL warnings remain retained. No test, coverage threshold,
privacy control or readiness gate changed.

Raw Istanbul coverage, Clover output, independently counted totals, commands,
logs and source pins are retained in
`.local/upgrade-evidence/nov05-passenger-full-integration/`. Its 36-member
manifest is `fa0579718b357610ffc1af838528fba5b4e4fdab784a69dd519d4129bf5f7a8a`.
The exact-commit remote snapshot has successful static/build jobs and unit,
coverage and both browser jobs still running; it is not a final remote pass.

`pnpm test:web` remains a separate open gate. The portable rate-window runner
has source-only tests and list-only evidence, with independent review pending;
no actual paced browser result is claimed. Hosted/native artifacts, remaining
methods, final 2026 forms, professional reviews and release qualification remain
open. Filing and model promotion remain disabled.
