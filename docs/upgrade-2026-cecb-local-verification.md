# Current 2026 upgrade local verification

November 6, 2026. Immutable application source `cecb99444f63aca4ad8cc4411675c0fa2cf630de`, tree `94ec345bb3f5cca1fc348560fd15ba0008f80c24`. This records a completed local synthetic run; remote CI, actual images, hosted staging and native rehearsal are separate evidence.

All twelve commands closed successfully. Both unit and coverage runs passed 27,143 tests across 1,952 files, including the real local synthetic PostgreSQL configuration. Branch coverage is 87.67% against the unchanged 85% gate. No source drift occurred across 5,467 pinned regular source files.

| Check | Result | Elapsed seconds |
| --- | --- | --- |
| `pnpm eval:models:check` | PASS | 0.45 |
| `pnpm typecheck` | PASS | 3.99 |
| `pnpm typecheck:contracts` | PASS | 0.56 |
| `pnpm typecheck:web` | PASS | 2.12 |
| `pnpm spec:validate` | PASS | 0.74 |
| `pnpm spec:inventory:check` | PASS | 1.21 |
| `pnpm build` | PASS | 5.31 |
| `pnpm build:web` | PASS | 22.55 |
| `pnpm lint` | PASS | 14.58 |
| `pnpm test --maxWorkers=2` | PASS | 572.21 |
| `pnpm test:coverage --maxWorkers=2` | PASS | 849.68 |
| `pnpm test:web` | PASS | 1122.62 |

The actual browser reports contain 592 unique declarations: 587 passed and the five original hosted cases skipped. Each has one result, zero retries and two configured workers. The normal project collection timeout is 90 seconds. Actual results retain the old body deadlines: 579 at 90 seconds, 11 at 180 seconds (including five hosted skips), and 2 at 240 seconds. This is not an all-case 30-second qualification claim. All eight request-budget windows and unchanged privacy/source gates passed. The owned server 78204 closed.

Full lint reports zero errors and 11,873 warnings. No threshold, original skip, request bound, privacy check or readiness gate changed. The runner made no live provider requests.

Private evidence: `nov06-current-combined-global-v8`, with actual browser reports in `apps/web/test-results/rate-window-1793961952611-78049`. ROOT rehashed all source pins after closure and independently counted all 592 one-attempt result records. A distinct file-only audit independently derives the same results and rehashes all 5,467 regular files and six literal links against the frozen source contract. Its ten-member manifest SHA256 is `2def44f1fc692a7efdfa6d0f1ed171292b182dad311d624a20dd4f492830ae31`. This is local validation, not release qualification.

The native current-source proposal and isolated hosted supplement await their explicit supplemental authorizations. No native resize/boot, hosted deployment or fault operation was performed by this validation run. Required human tax/AI/security reviews, final 2026 forms, advisory ownership/expiry, AI reserve settlement and artifact-specific hosted/native qualification remain open.

The [current remote CI run](https://github.com/utilityfueled/tax-engine/actions/runs/42202025531) also passes all six jobs, with 27,143 tests and the same 87.67% branch result. The separate [Web workflow](https://github.com/utilityfueled/tax-engine/actions/runs/42202025336) has closed: managed browser passes 587 with five original skips; the actual container browser passes 573, fails 14 and skips five. All 14 failures are the original 30-second case deadlines, across Ohio business part-year, resident-credit, reciprocal and part-year school journeys. Both RRTA paper cases pass in both jobs. Artifact and trace review continues; no common cause or current image/browser qualification is claimed. Historical failed runs remain failed.

The local PDF reader is the existing `.local/pdf-test-venv/bin/python` (Python 3.14.6, pypdf 6.10.0 matching hash-pinned `requirements-test.txt`). Installed Playwright Chromium and the 15 retained official sample PDFs supply the browser prerequisites; the distinct audit verifies their current hashes without claiming a fresh download. The disposable local PostgreSQL reader is retained for unit/coverage and removed from the browser environment.
