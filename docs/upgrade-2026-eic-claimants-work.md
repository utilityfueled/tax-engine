# Actual EIC claimant source correction

The canonical EIC call previously omitted claimant SSN/residency checks, used
only the primary filer's age on joint returns, and gave qualifying surviving
spouses the married-joint phase-out threshold. The bounded correction consumes
actual household facts and an optional year-bound claimant source packet, and
uses the nonjoint threshold for qualifying surviving spouses.

Official sources refreshed October25,2026:

- [Final2025 Publication596](https://www.irs.gov/publications/p596), Rules1,2,4
  and11: both joint filers need timely eligible SSNs; a nonresident claimant
  needs an actual valid joint resident election; either spouse can satisfy the
  childless age rule; surviving-spouse filing status uses nonjoint limits.
- [26 USC32](https://uscode.house.gov/us/usc/119-118/t26/s32/),
  (b)(2)(B),(c)(1)(A)/(D)/(E),(m), together with6013(g)/(h). These are effective
  ordinary claimant rules, separate from proposed REG-119882-25/Schedule3-A.

Actual source facts never come from printed SSN digits, residency months, a
defaulted election, or an inferred alive status. Original booleans remain
unknown/false/true; the source packet records its actual year/reference and
confirmation. Related household/source edits revoke confirmation. Legacy2025
inputs with no packet retain an explicitly unverified boundary while known
negative sources still apply. Potential positive2026 claims require actual
sources. An income-based zero or an independently known negative does not
invent missing affirmative qualification; supplied packets always reconcile
when EIC is evaluated. The full2026 and filing gates remain closed.

Literal controls are the published2025 maximum649; Pub596's23/27 joint-age
example; its actual death-day-before25 controls; QSS/single55,000 with one child
giving0 against the existing MFJ formula408; and indexed isolated2026 plateau
664. No formula/table calculation has changed apart from filing-status dispatch.
The positive2026 QBI fixture now supplies explicit synthetic EIC records rather
than obtaining affirmative facts from its unrelated business input.

Spec-first red evidence is retained privately in
`/private/tmp/tax-release-prereq-review-UEk43F/eic-core-red.log`,
`eic-guide-red.log`, `eic-no-claim-red.log`, `eic-known-negative-red.log` and
`eic-qss-red.log`. The corrected focused cohort passes71 tests across6 files.
An earlier broad run exposed110 failures from requiring claimant records before
an income-based zero; the corrected55-file rerun reduced these to two specific
cases, now covered by the known-age disqualification and explicit positive
synthetic source corrections. Final immutable verification is recorded below.

The initial private guide build, root/web types, strict4986-reference spec check
and desktop/mobile persistence/privacy cases passed. Both saved screenshots
were inspected. Source-free omission, known false and a restored unknown answer
remain distinct after reload, and no actual identity/source fields are posted.
Final source/static/browser results and independent review will supersede those
initial counts. Agent source/code review is not independent human tax or form
qualification. Other EIC qualifying-child, abode, dependency, recertification and
income methods remain separate from this claimant correction.


Independent review of immutable `bdf4e6aa1b79cf4dbb028768a3606acfa9ead054`
found no actionable claimant/QSS finding. The reviewer refreshed IRC32 and
Pub596 and independently passed53 package/adjacent cases plus five private
source probes (14 including nine repeated package cases). The probes covered
joint-age permutation/death, contradictory sources even at zero, irrelevant
childless death facts with qualifying children, negative2026 versus unknown
positive eligibility, and edit confirmation revocation. The source citation
was corrected to32(b)(2)(B); that correction changes no calculation.

The full initial immutable suite passed18,080 tests and failed only two old
edge-case expectations that incorrectly assigned MFJ thresholds to QSS, with33
skipped tests across1,044 files. Those assertions now use the nonjoint threshold
and existing-formula literal controls4,064 and105, preserving every assertion.
This does not implement the separate final EIC table/formula correction.

The identical executable and browser blobs passed root/web type checks,
5,014 strict spec references, lint with zero errors (six existing warnings),
a production web build and both desktop/mobile persistence/privacy browser
cases with zero retries. Both final screenshots were visually inspected.
Private logs are in `/private/tmp/tax-release-prereq-review-UEk43F`; independent
review logs are `federal-review-eic-tests.log`, `federal-review-eic-probes.log`
and `federal-review-eic-summary.md` under `.local/upgrade-evidence`.

Final corrected immutable tree `e8e65b2134e33993958f0380656c9b92c7519a71`
passes the complete `pnpm test --maxWorkers=1` run:18,082 tests passed,33
existing skips across1,044 files (354.01 seconds). The strict spec validator
again resolves all5,014 references. Only this final evidence paragraph follows
that checked tree; every executable, test and spec blob is identical. The
metadata revision is2025.106 /2026.101-law-integration-draft. The separate
childless dependency/main-home source and final table/formula packages remain
active work and are excluded from this commit.
