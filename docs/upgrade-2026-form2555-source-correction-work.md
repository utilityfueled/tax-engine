# Form 2555 original expenses and signed worksheet correction

Prepared November 1, 2026 against `948d6b95`. This corrects the business-capital package; it does not qualify tax year 2026 or final forms.

Independent review reproduced two source-method errors. The business floor used the entire exclusion against each business when foreign wages were also present. It also replaced the instructions' foreign-earned-income denominator with capital net profit for self-employment deductions and capped line 44 at the exclusion. Publication 54 Example 4 expressly has line 44 above line 43 and a negative line 45. The earlier 'stricter reading' does not establish the correct tax.

## Sources and method

Official sources refreshed November 1:

- [Regulation 1.911-6(a), examples 1 and 2](https://www.ecfr.gov/current/title-26/section-1.911-6): allocate actual foreign expenses, then apportion the exclusion pro rata between self-employment and other employment. The actual foreign expense allocation may differ from gross receipts.
- [2025 Form 2555 instructions, Part VIII](https://www.irs.gov/instructions/i2555): deductions definitely related to excluded earned income are apportioned by excludable income over total foreign earned income.
- [Publication 54, reporting deductions](https://www.irs.gov/publications/p54): Example 3 uses gross business income for the business-expense fraction when capital is material; Example 4 preserves a negative net exclusion. The published Example 4 has gross146000, expenses172000, earned allowance77000, allocable expenses90713, and signed line45−13713. Its separate full-return loss/QBI method remains unavailable.
- [Form8960 line13 MAGI worksheet](https://www.irs.gov/instructions/i8960): combine FEIE42 and its allocable deductions44 without a zero clamp; retain the separate housing allocation where applicable.
- [Schedule 8812 line 2b](https://www.irs.gov/pub/irs-pdf/f1040s8.pdf), [Form 8839 line 7](https://www.irs.gov/instructions/i8839), and [Form 8962 worksheet 1-1](https://www.irs.gov/instructions/i8962): transfer Form 2555 lines 45 and 50 into their respective MAGI worksheets.

Mixed businesses with positive expenses require the actual foreign expense amount, its original source reference and confirmation. All-foreign expenses or a canonical zero expense total are determined from the business. Unknown capital classification rejects; an explicit false remains false in the guide and direct input. Foreign profit used by QBI and the self-employment allocation follows these actual expenses. A foreign loss still requires a separate source method. In particular, positive confirmed foreign expenses with zero foreign receipts cannot disappear when another wage source supplies the foreign income; the current route names the separate foreign-loss method.

The minimum combined line44 amount uses nearest-dollar rounding. The prior tests truncated4945.5 to4945,3493.5 to3493 and3532.5 to3532; those amounts now reject, and complete-source cases retain the original income with corrected line44 amounts. The distinct mixed-source result of exactly3532 remains3532. Compare the reported rounded line44 to that minimum: an exact3354.65 computation reports3355 and must pass, while3354.49 reports3354 and rejects. The old15909 capital expense computation and capped2787 thin-profit packet remain rejection controls; correct source computations are21005 and3355 respectively.

Signed line45 reaches Schedule1 without a zero clamp. A shared internal worksheet source check requires the complete confirmed result, unique audit lines43/44/45/50, the actual prior statement amount, line45 conservation and matching aliases before negative amounts may enter Schedule1, child-credit, adoption or premium-credit MAGI. Negative legacy scalar inputs remain rejected. NIIT retains actual line44 allocation even when it exceeds the exclusion. The ordinary stacking worksheet already floors its own adjusted exclusion at zero; this package preserves that explicit worksheet rule. The FEIE-only ratio applies to these business-specific expenses and the self-employment deduction: Regulation1.911-6(a) prorates section911(a)(1) among business and wage sources, while the housing exclusion requires employer-provided income. Adding wage-only housing exclusion to the business numerator would misallocate it. Wage-specific allocable deductions require their actual separate source facts.

Ordinary1095A reconciliation preserves the signed Form2555 result. The simultaneous signed Form2555/Form7206 business attribution composition remains a named separate-method boundary: the current health-deduction source allocations represent nonnegative business exclusions and cannot represent a signed per-business adjustment. This does not make the actual negative Form2555 amount an invalid fact. The staged Pub974 intermediate call also omits the optional signed source, but its signed path is unreachable behind that existing attribution boundary; no reproduced marketplace defect is claimed for that latent omission.

## Evidence and boundaries

Raw independent reproductions, all failed attempts, spec-before-test evidence and check logs are retained in `.local/upgrade-evidence/nov01-independent-review/`. The first proper red run had three failing new tests. Later integration failures exposed the existing Schedule1 and Schedule8812 negative-input guards; the source-bound route corrects them. A private parser error and the rounding arithmetic correction are retained separately, not presented as product defects.

The guide collects exact foreign expenses and resets the overall source confirmation after edits. New tests retain decimal cents, original expense provenance, missing/contradictory records, unknown capital classification, signed full-return amounts, source mutations, and the child/adoption/premium-credit worksheet transfers. The former line44=200000 invalid-case assertion now expressly verifies its signed form result; it is no longer a contradictory form input merely because it exceeds the exclusion.

Agent implementation and review do not supply qualified human tax review, final-form qualification, hosted staging evidence, live provider evidence, or filing/model-promotion authorization. Main adoption, independent review results and final CI/runtime evidence must be recorded by the integrating agent.


Final private author checks before freeze: `pnpm test` with the19 affected form, federal, schedule, PDF, guide and interaction files passed387tests; root `pnpm typecheck` and web `pnpm typecheck:web` passed. Spec validation passed6398/6398 references with none missing or broken. Scoped lint passed with0errors and124warnings, including pre-existing assertions and assertions in the added regression file; warnings were not disabled. The two latest boundary tests first failed for the actual rounded3354.65 comparison and generic signed7206 error, then passed after their narrow corrections. A zero-receipts foreign-expense regression first reproduced silent acceptance, then passed after the source guard.

Runner attempts are retained: the first latest `pnpm test -- ...` invocation was interrupted because the extra separator prevented the intended filter behavior, and an accidental `pnpm types` invocation failed because that script does not exist. Neither is counted as a passing check. The corrected commands and outputs are recorded separately. Main integrated coverage, builds, browser/PDF source conservation and independent reviewers remain the integrating agent's checks; this private source does not replace those results.


Parent adoption review verifies all 25 frozen owned hashes against receipt
`fd85423fcee460ed16ec529a800143ceca2153a4c98c00689cf3f236079a4598`.
A separate agent passes six independent source/amount controls. Parent passes
three further controls from original mixed-source facts: actual foreign profit
20,000, allocable44 41,413, signed45 58,587, AGI174,348 and reported QBI14,870.
The parent retained an initial SE oracle error (combined-rate rounding): official
ScheduleSE lines10/11 report11,451 and2,678, total14,129; reported half remains
7,065, so every downstream original expectation stays unchanged. A subsequent
harness property error was repaired without changing its amount. All original
inputs, failures and corrections remain under
`.local/upgrade-evidence/nov01-parent-2555/`. This is independent agent review;
it supplies no qualified human approval. Main integrated checks follow separately.

Main adoption checks pass 387 tests in19files, root/contract/web types, all6,406
spec references, regenerated inventory and freshness check, and scoped lint with
zero errors. Rule versions advance to2025.214/2026.212-law-integration-draft.
Two trailing blank EOFs in an existing spec and existing test were normalized
after frozen-hash verification; `.local/upgrade-evidence/nov01-parent-2555/eof-normalization.json`
records both hashes, with no semantic or assertion changes. The main-check
receipt SHA256 is `bbc019b1465fa66eb59847f63549388cd3a2a538e778c439be4b6c5b003782a6`. Full integrated CI/browser/runtime qualification remains pending.
