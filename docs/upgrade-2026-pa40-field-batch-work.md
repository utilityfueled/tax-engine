# PA-40 mapping work reduction

Based on the exact 9283 mapper, this change reuses the existing
`createPdfFieldBatch` in only `fillIncome` and `fillTaxAndPayments`. Thirty
individual money-field lookups become two current-field inventories on the
complete fixture: twenty-eight fewer full field traversals. Every Decimal
argument, loss decision, line25 `toFixed(0)`, penalty/refund/donation rule,
header/status/font/source/year guard and later appearance/privacy step remains.
There is no global cache or retained mutable form index.

Spec and actual-projection regression preceded implementation. The original
mapper genuinely fails the desired bound. A first candidate's passing77 tests
missed a donation-variable shadow; a new actual donation/loss/refund test fails
before the narrow local-variable rename corrects it. Both failures and the
intermediate source remain retained. Final author and main integration suites
each pass78 tests in6files at the original5s test deadline, max2workers and
zero retries. Main types3, full spec validation, unchanged inventory/check,
owned zero-warning lint and both builds pass.

Independent review passes7 actual mapper controls: missing/wrong text targets
including blank writes and line25, direct checkbox errors, first duplicate-name
semantics, fresh structural replacement, separate documents and all five donation
pairs with rounding/loss/refund values. Reviewer fixture setup failures are
retained separately; all assertions remain unchanged.

The original18-PDF/36-page saved workload passes. All1,198 text and412 status
values match. Complete strict-inspector JSON matches except the two known
artifact paths, all2,326 decoded stream instances match, and each entire PDF
byte sequence matches after comparison-only replacement of its two creation/
modification timestamps. Files are never rewritten. No new visual or human
qualification is claimed.

Valid final output and text-relative write order are preserved. Immediate loss
checkboxes now precede queued text; malformed first-error/partial in-memory
state can differ. Mapping still rejects before returning/saving a completed
PDF; a caller of the explicit diagnostic must discard a rejected document.

Local diagnostic renderer/save observations were942ms original and801ms
candidate; Python inspections were1000ms and1074ms. One observation per source
and different surrounding workloads do not establish a speedup or the cause/
fix of the retained remote5s timeout. Full subsequent integrated/remote and
distribution qualification remain required. No tax formula, filing, model or
readiness gate changes.

Evidence under `.local/upgrade-evidence/`:

- Author `nov06-pa-40-field-batch-private/manifest.json`:152 members,
  SHA256 `7589c3de2a9f85df0ecb5664af678b4586db5473aeef689f4a3642f9871ace23`.
- Independent `nov06-pa-40-field-batch-independent/manifest.json`:25 members,
  SHA256 `780b4a427bc03183a96bfe7a6a7da91b37f9153ede35fa236ebaf2034be94c0a`.
- Final mapper SHA256
  `c74a3f47f267e33a04bf50eabe9a7677b149b83178c51bb369e7abc2ee71c6e7`.
- Main `nov06-pa-40-field-batch-main/checks.json`:all ten package commands
  close naturally with exit zero, including normal inventory generation.
