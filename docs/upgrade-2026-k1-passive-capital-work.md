# Original K-1 passive capital character

Private final integration candidate after separate source review. The original
review tree remains `0236f5ad3beea38de830ab923525f8ad8b72bcce`; its prior
section 465 base was `470ad2acd2b379ac3c4780feb06a4df41fabfdc1`.
This package consumes actual portfolio versus passive-activity character,
separately recorded short/long-term opening section 469 balances, and each
original prior section 465 capital record. It does not derive character from a
K-1 passive flag. Existing basis, at-risk, ordinary QBI and recipient records stay
separate. No computed allowance is collected.

The source method is in `spec/federal/k1-passive-capital-sources.yaml`. Official
Form 8582 Part IX separates reporting parts and offsets income only within its
own part before allocating the activity's unallowed loss. Its published example
retains $217.50 and $652.50 as separate capital characters. Form 1040 rounding
instructions round a destination line after adding its exact source amounts.
Part V retains net current amounts on each reporting form and preserves income
and loss from different forms in separate columns. Part IX additionally keeps
short-term and long-term reporting parts separate. The Schedule E versus
Schedule D summary is a derived source reading; no matching published ST/LT
example was located. The original term amounts remain available independently.

Initial missing-module and canonical source-guard failures are retained in
`.local/upgrade-evidence/k1-passive-capital-{part-ix,source,canonical}-red.log`.
Twelve first focused cases passed. The author then identified a draft
whole-dollar residual assignment requiring correction before freezing: no
source authorizes a character priority to consume a reporting difference. New
source-precision and reporting-form regressions precede that correction. The default Form 8582 path is
unchanged; exact computation is limited to this internal ordinary nonrental
source method, with source guards.

Author test corrections are retained separately: one setup paired full
disallowance with offsetting income and was corrected before implementation;
the canonical audit accessor is `allLines`/`value`; the high-income control's
AGI is $267,000 because its $10,000 capital loss has a $3,000 current deduction.
Form 8960 line 5a uses that reported deduction, so its net is $17,000 and tax
$646. An initial whole-activity Part V net assertion was too broad: the official
instructions preserve different reporting forms. These initial failed author
oracles are retained; no corresponding production behavior was changed merely
to satisfy them. None is an independent review.

The final precision red cohort reproduced four failures before the correction.
Its SE fixture first needed an obsolete supplied adjusted-earnings value removed;
the source-only negative Box14 then reproduced the early rounding directly.
After the correction, the new different-form control's author expectation was
corrected to $107,000 AGI because its $10,000 net capital loss has a $3,000 current
limit. Assertions now distinguish exact internal capital amounts from their
rounded report values and compare repeating allocations within the existing
20-significant-digit Decimal context. Those failed attempts remain retained.

The completed private source candidate has 26 new cases across nine files,
including current/prior capital source binding, exact Part IX character,
independent basis/465/469/QBI histories, original-only guide controls, direct
Schedule E/Form 8582 review, retained-output mutation rejection and an unmocked
guided workspace packet. The affected and neighboring cohort passes 483 tests
across 69 files with one worker. Root/web types, root and production web builds,
and 5,794 spec references pass. Scoped lint has zero errors; nine warnings in
pre-existing federal and Schedule E code remain. No new lint warning remains.

Production browser checks pass on desktop and mobile, two cases, one worker,
zero retries. Both enter the actual missing confirmation, retain original
capital statements and separate histories through reload, verify the resulting
estimate, download and reread the full review packet, and block the estimate
after an original-reference edit. Screenshots were inspected at both widths.
The loopback server on port 3417 was closed after the checks. The browser uses a
saved data-only fictional source fixture, compared to the existing guided
fixture in the source test; no computed value or missing source was added.

Three PDF regressions failed before the mapper/context correction. The corrected
run first passed two cases and stopped on a test-only comma-format expectation
for an existing physical widget; the unchanged numeric expectation was then
expressed as the widget's actual ungrouped text and all three passed. A type
check caught an optional source index in the Part VIII exclusion filter; an
explicit undefined case preserves the default path. Browser test discovery
first failed on the unit fixture's alias and then a missing JSON import
attribute, before running successfully with the data-only fixture. The isolated
2026 case initially compared a repeating Decimal cancellation beyond the
project's 20-significant-digit context; the assertion now uses the same
eight-place comparison as the corresponding 2025 case, without changing math.
All initial failures and corrections are retained in local evidence.

The new Form 8582 reference preserves Part V reporting-form nets, separate Part IX
reporting-part values, and each exact source/carry value within Decimal's context.
It does not put a multi-form activity into the ordinary-only Part VIII. Physical
Schedule E prints only ordinary income and deductions; Schedule D receives the
allowed capital amounts once. Private contexts retain original character and
history, plus final ordinary/ST/LT carries and Part IX audits, before redaction
or template access. Missing, replaced and forged sources cannot authorize stale
output. The completed source and author artifact evidence is recorded below;
the separate parent original/PDF review is recorded below.

Reserved provenance versions are 2025.173 and 2026.170-law-integration-draft.
Current-form qualification, human review and release readiness remain unchanged. The finite neighboring queue continues to name
positive-benefit COD, changed filing-unit history, and the 2026 prior-gift
contribution-year/floor method separately. That last source question preserves
original payment, basis/at-risk suspension and release years; it is not silently
reclassified as a completed exclusion.

Independent source review of the immutable `0236f5ad` tree passed 33 tests
across 11 files with one worker, including seven reviewer-only controls for
asymmetric allocation, income on different forms, independent prior ST/LT,
portfolio character, missing versus zero facts, balanced pre-I/O tampering and
exact guided normalization. All 40 owned and 3,470 regular tracked hashes were
unchanged. Report `federal-passive-capital-source-review.json` has SHA-256
`323125e64e97e2eeb9290c3eea0f0adf432c305976489ca41b10a7fe3e3626b4`;
its log has SHA-256
`86cc7338af85362e9b87e9712075e5add1ba95d39f9f1d729688190c48201b10`.
This is agent source/software review; the Part V interpretation remains explicit.

An exact source clone produced eight saved original canonical inputs/results
and the actual guided workspace originals. The retained set contains 122 PDFs,
262 pages and 836 populated fields. The author independently reread completed
files, checked 186 physical numeric placements and 15,444 total numeric, source,
privacy and notice assertions, and viewed all 18 contact sheets, nine footer
sheets and 29 readable pages. These are artifact checks, not extra authored
tests or independent human qualification. The artifact manifest has SHA-256
`069c480190fe06e9906b95e99cc0d6a156dd6731a5293e99f83f1b47b54ac822`;
author checks have SHA-256
`237e7e9b56df55913a89161b6b6868cb368c1c32a38db235b42e59a7453c06bc`.
The official Part IX template page remains blank; actual source-calculated
Part IX details appear in the appended reference. A reader-only Schedule E
widget suffix correction and a renderer output-directory setup correction are
retained separately; no source or saved PDF changed to satisfy those readers.

The private rebase uses exact upstream
`99592823f2bdb94841c0ac247f58a92fc7ac3360`, including the delivered prior465,
annual-interest, marriage and PDF batching changes. Thirty-eight reviewed blobs
are identical before this evidence update. Only `federal.ts` and `outputs.ts`
needed clean three-way merges for upstream health and interest additions.
The integrated focused cohort passed 89 tests across 20 files with one worker
in 15.62 seconds, including all 26 owned cases plus prior465, annual-interest,
marriage and readiness controls. Root/contracts/web types, 5,901 spec references
and current inventory pass. Scoped lint has zero errors and nine existing
warnings. All 553 predecessor inventory rows and 144 implementation links are
preserved exactly; three inventory rows and one own-spec link are added.
The earlier 483/69 development cohort and browser evidence remain scoped to the
original reviewed tree, not relabeled as final-base checks.

Parent independent original/PDF review of the unchanged original source and
artifacts is clear. It derived expectations from the eight raw canonical inputs
and actual guided state, without reading engine results or author oracles, and
passed 10,742 assertions over all 122 PDFs, 262 pages and 836 populated fields.
The parent inspected 17 contact sheets and eight readable pages. Report
`parent-passive-capital-artifact-review/checks.json` has SHA-256
`432d745a3f72f703408c1b4cb92354fd0d24bebb36d2a4bb3d06a2cfaab29d1e`.
The first reader retained nine incorrect expectations concerning the Form 8582
line 3 stop rule and a positive 2,000 QBI deduction; only the reader changed.
All original source and saved PDF hashes remained unchanged. This bounded
source/software and review-output clearance does not establish human tax
qualification, filing readiness or a matching published Part V mixed-term oracle.


## Parent final integration checks

The parent independently extracted final tree `8c539d0f` and verified all 3,576
regular files and six symlink targets. All 37 original owned blobs other than
the evidence ledger and the two already reviewed upstream merge files remain
identical. The final 29-file cohort passes 123 tests with one worker, retaining
all seven independent controls and adding actual-cash/outside-person health
and PDF batching regressions. All 3,582 archived entries remained unchanged.
Report `parent-passive-capital-final-tests.json` has SHA-256
`c3e18ba6aa52eb998a509cee0d8823d4d44505335ffe5ae0b62a32f78659629f`;
the test log has SHA-256
`5ab78aa2f6ec951e1b5483bb4e4bc582bbc18139d6948df66ecd267423c60417`.

An initial parent command included an extra argument separator and accidentally
started an unfiltered full suite. It was interrupted, with its failed deadline
observations, log and unchanged-source report retained. Only the command was
corrected; no test deadline, assertion or source calculation changed. That
interrupted command is not counted as completed verification.

Main integration preserves the separate documentation commit and all 43 frozen
package paths. Its 26 package tests in nine files, root/contracts/web types,
5,901 spec references, 556 inventory entries, root build and scoped lint all
pass. Lint reports zero errors and nine existing shared-file warnings. The final
metadata is `2025.173` / `2026.170-law-integration-draft`, with 145 explicit
implementation links and unchanged calculation, filing and human-review gates.
`k1-passive-capital-main-checks.json` records all eight successful commands and
their exact log hashes. Full integrated CI remains separate evidence.
