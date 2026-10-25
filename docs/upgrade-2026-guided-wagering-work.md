# Actual wagering-expense intake

The ordinary deductions guide omitted the engine's separate wagering-expense
source. It now collects that amount, validates it with actual winnings, forwards
it once when itemizing, and preserves blank, explicit zero and source cents.
Saved other-deduction totals reconcile investment interest, losses and expenses
using Decimal. The review and reported-expense subtotal show the separate fact;
changing deduction choice does not erase it.

Official sources refreshed October25,2026:
[26USC165(d), amendment and effective-date notes](https://uscode.house.gov/us/usc/119-118/t26/s165/)
and [final2025 ScheduleA instructions](https://www.irs.gov/instructions/i1040sca).
The existing2025 cap and2026 ninety-percent calculation are unchanged. The
adapter introduces no filing/year gate or eligibility default. The field excludes
wagers already recorded as losses, personal costs and amounts deducted elsewhere.

The spec preceded three failing tests on907b6db. All three reproduced discarded
expenses, missing validation, and wrong downstream deductions caused by the
omission. The isolated package passes56focused cases,834adjacent cases in82files,
root/web types,4,682spec references, production build and scoped lint with zero
errors/two existing bridge warnings. After rebasing onto4332623,61cases including
the new charitable collector and both type checks pass. A separate federal-law
agent reviewed the source/validation/Decimal/year handoff and ran four helper/DOM
cases, with no actionable finding in this package; this is software review, not
human tax qualification.

Two production browser cases pass at1280px and390px, with zero retries. They edit,
reload, change deduction choice, and preserve explicit zero and blank. The first
browser attempt failed because its expected stored winnings omitted the existing
currency field's thousands separator. The test expectation was corrected to the
actual formatting contract; the numeric, zero, persistence and privacy assertions
were retained. Network URL/body checks found neither the synthetic identifier nor
the wagering source key in those two flows. This bounded check is not a universal
privacy claim, hosted-staging evidence or final whole-branch verification.

Product validation used907b6db plus the scoped package in
`/private/tmp/tax-engine-checks-3rovf6y4`, then4332623 plus the same package in
`/private/tmp/tax-engine-checks-s8apssye`. No tax arithmetic, readiness gate,
coverage threshold, provider route or runtime dependency changed.

Local evidence hashes (the logs are not release artifacts):

| Evidence under `.local/upgrade-evidence/` | SHA256 |
| --- | --- |
| `guided-wagering-before.log` | `f12569c42a05be3927c4d20562e599d51e264b6983d6713f8ca8da240cb0ce27` |
| `guided-wagering-focused.log` | `74a4330294981b1a6b09ee71aaf463668625f280b890e0440a4ff2cb586df1e4` |
| `guided-wagering-adjacent.log` | `ac557a62f0ad736df2ea0261dd0ad6b38397cb29fd243ce4578fcaea2104f3fb` |
| `guided-wagering-rebase.log` | `f83f9523c79df0525bb64bd0c84e6faa6847a6004dfd223747c95a75963fac61` |
| `guided-wagering-types.log` | `1f5f9dc75cc5274365bbc129fa347c5c2fc34f9c42925e779f6f03654edb0c2c` |
| `guided-wagering-web-types.log` | `f9b1f2616f1128d077b78a499ceda614e42c84e3aacbbf43da1b9db844e81cc2` |
| `guided-wagering-rebase-types.log` | `16165d42797feae0ae1878328f555f33060820a23e988695686687c2fc4ac9b7` |
| `guided-wagering-rebase-web-types.log` | `9282830fb55d39c67d591e90b09067a079443b455f15fafbfcdee656a794d376` |
| `guided-wagering-spec.log` | `fbeeb6d3ccbb0164c1f2d21f6e5925817202a81e55968a854888f27a00907173` |
| `guided-wagering-lint.log` | `5e4addba4d594047018fe09e52f801bc80f170c0f4bc79d159d74d37142fe424` |
| `guided-wagering-build.log` | `ad654861a4a029bddcce5a70d5ebc713e3a87dc8ad6d404e2df00602d94d308e` |
| `guided-wagering-browser-first.log` | `4e897d5904b10995a956d718bc0f006f5329d015fe6582719000bb483331c98c` |
| `guided-wagering-browser.log` | `034e25b29d7bc1f2d04ebf5580e62e72912e0cfea7a76dd31197aaf3db4626c9` |
| `federal-review-guided-wagering.log` | `afe2f79202bc592c1d10687aa8d43b4ba4d5bbfc5d57a089b694ec7947d6bfba` |
