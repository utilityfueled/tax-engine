# Investment source panel behavior verification

This test-only package starts from immutable `ee0132c2f493bbd089514e8fad00ec6de7f3128a`. It adds three DOM test files and five source-linked specification entries, reusing the existing native-control/React-state harness unchanged. No production source, calculation, threshold, coverage exclusion, timeout, retry, readiness gate or original fixture changes.

The actual source workflows cover:

- Original digital-asset statement and disposition entry, blank broker boxes versus taxpayer basis, exact quantities/cents, signed gain/loss, statement withholding once, edited confirmations, saved unsupported acquisition facts, and explicit row removal.
- Bond premium history and accrual periods, recipient adjustments, preserved multiple-state withholding rows, signed TIPS deflation and known-empty history, and reconciled tax-exempt/private-activity classification.
- Child election from empty controls, separately identified AMT statements and deduction reconfirmation, missing versus zero amounts, preserved foreign-reporting method limits, student attendance and actual parent income comparison tied to the canonical return.

The literal OID premium and TIPS controls reuse the existing independently specified source calculations in `form-1099-oid-sources.test.ts`: premium periods produce 5 taxable interest, 15 deduction and zero closing carry; the existing Pub. 1212 Example 9 source difference of −38.90 offsets 100 same-obligation interest to 61.10. The child controls reconcile 4,000.25 taxable interest to 1,300.25 parent income, and 25.05 + 100.05 actual preferences less 10 separately allowable deduction to 115.10. The parent comparison is 50,000 wages less the existing 2025 single standard deduction of 15,750 = 34,250, excluding the child election. These are verification of existing methods, not new tax-law qualification.

The first test runs are retained in `/private/tmp/tax-ee0132c-verification-8utd72md/investment-panels-first.log` and `investment-panels-second.log`. They exposed test assumptions: the normalized document discriminator is lowercase; editing a child AMT source also revokes the separate deduction confirmation; an original reported basis of zero with a different completed basis remains a guarded correction method. Tests now preserve and assert those existing boundaries. No product defect was confirmed.

Initial scoped checks: five new cases pass; adjacent source/DOM and strict specification checks pass (474 tests across nine matched files), root/web types pass, 5,260 specification references resolve, and scoped lint has zero errors or warnings. The final cohort additionally includes the correctly named OID source helper suite; exact results follow in the final evidence section.

The three-file targeted coverage run intentionally retains the whole-project thresholds and therefore exits nonzero on unexecuted unrelated code. It is not a full gate pass. Matching function source locations against the immutable full baseline shows 91 newly exercised existing panel callbacks: 26 digital, 36 OID, 29 child. The same-base projection is 10,239 / 11,298 = 90.6267% functions, before any incidental gains. A separate full immutable run is required to establish the actual gate result. Later product packages require their own integrated coverage refresh.

The original full `ee0132c` result remains: all 18,785 tests / 1,108 files pass, but functions 10,148 / 11,298 = 89.8212% fails the unchanged 90% gate. Branch coverage is 86.7165%, and production browser checks pass 396 with five hosted-only skips and zero failures/retries. This package does not relabel that failure or claim a later source tree was covered.

All source facts are fictional, entered locally through real controls. Network spies on the empty-source workflows reject any source transmission and remain uncalled. This is automated source/software verification, not independent professional tax review, filing qualification or release readiness.

## Exact frozen verification

Frozen tree `7305c69fa9022ba634a8fedd7865247162be8f8d` contains only these five owned paths over `ee0132c`. The final adjacent cohort passes 494 tests across ten files. Independent AI-agent review verifies all five hashes and passes 461 tests across four files, then the original five behaviors after restoring three private negative controls. Each deliberate stale digital-basis, OID-recipient or child-source confirmation was caught by an existing assertion. The reviewer made no author-source changes; evidence is `.local/upgrade-evidence/ai-investment-panel-review.json` and its retained logs.

The first full candidate coverage attempt ran without the required localhost permission. It ended with 18,757 passed, seven failed and 26 skipped tests, plus four unhandled errors: loopback PostgreSQL connections and synthetic test-server listeners were blocked with `EPERM`. No coverage report was emitted. Its exact failure remains in `investment-panels-full-coverage.log`, SHA256 `c49e950398502adc01c43dfbe4b2f79bcdea60451c37790cbd9f492cd848df2e`. It is not a gate result or a product failure diagnosis.

After an unchanged 11-case/two-file loopback preflight passed with the required local-network permission, the same frozen source passed the complete coverage command at `2026-10-26T10:12:47Z`: **18,790 tests across 1,111 files, zero failures or skips**. Functions are **10,240 / 11,298 = 90.6355%**, branches **46,994 / 54,135 = 86.8089%**, statements **55,123 / 59,904 = 92.0189%**, and lines **94.59%**. All unchanged whole-project gates pass. The 92 additional covered existing functions include one incidental gain beyond the 91-panel projection.

The full run used only the task-owned `ai_test` loopback database and synthetic local services; provider and production variables were excluded. Log SHA256 is `84eaf06b6e6436914ac232262b4f220c0269fbc54cd938acc95a28bc281667a5`; `coverage-final.json` SHA256 is `f82a0694d114e5fd8c9189bfe903fb42f6ab710d979261172fe54f4b4a959957`. Reports, counts and hashes are retained in `/private/tmp/tax-ee0132c-verification-8utd72md/investment-panels-full-coverage-network.json` and `investment-panels-full-coverage-totals.json`.

All 2,960 regular tracked source files match the fixed tree before and after the permitted rerun. The six tracked skill-directory symlinks have unchanged extracted targets; extraction omitted their original trailing slash while retaining the same resolved directories. The original archive hash and fixed tree predate the run; the detailed blob manifest was derived from that tree during the earlier restricted attempt. No claim relies on regenerating a tar-container hash with different archive timestamps.

This full gate result belongs to `ee0132c` plus this test package. It does not cover intervening PA, passive-distribution or Marketplace product changes. The latest integrated source still requires its own complete verification.

## Current-base integration

The five owned paths were replayed privately onto pushed `9173d209715d6b8cca893fdba54acd2fcba6468d`. All four executable/specification blobs remain byte-identical to the independently reviewed frozen tree; only this evidence ledger was appended. The current-base adjacent cohort and strict references pass 498 tests across ten files; root/web types, all 5,304 specification references and scoped lint (zero errors or warnings) pass. Exact commands, durations and log hashes are retained in `/private/tmp/tax-ee0132c-verification-8utd72md/investment-panels-integration-checks.json`. No later whole-tree coverage claim is made from these scoped checks.
