# Original charitable carryovers across filing units

This package derives the current filing unit's charitable opening balance from original filed history. It covers first separation, later separate use, reunion, remarriage, the actual death-year return and later extinction of the deceased person's carry. It preserves each contribution's year, percentage category, medium, original excess and actual prior use. It does not enter a calculated current deduction or change NOL ownership.

## Authority and bounded method

The controlling source is [26 CFR 1.170A-10(d)(4)(i)–(iii) and (e)](https://www.ecfr.gov/current/title-26/section-1.170A-10), refreshed October 26–27, 2026. The first separate year allocates the remaining joint excess using the spouses' original separately computed excesses after their original NOL reductions. The regulation's example leaves $10,000 after $3,000 and $7,000 of joint use; original separate excesses of $12,000 and $8,000 produce $6,000 and $4,000. The original gift ratio is not that allocation. The historical cash percentage in the published example is only an ownership oracle, not a modern percentage limit.

Actual subsequent separate use reduces the appropriate owned balance. A later joint return aggregates the surviving balances. Remarriage includes the present spouses' own surviving sources, retaining the former spouse's excluded provenance. The deceased person's carry can be used in their actual death-year joint return or final separate return; it does not become another person's later carry. Known current-household death facts must agree with the timeline, while unknown facts remain unknown.

The packet expressly confirms all original carries feeding relevant joint histories. It includes actual people, filed returns, every relevant intervening year, each return's use and NOL reduction, original separate computations, source references and known-zero amounts. Source references and original identity fields remain in the input and private review context. Neither the collector nor the calculation manufactures those facts.

Exact rational numerator/denominator records survive allocation, historical subtraction and aggregation. The current balance is projected only after same-year/category/medium sources aggregate into the engine's existing Decimal context. This does not claim arbitrary-precision accuracy for every downstream engine formula. No residual cent or dollar is assigned to a person. An optional recorded opening must reconcile; omission is allowed because the opening is derived from actual originals.

## Determined cohorts and retained boundaries

- Published first split: $20,000 original less $10,000 actual joint use, with $12,000/$8,000 separate excesses, gives $6,000 for the current primary filer.
- Separate use followed by reunion: $6,000/$4,000 less $2,000/$1,000 gives $7,000 together, with original contribution year retained.
- Remarriage and same-vintage aggregation: $6,000 plus the present spouse's $2,000 gives $8,000; one $5,000 current capacity leaves a $3,000 pooled carry. No owner-specific current closing allocation is invented.
- Death: the actual joint death-year pool remains available; a later survivor's balance excludes the deceased person's allocated share.
- Zero use or complete exhaustion of a reunited pool is determined. A current joint aggregate is determined even after actual partial use. A later separation or death requiring a new owner split after partial joint use rejects until that attribution method is represented.
- Multiple actual original excess sources remain distinct behind a same-category aggregate. Existing zero-benefit NOL composition is available; a positive-benefit single-origin method cannot silently turn several originals into one synthetic source. NOL ownership, positive-benefit COD, and unresolved current/prior floor attribution remain separate methods.
- Regular and AMT original histories are independent. Known-empty regular history with an actual $6,000 AMT-only opening produces a signed negative $6,000 charitable adjustment and $94,000 AMTI on the retained $100,000 literal, with no prior NOLs.
- The existing 2026 nonitemizer percentage-use helper retains ownership evidence: $6,000 old public cash on $5,000 base uses $3,000 and leaves $3,000, with no current section 170(p) deduction from old cash. Canonical 2026 availability/readiness gates are unchanged.

## Calculation, guide and output

The shared carry source validator derives and groups original balances once before the existing percentage worksheets. Each carry detail and audit retains the original filing-history evidence. The guide extends the existing charity-history collector with actual source fields, exact monetary strings, explicit false/zero and unknown state. Source edits revoke both timeline and existing source confirmation. Household changes also revoke completion. Confirmation-only edits preserve another confirmation. Switching methods retains hidden original records for explicit reconciliation.

The private PDF context binds the complete original input, its exact permitted redaction and the completed federal calculation. Regular or AMT-only ownership histories require this context. Retained filing-history output still requires the original attachment after attempted removal. Changed income, balanced source edits, altered results and forged/serialized contexts reject before template access.

The physical Schedule A retains its existing field mapping. A separate appendix shows numbered original sources and people, original years/categories/media, separate excesses, exact allocation ratios, actual use, excluded balances and the current pooled opening. It never displays personal identifiers or private source references, and does not claim an owner-specific current closing amount. Every page carries the review-only notice. The real guided workspace prepares the context before redaction and includes the appendix in its download.

## Author verification and retained failures

The YAML source entries and failing tests preceded calculation changes. Local evidence under `.local/upgrade-evidence/charitable-filing-unit-*` retains the initial schema, helper, unknown-confirmation, pooled-NOL, redacted-context, guide, death-conflict, excluded-source, partial-joint-attribution, nonitemized-audit and appendix failures. Those are distinct from test setup corrections: the wrong result property in an early AMT assertion, the first browser fixture importing a runtime alias, and a privacy reader initially treating any four-digit substring as an identifier. No failed evidence was discarded.

Final private author checks on the package source:

- 64 tests in 16 files passed with one worker, including all 20 owned cases in five files and adjacent original carry, NOL, guide and PDF consumers. Log: `charitable-filing-unit-final-scoped.log`.
- Root, web and contracts type checks passed. Spec validation resolved all 5,922 references. Scoped lint had zero errors and 211 warnings, including non-null assertions in tested source fixtures. Logs: `charitable-filing-unit-final-{root-types,web-types,contracts-types,spec,lint}.log`.
- Production web build passed. Desktop 1280 and mobile 390 browser cases passed with one worker and zero retries, including actual source edits, both confirmation revocations, unknown-source rejection, save/reload, exact optional-opening absence and real PDF download. Log: `charitable-filing-unit-browser-layout.log`.
- The initial mobile run passed its data workflows but failed its unchanged minimum input-width assertion (160.875 px versus 180 px). The new nested source fieldsets now avoid additional browser-default padding. Both original failure and corrected production build/browser logs remain. No assertion, retry or deadline changed. The task-owned localhost server was stopped after verification.

The immutable snapshot manifest records exact source hashes and test-file lists. Retained original-input/PDF artifact production and independent source/artifact review follow that freeze; they are not claimed completed here. This is software/source work, not independent human tax qualification or release readiness. No rule version, final-year readiness gate, filing authorization or e-filing capability changes in this source-review snapshot.

## Independent review and final integration preparation

Independent source review of frozen `aa465127` passes 54 tests in 11 files
with one worker, including eight private controls. Those controls separately
exercise original net-excess ratios, successive marriages, death, excluded
owner use, expiry, independent AMT, nested confirmation and stale output.
All 34 owned paths and 3,601 tracked source hashes remain unchanged. Report
`federal-charitable-filing-unit-source-review.json` has SHA256
`4d952eba731c184e8da56c6b60cf64d5343dba3b50d971cdde275d516fd97706`.

The parent's independent original/PDF reader derives amounts directly from
eight saved original cases, using Decimal and exact ratio pairs. All 73 PDFs,
123 pages and 311 populated fields pass 9,452 checks. Seven all-page contact
sheets and eight readable detail pages were personally inspected. Physical
Schedule A, separate AMT, reference fractions, source privacy and notices agree.
The reader never parses calculated outputs as expectations. Its first attempt
incorrectly paired appendix ordinal order with original array order in the
remarriage case; the corrected reader binds actual original year and excess.
Both attempts remain recorded and no product change was required.
Report `parent-charitable-filing-unit-artifact-review.json` has SHA256
`5d30d4c4dbc36d230440e5ced3d761701741ceb920488420523667cb18ed0f14`;
its detailed checks have SHA256
`d41c921523fb496c84ac71755290e03e59965ca1495dbe7500889444b2ef0e9d`.
These saved outputs retain their original producing source and dependencies.

The final rebase follows delivered monthly coverage `05c5819` and evidence
commit `805cbac9`. Thirty-one original reviewed paths are unchanged; the flow,
workspace and fill-return paths require clean three-way merges that preserve
bond source invalidation, private review binding, reference pagination and
all delivered PDF performance changes. The source rebase receipt is
`charitable-filing-unit-monthly-rebase.json`, SHA256
`6d9864618ad93c393fc0cecd2f45a4cd3434777f1aa7b6b975793d4d547c4170`.
An initial archive normalized directory-symlink trailing slashes; that setup
failure remains retained and the final copy restores all six exact targets.

Metadata advances to 2025.177 / 2026.174 draft. Final frozen integration,
production/browser and main-adoption checks remain pending at this freeze.
The original artifact review does not become evidence from this later producer.
Human tax, final-year, filing and release gates remain unchanged.

## Final integration and delivery checks

Final frozen tree `dab5734a76482ff788d7235152012701d324ccf8` contains 37 owned
paths and 3,656 tracked source hashes. Thirty original reviewed paths are
byte-identical; three integration merges and this evidence ledger are the only
changes among the original 34. The manifest
`charitable-filing-unit-final-review-snapshot.json` has SHA256
`0437305e9fd50dcd86d9048329ea28b6c2991546f830d2f9da01fc644d627894`.
The 563-entry inventory and 149 explicit implementation associations preserve
every preceding entry unchanged.

The final private cohort passes 72 tests in 17 files, including the eight
unchanged independent controls, with one worker. Root, web and contracts types,
all 5,982 spec references, inventory and scoped lint pass; lint retains 211
warnings and zero errors. The first wrapper used the nonexistent `spec:check`
command; its error is retained separately and `spec:validate` passes. Successful
tests and type checks were not rerun to conceal that setup correction.

Both production builds pass. Desktop 1280 and mobile 390 browser flows pass with
one worker and zero retries; the task server is stopped. An initial sandbox
denial of the localhost bind occurred after the successful builds; only the
browser phase resumed with scoped local authorization. All frozen source hashes
remain unchanged. The actual two downloaded PDFs have 28 pages and pass 102
additional original-derived field, reference, privacy and notice checks. Two
all-page contacts, two readable pages and four actual UI screenshots were
personally inspected.

One screenshot caught the existing 600ms ticker animation at $13,500. Two
additional private browser controls wait for the completed $16,254 balance and
confirm agreement with the downloaded packet, including its separately reported
existing $654 estimated penalty. No calculation change was needed. The retained
actual guides independently reproduce the $5,999.4 opening from the $20,000
joint excess, $3,001 and $7,000 actual uses, and $12,000/$20,000 owner ratio.
Every page's text in the later PDFs matches the separately checked browser
outputs. This charity review does not newly qualify the penalty method.

Main adoption verifies all 37 hashes before the final ledger addition. Its nine
affected files pass 50 tests, including adjacent bond privacy/reissue, workspace
and packet-save consumers. Root types, spec, inventory and diff checks pass.
The main check receipt has SHA256
`9c24b7dcc56a6fc542e8ddd3b7164dd4b195d21ad954150efa01774ba7a5ab35`.
No test deadline, coverage threshold, source-privacy rule or readiness gate was
changed. Original artifact review and later integration evidence retain their
distinct producers. Recurrent owner attribution after partial joint use and
the separate NOL/COD methods remain explicitly unresolved or in active work.
