# Payroll and refund original browser journeys

Four finite 2025 guided journeys pass on desktop and mobile. This package fixes
the payroll adapter's handling of formatted currency and exercises actual source
confirmation, stale edits, recovery and year restrictions. It does not qualify
2026 calculations, filing or a distribution release.

The first actual four-case run failed. Saved browser state showed that the
currency control writes `230,000`, while the payroll packet required ungrouped
decimal strings. The adapter now validates the existing guided currency grammar
and uses Decimal for the three canonical payroll amounts. Raw drafts and captured
originals remain unchanged; blank, malformed, negative and overprecision values
reject. Equal-money lexical edits still require fresh capture and confirmation.
Spec-first regression reproduced five failures before correction. Main focused
34 tests and a separate 47-test replay pass.

Two test corrections followed observed browser failures. The refund test now
requires the unique Next.js route announcer while rejecting every other alert.
The payroll test waits for the exact restored-return URL before reloading; the
previous immediate reload canceled client navigation and left the home page.
Both corrections received separate review. All existing calculation, privacy,
source and year assertions remain, with no deadline or retry changes.

| Actual journey | Desktop 1280px | Mobile 390px |
| --- | ---: | ---: |
| Railroad payroll originals and encrypted recovery | 8,229 ms | 3,666 ms |
| Dated refund payment originals | 8,240 ms | 4,173 ms |

Each case passed once with a 30,000 ms deadline, two workers and zero retries.
Payroll checks include explicit zero, independently supplied 270 additional
Medicare tax/270 credit/15 Form 4137 tax/60,270 withholding, exact saved-source
custody, stale-source refusal and recapture. Encrypted backup, incorrect-password
refusal, restoration as a distinct local return and deletion of both returns
pass. Changing the restored return to 2026 preserves canonical, constants, review
and filing refusal. The actual review request returns 400 without a PDF; this
does not establish paper support for this cohort.

Refund checks retain the literal 300 historical recovery, 100 current-year
reduction and 900 state-income-tax deduction, original payment dates, actual
history, unknown-versus-zero and stale-source controls. These engineering
expectations remain subject to qualified tax review.

Payroll makes one same-origin review request per case and zero provider,
business-analysis or self-employment-analysis requests. Refund makes zero
requests in all four protected scopes. Raw/decoded privacy assertions, encrypted
artifact marker checks, no outside-origin requests, no page errors and all four
viewport geometry checks pass. The owned server closed normally. These checks
cover the named synthetic journeys and do not replace independent security review.

Main package checks pass: 34 focused tests, 865 metadata tests, all three type
checks, specification/inventory validation, strict scoped lint with zero warnings,
library build and the actual managed production web build. The final navigation
change also passes lint/spec/inventory checks. Its scoped test-type comparison
retains one existing `complete-facts.ts` diagnostic with zero new diagnostics;
that comparison is not a claim that the entire browser test graph is type-clean.

Collection is 588 cases: every previous 584 identity/status/deadline row and five
hosted-only skips are preserved, plus four additions. Both default-90-second and
explicit-30-second collection comparisons pass. All 150 previous request contracts
remain exact; there are now 152 contracts and 1,817 audited source hashes. The
inventory preserves all 916 previous entries and 68 supported statuses; three
new trace rows bring its total to 919 without a qualification increase.

Retained evidence under ignored `.local/upgrade-evidence/`:

- Currency author: `nov05-guided-rrta-formatted-currency-private`, manifest
  `c6483b8b812bfa7c7194ad717df01ba663274804551ef1baca50351e79b3baf1`.
- Currency distinct review: `nov05-guided-rrta-formatted-currency-independent`,
  manifest `1a0b78074e7b1798245e963c9226e3ede27bc1886952f3a29655cd251c5297ea`.
- Actual intermediate failure: `nov05-rrta-currency-main-integration`, manifest
  `fe6465baed2a1115ca8d8c24b0c897d31dc58b86b9b5f3e24c113f020a478d6c`.
- Reviewed navigation correction: `nov05-rrta-browser-restored-navigation-correction`,
  manifest `d94f3e51e9770d28b3d520ba81f5a60a7e82f5e49f94762e25d86546c6591a6f`.
- Actual final four-case pass: `nov05-rrta-refund-browser-final-navigation-run`,
  manifest `ec3ce1d09427973b1feeb5d690bf7bbd5277b57a675be6eaeea79151420f007e`.
- ROOT review and separate library build: `nov05-rrta-browser-root-review`.

Earlier failures remain preserved. The complete 588-case runtime and full current
unit/coverage checks follow separately. Remote CI/container scanning, hosted
outages, final native recovery, advisory disposition, final forms and independent
human reviews remain required by the execution brief.
