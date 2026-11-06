# November 6: baseline checks and remote runtime evidence

This evidence applies to source commit `d5109917e2f0699aa08bd4fcb4c2dbc42716e106`.
It does not qualify subsequent RRTA, Ohio or other application changes, hosted
operations, the native ARM64 release rehearsal, final forms or human reviews.

## Local checks

All twelve required local checks passed with unchanged thresholds and zero
recorded source drift: tests, coverage, three type checks, spec validation,
inventory, both builds, lint and the full browser suite. Unit and coverage runs
each passed 26,917 tests across 1,941 files. Coverage was 91.83% statements,
87.66% branches, 90.89% functions and 95.12% lines; the branch gate remains 85%.
The browser run passed 583 cases with five original hosted skips, zero failures
and zero retries. Those skips establish no hosted readiness.

The private thirty-member closure manifest is
`39f4f405003571c168aea237e3e25b6beb228d44e5dc2a049932eab843217b4d`.
Python/pypdf, the registry-bound official sample documents and the installed
Chromium browser were present. Local tests retained two workers and their
existing deadlines.

## Remote checks and immutable image

[CI run 42153989800](https://github.com/utilityfueled/tax-engine/actions/runs/42153989800)
passed all six jobs.
[Web run 42153989887](https://github.com/utilityfueled/tax-engine/actions/runs/42153989887)
passed the web build and self-host browser job; its container browser job failed.
Both runs are closed. The PR merge commit is
`77e59e6607e4db5eba4a48ea67c2a00c337400e4`; its tracked tree
`7c913ca43aa293b0d6c58d5711d2564c3b52e7f6` equals the d510 source tree.

The actual linux/amd64 container image is
`sha256:5c4635fcb7eaa8a862fd40d52137381a41e131d5c37428f9ed44999cd7bf50f5`.
Its embedded Syft and Grype image configurations, ten rootfs layers and supplied
source-binding hashes were independently verified against the saved artifacts.

| Browser distribution | Passed | Timed out | Original skips |
| --- | ---: | ---: | ---: |
| Self-host | 583 | 0 | 5 |
| Actual container image | 561 | 22 | 5 |

The two distributions contain the same 588 case identities. Every case has one
attempt and zero retries. Container ordinary deadlines remain 30 seconds,
self-host ordinary deadlines 90 seconds, with the existing audited body
overrides unchanged. Both retain two workers, all eight batches and seven
natural rate-window gaps exceeding 61 seconds in both clocks.

The 22 failures span Ohio business, resident-credit, reciprocal and part-year
school journeys, PA married payments and royalties, and passenger-source
collection. Independent trace analysis found cumulative locator/action costs;
twenty failures made no API request. Two Ohio business failures reached a review
PDF 200 before timing out later. No common application defect or CPU cause has
been established, and no timeout, assertion or quota was relaxed.

## Recovery and security

The saved six-phase synthetic Compose rehearsal passed previous version,
upgrade, database restart, dump/restore, rollback and re-upgrade. Database,
browser-fact and original-document hashes remained equal. Candidate phases bind
to the image above; previous/rollback use their separately recorded previous
image. Browser encryption, wrong-password/tamper rejection and deletion passed.
This is synthetic recovery evidence, not production recovery proof.

Syft 1.42.3 reports 279 packages; the CycloneDX package PURL set agrees. Grype
0.121.0 used a valid database built November 5 at 06:21:06 UTC. It reports 181
Debian vulnerability matches across 80 IDs: 61 High matches across 18 High IDs,
65 Medium, 11 Low, 44 Negligible and no Critical matches. It lists 136 `wont-fix`
and 45 `not-fixed` matches, with no fixed versions. The successful scan used the
existing Critical failure threshold; it does not mean a clean or accepted scan.

The 80 IDs equal the existing [image advisory register](upgrade-2026-image-advisories-20261104.json).
They remain unaccepted. The [current dependency ledger](upgrade-2026-security-refresh-20261105.md)
also retains seven advisory metadata conflicts, the elapsed November 4 review
deadline, Node's announced November 11 security update and missing accountable
human security disposition. This artifact review extends no deadline and grants
no risk acceptance.

## Evidence custody and remaining work

The complete saved ZIPs were verified against GitHub sizes and digests; 66 named
bounded members were extracted and compared to those ZIPs. ROOT rehashed all
124 members of the independent artifact packet and all 44 members of the
separate trace packet. Their manifest hashes are respectively
`21befe4fcef342cdd8ddad95a961e3cfbd5cd5c59826bd2a02e8c7fa6186e357`
and `5ca8a39e790f9795e66b5697477f9f118aba7b8e9d250eb387b1833bdb616781`.
The artifact review includes 82 saved-evidence checks and actual public-runner
reconciliation with four deadline/extra-attempt negative controls.

Container browser failures, security disposition, final-source reruns, hosted
outage/retry completion, native ARM64 execution, independently reviewed AI
qualification, qualified human tax/security review and final annual forms remain
open. No filing, model promotion, production deployment or release qualification
follows from these results.
