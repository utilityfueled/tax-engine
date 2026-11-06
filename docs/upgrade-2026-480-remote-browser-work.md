# Exact480 remote browser results

November5 UTC. Both Web executions are terminal failures. Application source
remains unchanged from045fbedb; these results do not qualify an image or explain
the timing differences between runs.

Head `480ca19d06a68032fce8fa08255e9f9c9e2c1e88` has tree
`23ce0702ef035135db208eba6621f2f3dcbdb4bd`. The PR execution checks out
merge `12873d2b3f3ec40519bc10bf34d04f20e2cf41cb`, whose tree is identical.
Execution identity and source identity are recorded separately.

| Execution | Browser job | Passed | Failed | Skipped | Contract |
| --- | --- | ---: | ---: | ---: | --- |
| [PR41943493646](https://github.com/utilityfueled/tax-engine/actions/runs/41943493646) | Managed | 563 | 2 | 5 | 90seconds, retry1, two workers |
| [Push41943484869](https://github.com/utilityfueled/tax-engine/actions/runs/41943484869) | Managed | 562 | 3 | 5 | 90seconds, retry1, two workers |
| Same PR | Container | 542 | 23 | 5 | 30seconds, retry0 |
| Same push | Container | 550 | 15 | 5 | 30seconds, retry0 |

All43 failed cases and48 failed attempts are retained. Every final managed
failure exhausted both its original attempt and configured retry. All failed
attempts report the whole-test deadline. The five hosted skips do not qualify
hosting. No workflow was cancelled, retried or rerun during this diagnosis.

Managed failures are Ohio part-year school refund/covered journeys. Different
attempts stop during source confirmation, saved-state checks, UI collapse or
the filing-denial request. Those are failed observations relative to the prior
managed565/five-skips result, despite unchanged scoped source bytes.

The container sets are subsets of the prior045's24 failures: saved-return
collapse, Ohio business, reciprocal, resident-credit and part-year school
journeys; the PR also fails two complete local lifecycle and two Pennsylvania
royalty journeys. These existing families remain required gates.

The mobile lifecycle ticker expected885 and sampled824 at its30-second
deadline, after observed values153,331,478,715,824. Source inspection shows
Decimal display animation. The sequence is consistent with interrupted
animation; it proves neither eventual correctness nor a stable tax error.
No CPU profile or current full trace timeline establishes a cause or fix.
Deadlines, retries, expected money, privacy controls and assertions remain
unchanged.

Both image builds and six-phase recovery, smoke, SBOM, scan and cleanup steps
have successful job metadata. Large runtime artifacts were not downloaded or
independently qualified in this package. Earlier fully bound045 image evidence
stays separately attributed in [its ledger](upgrade-2026-045-remote-verification-work.md).
The [push CI](https://github.com/utilityfueled/tax-engine/actions/runs/41943484794)
and [PR CI](https://github.com/utilityfueled/tax-engine/actions/runs/41943493651)
pass their static, unit and coverage jobs; that does not clear browser failures.

Independent saved evidence binds four complete public logs, all failed-attempt
blocks and eleven Git source blobs. Manifest SHA256
`998dd61fcad6e153bd3346db6f99725f00f5019fa174895c7cf3ef4331d65ec0`;
report `b65cc292876576af418be3b8633ad2ef1a6f08ef0bf4bfde466cc07c2974d8ca`;
receipt `1c130d9464577d8e3b44f29fbfa407747936647a2c6171af87a554ec4ada6250`.
ROOT verifies all30 frozen members and replays the pure log parser. No product
change, browser execution, credential access or workflow mutation occurs in
this evidence package. Native/hosted qualification, advisories, human reviews,
live AI evaluation and final2026 forms remain separate requirements.
