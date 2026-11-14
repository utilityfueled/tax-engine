# Current 2026 upgrade continuation

## November 13 on `main`

The public refs were refreshed. `origin/main` still points to `59248889`
and `origin/upgrade/2026-baseline` to `3024b848`. Successor commits stay on
local `main` while automatic production deployment is being disabled.
The November 14 03:29 UTC read-only Vercel check still finds the production
project linked to `main`, with automatic custom-domain assignment and no
build-ignore command or deployment policy.
The isolated rehearsal project has no Git link and protects all deployments.
The team is on Pro, whose Sandbox credits are shared and can incur overage.
No Sandbox was started. [Vercel Sandbox pricing](https://vercel.com/docs/sandbox/pricing).

`c339c6e9` enforces the hosted workspace limit atomically per owner in
PostgreSQL. Existing returns stay editable at capacity, and rejecting a new
workspace leaves its documents untouched. All 231 affected tests passed,
including real PostgreSQL concurrency, updates to older over-capacity data,
and the delete/update race. The independent two-process predecessor build
admitted two concurrent creations at 199 returns. `86cf13d5` adds that
request sequence to the production HTTP rehearsal. The fixed build passed
all 15 local checks with exactly one successful creation and verified cleanup.
[Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

`d6fed7fc` requires an HTTPS origin without credentials, path, query or
fragment for hosted production auth and billing. Invalid configuration
values stay out of diagnostics. The 277 focused tests passed. The local
production build passed all 15 HTTP checks via two certificate-verified
loopback HTTPS proxies, including real secure sessions and cleanup of all
six ports. `dcb9e7aa` applies the same production and Preview origin rules
to transient AI tax explanations before auth, rate limiting or provider
work. Six regressions failed first and all 103 affected tests passed.
[Hosted rehearsal contract](upgrade-2026-hosted-http-fault-rehearsal-spec.md).

The fresh official checks at 03:16 UTC on November 14 still show no final
2026 parent Form 1040, IRS tax and EIC tables or annual PA/OH forms in the
checked endpoints. Final 2026 Schedule 8812 has draft instructions. Ohio's
November 13 announcement is for draft instructions. `afb369d0` binds nine
fictional fact sets to actual authority and source digests, with separate
ordinary wage cases for every selected state/residency pair. All qualified
human decisions remain pending. [Independent review assignment](upgrade-2026-nov14-human-tax-review.md).

A fresh public npm audit on the current lockfile (`480e817a`) reported zero
known findings across 447 production and 539 total dependency records.
The publisher's Next.js advisory list still showed November 3 as the most
recent batch observed. The OpenAI and Google public catalogs reconfirmed the
documented rates and publication of the candidate profiles. No provider
request or project-access test followed this refresh.
[Next.js advisories](https://github.com/vercel/next.js/security/advisories) ·
[OpenAI pricing](https://developers.openai.com/api/docs/pricing) ·
[Gemini pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash).

`3c7ff065` validates actual federal estimate and extension payment dates even
when withholding removes the Form 2210 calculation. Legacy dates in the
return year or following year keep their original association. An out-of-window
date requires a confirmed application to the selected tax year. Confirmed
zeroes and exact cents are preserved. All 526 affected tests passed, including
2025 and isolated 2026 constants. The Form 2210 timing rules stay separately
scoped. `9b4a6ae5` collects the exact-year application in the guided estimate
and extension entries, preserves it through saved replay, and revokes the
affected confirmation when its underlying facts change. All 352 affected
tests passed. [Form 1040 instructions](https://www.irs.gov/instructions/i1040gi) ·
[Publication 505](https://www.irs.gov/publications/p505) ·
[IRS Direct Pay](https://www.irs.gov/payments/direct-pay-help).

`02e553cf` verifies the guided payment path in desktop and mobile Chromium,
including explicit zero, confirmation revocation, and reopening the return.
Both new cases failed on the predecessor and all 25 payment browser cases
passed on the updated build. Neither new case requested an API route. The
623-case audit retains the five hosted-only skips, all previous cases and
limits, and the 14 diagnostic cases.

`46103461` requires confirmation of the replacement student's actual AOTC
claim history before calculation. The same student's answer survives tax-ID
formatting and saved replay. Unversioned, prefilled zeroes still require
confirmation. Both regressions failed before the fix. All 540 affected
tests passed. [Form 8863 instructions](https://www.irs.gov/instructions/i8863).

`ee55baae` rejects altered fixture authors, disguised self-review and
reviews dated after the plan or measurement. `935f458f` applies the same
identity and date validation to current and rollback eligibility.
`7f8908c3` blocks mixed test plans and missing or reused provider references
while retaining reported exact costs. On the predecessor, 270 offline
synthetic rows across three profiles and ten held-out cases produced a
passing candidate group without a single provider request. The new checks
passed 94, 65 and 65 tests respectively. These controls validate the
supplied records. Genuine independent review, provider evidence and owner
authorization are still required. The production registry remains empty.

`80899776` binds AMD64 CycloneDX identity, revision, and Grype source to the
verified candidate and checks that the scanned bytes match the prior step's
receipt. The runtime suite passed 41 tests with one pre-existing skip. An
offline replay rejected the real foreign ARM64 SBOM. Current native AMD64
evidence still requires a runner with access to the held source.

`3d6a8e3a` pins Nodemailer 10.4.1, the publisher's first release with
both November 10 recipient-domain fixes. Offline JSON transport on
Node 22.12.0 reproduced both old envelope mismatches and verified both
patched envelopes. The app already requires bare ASCII recovery addresses.
The frozen install, 21 focused tests and web types passed on Node 26.13.1.
The npm production audit returned zero even before the patch, and both
production and full audits returned zero afterward.
[Domain parser advisory](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-3q53-mvfw-q9v8) ·
[Internationalized domain advisory](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-2g53-87p2-4qq8).

`dc7546f9` restores browser source admission for the reviewed tax
worksheets, disabled Form 4972 review candidate and mail dependency patch.
The audit differs only in eight file digests and its dependent diagnostic
digest. The test inventory, rate limits, skips, deadlines and retries
are identical. All 153 focused tests passed. Its managed run passed
27,947 unit tests with one exact lockfile assertion still on the prior
Nodemailer hash. Both previous Pennsylvania PDF timeout suites and all
five real local SMTP/PostgreSQL cases passed. The run stopped the owned
database before coverage and Chromium. `c8d15fb2` binds the same strict
check to the reviewed current lock. `6ef4e05e` refreshes three browser
source digests after the farmland changes. The 245 browser and runtime
controls passed with the same request contract, deadlines and retries.
[Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

The exact `dc7546f9` native ARM64 run independently imported and smoked
the image, generated its SBOM and scan, passed six Compose recovery
phases and passed 616 of 621 Chromium cases with five hosted-only skips.
It stopped normally and restored the user socket route. The app scan still
has 191 matches, including 56 High, and no risk acceptance.
`c5955541` adds per-run SCRAM authentication to the Compose rehearsal.
Actual local PostgreSQL 16.16 rejected missing and wrong credentials,
restarted and restored the exact amount through authenticated dump and
restore.
[Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

The exact `f22c1560` ARM64 successor passed independent image import, smoke,
scan, all six SCRAM Compose recovery phases and 616 Chromium cases with
five hosted-only skips and no failures. The test database rejected a missing
and a wrong password both before and after restart. Exact authenticated
recovery, rollback and normal VM cleanup passed. `c99109c4` later removes
the unused `infocmp` utility from the app runner and requires a working
`tput` terminfo query in smoke. All 42 focused runtime tests passed with one
existing skip. The successor native image and package disposition remain
open. [Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md) ·
[Debian advisory](https://security-tracker.debian.org/tracker/CVE-2025-69720).

`be41c0e3` adds the isolated Ohio venture capital gain estimate. A matching
issued Director certificate and confirmed cash acquisition and recognition
support the one-gain 100% or 50% deduction with exact cents. `ecd0ff80`
checks Pennsylvania's inclusive two-thirds gross-income test and reports
the two 2027 farmer dates with no annual return or payment integration.
The ordinary $14,000 wording, the $430 worksheet threshold, three
installment-date boundary differences and the farmer penalty worksheet
still need a reviewed treatment. `f22c1560` binds the browser audit to
these two sources with 206 focused controls passing.
[Ohio statute](https://codes.ohio.gov/assets/laws/revised-code/authenticated/57/5747/5747.01/3-5-2026/5747.01-3-5-2026.pdf) ·
[Pennsylvania instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2026/2026_rev-413i.pdf).

`df106681` records durable cancellation before transport without usage or a
score. If that record cannot be persisted, the full reserve stays held.
Once transport observes headers, a body failure retains the status and a
hashed provider request reference. All 67 focused tests passed and no paid
calls ran. The prior $0.022384 reserve still needs authoritative settlement.

Exact `dc7546f9` also passed all 14 local hosted HTTP checks across two
production Next processes. Real TLS PostgreSQL, a synthetic Redis REST
transport and synthetic users proved the local tenant and outage behavior.
Both Next processes stopped and all four loopback ports closed. The
current protected Preview remains a separate gate.
[Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

`52eec581` removes the optional Debian `mount` package from the
self-host runner using unforced package removal. The smoke test requires
the complete package inventory, an immutable-base removal dry run and
absence of `mount` and `umount`. The package was present in the earlier
ARM64 image and accounted for six scan matches, four high. The affected
local checks passed 148 tests with one PostgreSQL-only skip. Exact
`3ade5abe` passed ARM64 independent image import, smoke, SBOM, scan and
six Compose recovery phases. The scan delta is exactly six matches
from the removed package, with 191 remaining, including 56 High and
zero Critical. The browser guard stopped before collecting tests
because six source digests were stale. The VM and socket cleanup
passed. Shared util-linux findings and final-source qualification on
both architectures remain open.
[Debian CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642).

`845b3e9e` adds an AMD64 archive import check to the native GitHub Actions
container job. It exports the immutable build ID, imports the archive in a
fresh local Podman store, verifies image identity, configuration and layers,
and retains a sanitized receipt. The 158 focused checks, 17 mock archive and
binding controls, actionlint and standalone ShellCheck passed. The actual
AMD64 workflow awaits an authorized runner and the current source.

`c9ca587d` records the separate scans of the exact PostgreSQL dependency
for both architectures. Each official Bookworm image had 565 matches,
including 138 High and nine Critical matches across six advisory IDs.
The alternative Trixie ARM64 image retained the libxml2 parser match and
three gosu metadata matches. A safe in-place replacement has not been
qualified, and the dependency findings still require disposition.
[PostgreSQL image review](upgrade-2026-debian-advisory-refresh-20261113.md#postgresql-service-images-in-compose).

`19aebd59` verifies the signed Debian package archives and compares both
official PostgreSQL 16.16 Alpine images. Each yields 32 High and three
Critical matches, all in the Go module embedded in `gosu`. The three
Bookworm Critical advisory IDs disappear from that scan. The official
Alpine recipe omits several later upstream libxml2 fixes from its patch
list, so a zero scanner count for that library needs separate review.
The candidate also changes the operating-system user and ICU version.
The Compose pin stays on Bookworm pending a maintained patch or a
qualified migration, rollback and advisory disposition.
[Exact image comparison](upgrade-2026-postgres-alpine-comparison-20261113.md).

`52246eb5` and `50c72a04` calculate the 2026 Form 1062 payment deferral
for one confirmed direct farmland sale and replay its Schedule A originals.
The tests require an exact gain reconciliation, calculate the four equal
shares in Decimal, and preserve the potentially excludable 75% separately
from current estimated payments. The 521 focused tests, types, strict lint,
971-entry inventory and 8,953 spec references passed. The first commit
misattributed a synthetic case to IRS ATS scenario 13. The second corrects
that label. The IRS case is a partnership allocation, with $56,516 on
Schedule A line 13, blank lines 9–12, and $13,621 on Form 1062 line 14.
`1db55dc0` reproduces those printed amounts using synthetic confirmations
of the partner's originals. It passes 523 affected tests and 8,955 spec
references. The draft annual transfer has a $1 inconsistency in the
published example. The printed lines 24a and 24b show $18,309 and $3,405,
while line 24c shows $21,715. The sum of the printed amounts is $21,714.
Final guidance, original intake and qualified review remain open.
The worksheets have no live or export path. [IRS instructions](https://www.irs.gov/instructions/i1062) ·
[IRS ATS scenario 13](https://www.irs.gov/pub/irs-efile/ty26-1040-ats-scenario-13.pdf).
`75296bb1` also binds shareholder allocations to the separate Section
1062 statement accompanying domestic Form 1120-S K-1 box 17 code ZZ.
It requires reconciliation to the reported gain and leaves Schedule A
lines 9–12 blank. One regression failed first. All 468 affected tests,
types, strict lint, inventory and 8,957 spec references passed. Verified
attachment intake and the final annual transfer still need qualification.
[Form 1120-S instructions](https://www.irs.gov/instructions/i1120s).

`22b255c3` reconciles distinct elected sales to their combined recognized
gain before recomputing Form 1062 tax once for the return. The 254 focused
checks passed after three regressions failed on the prior implementation.
The implementation rejects duplicate source originals and a mismatch in the
independently confirmed gain total. It does not allocate tax among sales
or activate any return transfer. [IRS instructions](https://www.irs.gov/instructions/i1062).

`7c09766d` maps all 53 actual widgets on the current final Form 1062 and
Schedule A. The IRS posted both December 2025 revisions on April 15, 2026,
and the instructions cover calendar 2026. The different December 2026
drafts remain excluded. Twenty focused checks and four rendered synthetic
diagnostics verified redacted election amounts, direct and pass-through
dates and checkboxes, and exact PDF round-tripping. The mapping leaves
identity, property and covenant originals unfilled. Annual Form 1040
transfer, independently reviewed output and filing are still gated.
The final Form 1040 and tables endpoints still return 2025 materials.
The actual 2026 draft tables and final Form 4972 match prior pins.
At 22:00 Eastern the Pennsylvania PIT page still linked the 2025 return.
The 2026 PA-40, instructions and NRH paths returned 404. The 2026 PA-40 ES
and REV-413(I) estimate PDFs returned 200. The Ohio forms index returned
HTTP 404 with an access-error page. Direct 2025 IT 1040 and IT NRC links
returned actual PDFs, while the corresponding direct 2026 paths returned
404. This leaves PA and Ohio final annual form qualification open.
[Pennsylvania PIT](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) ·
[Ohio 2025 IT 1040 bundle](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/1040-bundle.pdf) ·
[Ohio 2025 IT NRC](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/itnrc.pdf).
[Current Form 1062](https://www.irs.gov/pub/irs-pdf/f1062.pdf) ·
[Current Schedule A](https://www.irs.gov/pub/irs-pdf/f1062sa.pdf) ·
[Final Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf).

`6cd57a42` computes the 2026 Schedule SE farm optional earnings estimate
for a confirmed cash-method sole proprietor who elects it. The estimate
uses the printed gross and net limits and carries the Decimal result from
line 15 to line 4b. All 172 affected checks, types, strict lint and 8,963
spec references passed. The inventory identifies the remaining packet and
filing gaps. A qualified reviewer still needs to reconcile cent amounts
near the printed $8,186 net-profit limit with the statutory adjusted
earnings rule before a full-return transfer is enabled.
[Final Schedule SE](https://www.irs.gov/pub/irs-prior/f1040sse--2026.pdf) ·
[Instructions](https://www.irs.gov/instructions/i1040sse) ·
[26 U.S.C. § 1402](https://uscode.house.gov/us/usc/119-134/t26/s1402/).

`43192f66` applies the IRS Publication 505 correction for one confirmed
2026 Form 1062 election. It carries 75% of the full-year applicable net
tax liability to Worksheet 2-1 line 11b and each applicable cumulative
Worksheet 2-9 line 20. Income inclusion is confirmed for each period,
and the adapter rejects inclusion before the sale. The published
$13,621 annual liability yields $10,215.75 in each confirmed period.
The implementation had an initial missing-module regression and a later
pre-sale-period regression. The 108 adjacent tests passed and a final
29-test run included the stricter boundary and lockfile successor.
There is no payment, penalty, export or filing integration. Multiple
sales with staggered recognition need a separate allocation method.
[IRS correction](https://www.irs.gov/forms-pubs/clarification-for-calculation-of-estimated-tax-payments-when-making-an-election-under-section-1062a).

`7924a91d` verifies the 2026 draft Schedule 3-A arithmetic in an isolated
worksheet for Forms 1040 and 1040-SR. It aggregates the four covered
refundable credits, preserves other payments, and leaves an unknown election
or eligibility unresolved. The published Treasury examples reproduce $821
and $3,021. The new suite failed before implementation and 1,388 affected
tests passed. Types, strict lint, inventory and all 8,938 spec references
passed. Treasury's effective date depends on publication of final regulations.
The draft has no live calculation, intake, filing or export path.
[Draft Schedule 3-A](https://www.irs.gov/pub/irs-dft/f1040s3a--dft.pdf) ·
[Proposed rule and examples](https://www.irs.gov/irb/2026-38_irb).

`3d8f674a` gives new OpenAI evaluation plans a private client trace per
attempt. The journal syncs it before dispatch, and the transport sends it
in the OpenAI request header. The scoring report excludes the trace.
Three regressions failed first and all 36 affected tests passed with
Node 26.13.1. The prior wire contract is byte-equivalent. The November 5
classification plan still needs its archived runner because its task
policies, application instructions and response schemas have since
changed. The older timeout still has no trace or settlement. No paid
requests ran. [OpenAI request tracing](https://developers.openai.com/api/reference/overview#supplying-your-own-request-id-with-x-client-request-id).

`cd4b3e29` allocates confirmed attributable estate tax for a single death
beneficiary electing both Parts II and III of Form 4972. The worksheet
subtracts the capital share on line 6 and the remainder on line 18. Line 8
uses the original capital gain. Three regressions failed first and 4,565
affected engine and PDF tests passed. The Part II-only case with positive
estate tax now has an isolated calculation and disabled physical candidate
in `3ade5abe`. For $20,000 in Box 2a, $5,000 in Box 3 and $2,000.25 in
attributable estate tax, the worksheet retains $15,000 of ordinary income
and $1,500.1875 of estate tax for separate annual review. It does not
populate Schedule A. Three engine and two PDF regressions failed first.
The combined affected suite passed 531 tests. The saved review PDF reopened
with six text fields, six selected answers, blank identity and Part III,
and a review notice on all four pages. All pages rendered, with pages 1
and 3 inspected. [Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf) ·
[IRS Publication 559](https://www.irs.gov/publications/p559).

`9758b773` maps the same worksheet to the disabled physical candidate and
requires the printed whole-dollar amounts to reconcile. The second reader
verified 58 widgets, 22 filled fields, six selections, blank identity
fields and a review notice on each page. All four pages rendered and
pages 1 and 3 were inspected. The broader PDF and Form 4972 suite passed
2,355 tests. Federal election integration and export qualification remain
open. [Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

Exact `f25ec56c` passed 11 of the 12 managed checks, including 27,904 tests
in both unit and coverage at 87.92% branch coverage. The browser gate
rejected stale source digests before server startup. The owned PostgreSQL
stopped. `e3c90730` updates six source digests and their dependent audit
digest. Request budgets, timeouts, collection and test windows match the
prior audit. Direct audit verification and 58 orchestration tests passed.
Its full managed checks are running from a verified archive.

`c2520fd5` uses the same exact provider ceiling for hosted credit holds
and the paid evaluation runner. For Sol Low, two tests showed that the
old 13-cent hold missed supported cache-write and regional pricing. The
new ceiling is 23 cents. The separately approved Sol High attempt adds
32 cents to its first-attempt hold. Settlement continues to use reported
usage. All 83 affected tests passed with real PostgreSQL and the isolated
cluster stopped. [OpenAI cache write rates](https://developers.openai.com/api/docs/guides/prompt-caching#cache-lifetime).

`021b2881` filters optional upstream request metadata before handing it
to hosted accounting. It retains bounded OpenAI identifiers matching the
documented examples, ignores unrelated headers and discards unexpected
metadata without changing known usage. Two regressions failed first and
all 61 affected tests passed. OpenAI permits opaque identifier formats to
change. A new format may leave a request without this reconciliation
identifier until reviewed. [OpenAI request debugging](https://developers.openai.com/api/reference/overview#debugging-requests).

The exact `e6a34ac3` managed archive passed all 12 checks with 27,895 tests
in both unit and coverage, 87.91% branch coverage, and 616 Chromium passes
with five hosted-only skips. Its owned PostgreSQL stopped. Exact `021b2881`
passed 11 managed checks with 27,913 tests in both unit and coverage and
87.92% branches. Its browser guard rejected stale source digests before
runtime and the owned database stopped. Exact `e3c90730` ARM64 passed
independent image import, smoke, SBOM and scan, six Compose recovery phases,
and 616 Chromium cases with five hosted-only skips. Normal VM stop and
socket restoration passed. The first preflight stopped before boot because
the staged public registry had mode 0600. Its bytes matched Git and the
successful retry restored the required mode. The separate managed macOS
run passed unit and coverage at 27,918 tests apiece and 87.92% branches.
It failed six browser cases with 610 passes and five hosted-only skips.
Exact `3d8f674a` passed unit and coverage with 27,921 tests apiece and
87.92% branches, but its managed browser build stopped before tests.
Both managed PostgreSQL instances stopped. The subsequent exact `52246eb5`
run passed 10 of 12 checks, including 27,935 unit tests. Coverage reached
27,915 passes before 12 case timeouts and a worker timeout. It emitted no
coverage percentage and the browser gate did not run. Its owned database
stopped. Exact `ceaa6582` subsequently passed nine checks and 27,940
unit cases before two Pennsylvania PDF cases timed out at 5 seconds.
The two affected suites passed all 34 cases on a separate targeted run
with the same deadlines. Coverage and browser did not run on
`ceaa6582`. Its owned PostgreSQL stopped.
[Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

Exact `7924a91d` passed 14 local hosted HTTP checks using two webpack-built
Next processes, TLS PostgreSQL 16.16 and a synthetic Redis REST transport.
This run verified shared limits, tenant isolation, deletion, and dependency
fault responses and recovery. Both servers stopped and four loopback
ports closed. [Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

`3a5c8375` preserves the provider's request identifier through a retry of
unknown-usage recording and through later settlement. It rejects contradictory
identifiers and settlement evidence without releasing or double-charging the
reservation. One regression failed before the fix and 97 real PostgreSQL
tests passed after it. Both owned test clusters stopped. No provider requests
ran, and the live evaluation timeout remains unreconciled.

`b49d48a8` admits confirmed attributable estate tax for the finite
single-beneficiary, ten-year-only Form 4972 method. A $2,000 deduction on
line 18 leaves $8,000 on line 19 and $880 of tax. Part II with positive
estate tax remains held. Three regressions failed first and 1,232 affected
tests passed. The saved four-page PDF passed strict readback for all 58
widgets, 16 filled fields and six selections. Its first rendered page
shows the expected amounts. [Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

`70aa593f` fills the A–G appreciation worksheet on the disabled Form 4972
candidate and prints the two required line 6 and 8 notes when the election
includes the appreciation. Three regressions failed first and 1,229 affected
tests passed. The second reader verified 58 widgets, 25 filled fields, five
selections and the two note positions. All four pages rendered. Pages 1 and
3 were visually checked. [Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

Exact ARM64 `e6a34ac3` passed independent runtime import, smoke, all
six Compose recovery phases and 616 Chromium cases with five hosted-only
skips. The named test VM stopped normally and the original user socket
route was restored. The image scan found 197 matches including 60 High and
zero Critical. [Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

`f25ec56c` calculates the confirmed own-plan Box 6 inclusion or deferral
and retains the A–G worksheet for Part II. Four regressions failed before
the calculation and physical guard were added. All 343 affected tests
passed, along with types, lint, inventory and 8,921 spec references. The
later physical candidate adds the printed annotations. The exact archive
has entered the full local checks.
[Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf) ·
[Form 1099-R instructions](https://www.irs.gov/instructions/i1099r).

`739178b7` maps the confirmed own-plan annuity adjustment for the disabled
Form 4972 candidate when its visible whole-dollar arithmetic reconciles.
Three cases failed before implementation and 278 affected tests passed.
A second reader verified all 58 widgets, five selections and 24 populated
fields. The rendered page shows the split ratio `0.1667`, $1,000 on line 21
and $1,550 on line 30. All four pages retain the review notice.
[Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

The exact `55ac0ee7` and `18104818` archives each passed all 12 local
checks, with 27,828 and 27,836 tests respectively, 87.89% branch coverage,
and 616 Chromium passes with five hosted-only skips each. Both owned
PostgreSQL instances stopped. These results cover their named sources.

`cdada768` projects the confirmed death-beneficiary election on the final
Form 4972 review candidate. It uses separate answers for the beneficiary's
prior own-plan and beneficiary elections. Three tests failed before the
mapper was added and all 1,148 affected tests passed. A second reader
verified 18 printed amounts, six selected boxes and all 58 widgets.
All four pages were rendered and visually checked. The form remains
unavailable through current-year exports.
[Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

`e6a34ac3` adds the internal own-plan annuity adjustment for a confirmed
Form 1099-R Box 8a. It apportions the allowance, removes the annuity's
separate tax and preserves the ordinary pension transfer. Six regressions
failed before the change and all 1,152 affected tests passed. Engine types,
lint, inventory, 8,918 spec references and the existing browser request and
diagnostic settings passed. The own-plan PDF candidate still requires zero
Box 8a. The exact full managed run is in progress.
[Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf) ·
[Form 1099-R Box 8a](https://www.irs.gov/instructions/i1099r).

`40c447d8` calculates the internal Form 4972 election for a single
death-beneficiary distribution with confirmed zero attributable estate tax.
It uses the participant's birth and death records and the beneficiary's
election history for that participant. Three tests failed before the method
was added. All 115 affected tests passed, with engine types, lint, inventory,
8,918 spec references and unchanged browser request limits. Federal
integration and filing qualification remain open.
[Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf) ·
[Publication 575](https://www.irs.gov/publications/p575).

`eda990d4` binds the ordinary Code A decision to the actual 2026 original,
unchecked IRA box and determined Box 2a, including explicit zero. It rejects
a retained decision after the code changes and prevents periodic-payment
inputs from filling an unknown lump-sum amount. Three new regressions failed
before the change and 392 affected tests passed on Node 26.13.1. Types,
scoped lint, inventory, 8,917 spec references and the browser source audit
passed. The 2025 path and 2026 election hold were verified.
[Form 1099-R instructions](https://www.irs.gov/instructions/i1099r) ·
[Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

`33fc07a2` preserves the original Box 3 amount for an explicit ordinary
2026 Code A decision. It reconciles to determined Box 2a and remains part
of that amount, with withholding carried separately. Two regressions failed
before the fix. All 394 affected tests passed, with engine and web types,
8,917 spec references, inventory and the existing browser request budget.
[Form 1099-R instructions](https://www.irs.gov/instructions/i1099r).

`ef86f0cb` maps the final four-page 2026 Form 4972 as a disabled review
candidate for the finite own-plan worksheet. All 51 focused tests passed.
The separately saved specimen passed strict readback for all 58 fields,
with review notices on all four pages. Identity fields were blank and the
output contained no XFA, JavaScript or reader-rights data. There is no
enabled federal election or filing export.
[Final 2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

`4593c4ec` calculates the 2026 Form 4972 capital gain and ten-year elections
for an eligible participant's own single distribution. It requires confirmed
eligibility and reconciled original amounts. All 125 focused checks passed,
including Decimal boundary amounts on both sides of every printed rate band.
Engine types, lint, 8,911 spec references, inventory and the browser request
audit passed. Shared-distribution and other special worksheets, federal
integration and export qualification are open.
[Final 2026 Form 4972 and instructions](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

`18104818` collects the actual 2026 Code A reporting choice, requires a
determined taxable amount and clears the choice when the source year, code or
IRA classification changes. The choice and follow-up were verified in 305
focused tests, including the actual component, with web types, lint and 8,905
spec references. The separate Form 4972 federal route remains held.

`797dc60a` removes set-user-ID and set-group-ID bits from regular files in the
standalone image. The earlier ARM64 image contained 11 such files. `55ac0ee7`
checks the exact imported image in a separate read-only, network-disabled
inspection container, including private image directories. The `4593c4ec`
ARM64 smoke found no set-ID files, and all six Compose recovery phases
passed. Its Chromium preflight refused the source staging directory after
archive extraction changed its permissions. The corrected `ef86f0cb`
archive passed the preflight, six recovery phases and 616 Chromium cases,
with five hosted-only skips. Normal stop and socket restoration passed.
The separate managed run on that revision found two stale verification
bindings, corrected in `e6a34ac3`. Image advisory dispositions remain open.
[Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md) ·
[Debian privileged mount advisory](https://security-tracker.debian.org/tracker/CVE-2026-76642).

`f42a8352` requires an explicit ordinary reporting decision before using
the known taxable amount on a 2026 qualified lump-sum Code A statement.
An actual Form 4972 election stays held for its separate method. Seven
regressions failed before the fix and all 417 affected tests passed, with
types, lint, 8,904 spec references, inventory and the browser request audit.
The exact archive separately passed 14 synthetic hosted HTTP checks against
local TLS PostgreSQL and controlled Redis, then restored all 11 synthetic
PostgreSQL tables with exact cost, billing idempotency and metadata cleanup.
The IRS now publishes final 2026 Form 4972. Its final 2026 Form 1040 and
Tax/EIC tables remain pending at the official endpoints.
[2026 Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf) ·
[Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) ·
[Tax/EIC tables](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf).

`cd5dd249` requires actual owner evidence for ordinary 2026 traditional IRA
taxability. The guided zero-basis confirmation now reaches the calculation.
Alternatively, the engine validates the separate Form 8606 source packet
before accepting unresolved payer amounts. A known Trump account or nonzero
Box 7d needs a separate method. The 677 affected tests, engine and web types,
8,903 spec references, inventory and browser request audit passed. The
ordinary source guard leaves the production 2026 gate closed.
[2026 Form 1099-R instructions](https://www.irs.gov/instructions/i1099r) ·
[Publication 590-B](https://www.irs.gov/publications/p590b) ·
[Form 8606 instructions](https://www.irs.gov/instructions/i8606).

`976a63bc` applies Ohio's separate $50 earned-income school-district
senior credit to the confirmed single full-year wage draft. The school credit
is capped by its own liability and has no state-credit MAGI ceiling. State
and school withholding and refunds remain separately reconciled. Two new
cases reproduced the missing calculation. All 384 affected checks, types,
lint, 8,902 spec references, inventory and the existing browser request audit
passed. January 1, 1962 age attainment and final state qualification remain
held. [State sources and evidence](upgrade-2026-state-gaps.md).

`005394da` requires the original Box 7a code and determined taxability
for non-IRA pensions in the 2026 federal engine. A blank Box 2a or a
reported unknown amount requires a complete supported worksheet unless
the actual code and source establish a separately supported exclusion.
The current-year guard preserves known zero, taxable Code G rollovers
and the historical fallback. Ten new draft integration cases reproduced
the defect before the change. The affected suites passed 646 tests, with
engine types, 8,901 spec references, inventory and the browser audit.
The production 2026 federal gate remains closed.
[2026 Form 1099-R instructions](https://www.irs.gov/instructions/i1099r) ·
[Publication 575](https://www.irs.gov/publications/p575).

`a022a2ec` replaces raw shared Redis identifiers with application-keyed
pseudonyms. The exact webpack build passed 14 local hosted HTTP checks,
including cross-process quota and outage/recovery. The protected Preview
passed both synthetic sign-in and session checks, denied their canceled
trial entitlements, and stored only two versioned Redis keys. The Preview,
its four temporary settings and those Redis buckets were removed. Current
lockfile production and full registry audits reported zero advisories across
447 and 539 dependencies respectively. The exact ARM64 image passed import,
smoke, SBOM and scan, six Compose recovery phases and 616 Chromium cases
with five hosted-only skips. Normal stop and socket restoration passed.
All 12 managed checks also passed on the exact archive. Unit and coverage
each passed 27,763 tests at 87.87% branch coverage. Chromium passed 616
cases with five hosted-only skips, and the isolated PostgreSQL stopped.
[Hosted and recovery evidence](upgrade-2026-nov13-release-rehearsals.md).

`29fb2d29` adds Ohio's $50 senior credit to the internal withholding-only
wage draft across all three residency categories. It binds prior credit
history to the actual owners and applies the senior credit before personal,
joint and residency credits. The January 1, 1962 age boundary remains held
for Ohio-specific confirmation. Five regressions reproduced the missing method
and all 348 affected checks passed. `e414cb0e` fixes a Pennsylvania guided
handoff that rejected a saved return solely because it retained a neutral
Form 8812 interview object. Two regressions reproduced that failure and all
73 affected checks passed. Positive exclusions, combat pay and unknown fields
still require separate source methods. Both drafts await qualified review and
final state form qualification. [State sources and evidence](upgrade-2026-state-gaps.md).

`813242a5` adds a zero-credit proof to the Pennsylvania wage draft for
confirmed childless, living single filers outside the federal EIC age range.
It reuses the federal calendar rule and keeps the within-age, below-cutoff
case unavailable. Confirmed income of $15,000 with a birth date of December
31, 1961 or January 2, 2002 produces $461 in state tax before credits and
zero federal EIC and Pennsylvania working credit. The adjacent eligible
birth dates, stale or missing child evidence, invalid dates and contradictory
death facts cannot use this proof. Two failing tests preceded the fix.
All 81 focused checks and 8,899 spec references passed, with types, inventory
and scoped lint. `b7ffd2c1` binds the reviewed changes to the unchanged browser
request budget. All 178 orchestration and runtime proof checks passed.
The exact `b7ffd2c1` archive passed all 12 checks. Unit and coverage each
passed 27,760 tests at 87.87% branch coverage. Chromium passed 616 cases
with five hosted-only skips. The isolated PostgreSQL cluster stopped.
[IRS Publication 596 Rule 11](https://www.irs.gov/publications/p596) ·
[Pennsylvania Act 45 of 2025](https://www.palegis.us/statutes/unconsolidated/law-information/view-statute?ActNum=0045.&SessInd=0&SessYr=2025&txtType=PDF).

`f7953115` applies the Pennsylvania retained death-date guard before both
the high-income and childless proof branches. Omitted or null dates still
work with a confirmed full-year living fact. A retained date must go through
a separately qualified method. The regression reproduced the unguarded
high-income path and now checks contradictory records across all three
residency categories. All 76 focused checks, 8,900 spec references, engine
and web types, inventory and scoped lint passed. `0fb0c9a5` binds the browser
audit to that change with unchanged windows and collection. All 179
orchestration and provenance checks passed.
The `0fb0c9a5` native ARM64 run passed image import, smoke, SBOM and scan,
all six Compose recovery phases and 616 Chromium cases with five hosted-only
skips. Normal stop and socket restoration were verified. All 12 checks
passed for the separate exact managed archive, with 27,761 unit and coverage
tests at 87.87% branch coverage, 616 Chromium passes, the same five hosted
skips and PostgreSQL stopped.
[Pennsylvania DFO-02](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/dfo-02.pdf) ·
[IRS Form 1040 instructions](https://www.irs.gov/instructions/i1040gi).

`00f5a9b1` projects the IRS Taylor and Finley building-exchange examples on
the disabled final Form 8824. All 162 focused checks passed. Independent
Decimal derivations and a second PDF reader verified the two ordinary
recapture methods, the $131,250 and $43,750 split for Finley, blank identity
and review marks. All four pages were rendered and visually checked.
[IRS examples](https://www.irs.gov/instructions/i8824).

`8d666cc1` projects confirmed later installment years on the final 2026
Form 6252. All 124 focused tests passed. The saved specimen preserves the
original sale-year ratio and $18,750 of current long-term gain. `f4b0b608`
adds the deferred investment-land specimen to final Form 8824. The day 45,
day 180 and ordinary filing-deadline controls passed, including a valid
extension. All 115 focused checks and 8,891 spec references passed. A separate
reader verified both pages and all 68 widgets. Both annual projections are
disabled in public exports and await independent qualified tax review.
[Form 6252 evidence](upgrade-2026-form-6252-investment-land-work.md) ·
[IRS Form 8824 instructions](https://www.irs.gov/instructions/i8824).

`6ba7ce71` corrects Form 8824 lines 15 and 18 for both supported calculation
years. It accounts for cash paid and expenses applied against cash, other
property or net liability relief. Five failing regressions preceded the fix.
All 535 targeted tests passed. `f5e5a80c` adds a disabled 2026 physical
projection for a confirmed simultaneous exchange of domestic investment
land. All 88 focused tests passed. A separate reader reopened 18 text values
and one checkbox across 68 widgets, with blank identity and both review
watermarks. Both pages were rendered and visually checked. `c2907701` adds
single-class Section 1245 and Section 1250 recapture for confirmed original
amounts. All 532 focused checks passed, including the IRS Taylor and Finley
cases and the federal ordinary-income transfer. Mixed relinquished recapture
classes, broader physical forms and qualified review remain open.
[Final 2026 Form 8824](https://www.irs.gov/pub/irs-prior/f8824--2026.pdf) ·
[IRS instructions](https://www.irs.gov/instructions/i8824).

`f94bb638` calculates Form 8824 lines 25a through 25c from a complete
confirmed replacement appraisal and keeps deferred Section 1250 recapture
out of current income. The IRS Finley example yields $131,250 on line 25a,
$43,750 on line 25b and $5,000 of potential future ordinary recapture.
The non-filing reference summary shows the applicable basis lines and
omits private appraisal references. Three regressions failed before the
fixes. All 569 focused tests and 8,889 spec references passed, along with
types, lint and coverage inventory. Per-asset allocations and broader
physical projections still require their own evidence.
[IRS basis and recapture example](https://www.irs.gov/instructions/i8824).

`6cccc932` documents the full W-2 Code Q amount in IRA compensation and the
separate elections for Form 2441 Parts II and III. Changing W-2 or business
income sources requires confirming the Part II worksheet again. The original
answers stay available for review. All 299 focused tests passed. The exact
archive passed 11 of 12 checks, including 27,717 unit and coverage tests and
87.85% branch coverage. Chromium refused four stale audit digests before
collection. `8052fac5` rebinds the changed reviewed files. The next combined
run on `2e258445` passed its first nine checks and failed one unit test because
the optional diagnostic still pinned the old audit. `115cbb52` rebinds that
diagnostic and its full 621-case collection. Its exact archive passed unit
and coverage checks with 27,738 tests in 2,006 files and 87.85% branch
coverage. Its managed browser suite passed 621 cases with five hosted-only
skips and no failures. All 12 checks passed. Unit and coverage output for
`f94bb638` show 27,746 passes in 2,006 files and 87.86% branch coverage. The
`f4b0b608` unit output shows 27,750 passes in 2,006 files. Their combined
controllers were interrupted before a terminal receipt. Both disposable
databases were stopped normally. An exact combined run on `00f5a9b1` is
complete. All 12 checks passed, with 27,752 tests in 2,006 files and 87.87%
branch coverage. Chromium collected 621 cases, passed 616 and recorded the
five original hosted-only skips. The `391e2d92` archive passed its unit
and coverage runs with 27,758 tests and 87.87% branch coverage. Its browser
check refused the stale audit before starting the server. Both disposable
PostgreSQL instances were stopped and their cleanup verified.
[Care and IRA evidence](upgrade-2026-care-ira-combat-pay-work.md).

Two isolated protected Previews tested the `b7ffd2c1` archive. The first
confirmed that the startup guard refuses to boot when shared Redis settings
are absent. The second used a synthetic unreachable loopback Redis endpoint.
Liveness returned 200 with no-store, and auth and workspace returned private
503 responses. The workspace response included a five-second retry header.
Both builds were removed and absence was verified. A separate rehearsal
with two local Next production processes and PostgreSQL 16.16 TLS passed
13 HTTP checks and verified cleanup. [Rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

The actual ARM64 `2e258445` image passed import, smoke, six Compose phases
and encrypted browser backup/restore. The security scan found 86 open Debian
advisories that still need owner disposition. `93d6b26e` verifies the
observed Podman 6 capability, tmpfs and environment metadata while retaining
the hardened profile and exact source checks. `3b5b2ca6` passed native ARM64
build, smoke, scan and six recovery phases. Host Chromium against that
image passed 621 cases with five hosted-only skips and zero failures.
The test VM stopped normally and its socket route was restored. The later
`f4b0b608` ARM64 run also passed smoke, all six recovery phases and 621
Chromium cases with five hosted-only skips and zero failures. A separate
cleanup verified the VM stopped and the original socket route was restored
after the controller interruption. Release evidence is still required for
the newer source and AMD64.
[Self-host evidence](upgrade-2026-nov13-release-rehearsals.md) ·
[Advisory register](upgrade-2026-image-advisories-20261113-arm64.json).

`439d4c87` implements each filer's separate EIC election for all original
W-2 Code Q amounts, preserves exact cents and renders elected pay on
2025 Form 1040 line 1i. All 206 targeted checks passed. Its exact archive
passed all 12 checks with PostgreSQL 16.16. Unit and coverage each passed
27,715 tests across 2,006 files at 87.85% branch coverage. Managed Chromium
passed 621 cases with five hosted-only skips. [Election evidence](upgrade-2026-eic-combat-pay-work.md).

The exact `ab47d87f` archive passed all 12 checks. Unit and coverage passed
27,684 tests across 2,004 files at 87.83% branch coverage. Managed Chromium
passed 616 cases with five hosted-only skips. The checks and browser receipt
SHA-256 values are
`29693b651db91d9ef9d0662664f73690a446e8ca54944bfed4efb3ff8ee028c7` and
`7e04851651431dc73ff9aece0ffc3fe66a4d4d9bd6fc4ff9ac657982503f0237`.
The approved isolated Preview build was submitted from that tracked
archive. The new free schema-only Neon branch and restricted database login
passed TLS/channel-binding checks. Only the isolated sensitive Preview
database setting was updated. A second protected build enabled the workspace
backend. Two test owners wrote and reopened distinct workspaces under the same
return ID. Anonymous requests returned 401 with private no-store headers.
A signed Stripe Sandbox event received a 503 at 14:32:17 UTC during the
database login outage. Login was restored at 14:33:02 UTC. Stripe's automatic
retry returned 200 at 15:31:58 UTC. Database readback found exactly one receipt
for the retried event, no change to the second account and zero scoped AI
effects. No manual resend was issued. Both trials were canceled without
invoicing or proration. The original Sandbox webhook settings were restored.
An isolated build of the same source used a synthetic invalid Upstash REST
token. The protected workspace route returned a 503 with `Retry-After: 5`
and `Cache-Control: no-store`. The healthy Preview returned 401 before and
after the fault test. This exercises an actual credential failure at Redis.
[Hosted and native rehearsal evidence](upgrade-2026-nov13-release-rehearsals.md).

`6e7b046b` requires a separate military compensation method for a positive
actual W-2 Code Q on the covered ordinary PA and Ohio paths. Nine baseline
failures reproduced the admission gap. All 7,348 targeted tests passed,
including zero controls and cases across all three residency statuses.
[State evidence](upgrade-2026-state-combat-pay-boundary-work.md).

`5c6633e2` projects a bounded confirmed-wage case on the final 2026 Schedule
8812. All 78 focused tests passed. A separate reader verified the saved
specimen and both pages rendered. Full qualification, companion instructions
and human review remain open. [Projection evidence](upgrade-2026-schedule-8812-wage-projection-work.md).

`c699bfde` includes the full original W-2 Code Q amount in Schedule 8812
earned income and records it separately on line 18b for 2025 and 2026.
The guided interview preserves exact cents and distinguishes an unchecked
box from confirmed zero. A synthetic $2,250.50 source increased ACTC to $263
with $2,000 taxable wages. All 597 targeted tests passed, including reopening
the 2025 review PDF. The separate EIC election is covered above.
[Combat pay evidence](upgrade-2026-ctc-combat-pay-work.md).

`ab47d87f` validates a claimed child's birth date before counting the child
for the 2026 CTC or ACTC. The direct engine rejected four new invalid cases
after previously accepting them. It distinguishes December 31, 2009 from
January 1, 2010 and accepts a qualifying December 31, 2026 newborn. An
independent ODC claim still requires its own timely TIN. All 519 focused
federal and PDF tests passed. [Final Schedule 8812](https://www.irs.gov/pub/irs-prior/f1040s8--2026.pdf) ·
[Revenue Ruling 2003-72](https://www.irs.gov/pub/irs-drop/rr-03-72.pdf).

`e4e56480` keeps guided review and original document parsing in the browser.
The production browser reproduced an automatic review POST before the change.
The first successor exposed Next.js parsing multipart data at the unmatched
URL. Both retired URLs now return 404 before parsing. All 36 production-build
Chromium cases, 63 middleware and parser tests, web types, lint, model artifacts,
inventory and 8,859 spec references passed.
[Local review and upload evidence](upgrade-2026-local-review-upload-work.md).

`9f9a5598` projects a confirmed paper payment onto the disabled final Form
1040-V. The $1,234.56 partial payment against a $1,500 balance fills one field.
A strict PDF readback and visual check confirmed both pages, exact cents,
blank identity and address, and review watermarks. All 52 targeted tests passed.
[Form 1040-V evidence](upgrade-2026-form-1040-v-paper-work.md).

All 12 checks passed on the exact `2f317cb4` archive with PostgreSQL 16.16.
Unit and coverage each passed 27,670 tests across 2,004 files and reached
87.80% branch coverage. Managed Chromium collected 620 cases, passed 615
and skipped five hosted-only cases. The checks receipt SHA-256 is
`675f8e321cc520629f534cef78518b1f823ee2d12ad2fc068394980dcf3417c9`.

`e4189ec7` projects ordinary 2026 IRA distributions onto two separate
disabled Form 8606 specimens. The primary and spouse examples show $668 and
$1,600 of taxable distributions. The separate Decimal and PDF readback
confirmed 36 written values, 94 widgets, four review notices and blank
identity. All 109 targeted tests, types, engine build, lint, inventory and
8,855 spec references passed. Final instructions, parent-return transfer and
qualified review remain open. [Form 8606 evidence](upgrade-2026-form-8606-ordinary-work.md).

`a68f71ab` projects an ordinary current-year installment sale of investment
land onto the disabled final Form 6252. The $120,000 sale has $75,000 gross
profit, a 0.6250 ratio and $18,750 current long-term gain. Actual dates, basis,
current principal and one later payment are required. A strict parser checked
25 text values, two marked boxes, all 49 widget locations and blank identity
on a four-page saved specimen. Both PDF previews and filing stay gated.
[Form 6252 evidence](upgrade-2026-form-6252-investment-land-work.md).

`651fa206` pins Next.js and its lint plugin to 16.4.6. The lockfile delta
updates only the Next.js family and its peer references. Frozen install,
632 targeted tests, 40 production-build Chromium cases, all types, builds,
lint and inventory passed. Both npm audits returned zero advisories. The
full archive passed the first nine checks and failed two unit assertions.
`85a5cff4` pins the verified new lockfile hash, and `74b7f092` checks that
the previous explanation prompt stays ineligible even with the same schema.
The 91 focused tests passed with one environment-dependent skip. Exact
`e4189ec7` passed 11 checks, including 27,675 unit and coverage tests across
2,004 files at 87.81% branch coverage. Its first browser invocation collected
620 and stopped before execution because the archive lacked the untracked
public samples. The same-source browser rerun passed 615 with five hosted-only
skips after restoring the byte-checked samples. The combined 12 checks are green.
Container qualification and Debian advisory dispositions remain open.
[Next.js 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6) ·
[Next.js security advisories](https://github.com/vercel/next.js/security/advisories).

The Debian refresh matched all 81 advisories from the November 6 AMD64
artifact. Three zlib rows now list the security package already pinned in
both Docker stages. The remaining 78 trixie rows are open and unchanged.
Current image scans and accountable dispositions remain pending.
[Debian refresh evidence](upgrade-2026-debian-advisory-refresh-20261113.md).

`3c93d1ad` enforces the workspace AI request projection on the server and
keeps only kind and coverage for selected documents. The raw request still
passes the existing direct-identifier check. The provider receives no route
IDs, section IDs, document names, detected amounts or unrecognized fields.
A crafted synthetic request reproduced the prior leakage into mocked provider
transport. The successor passed 284 targeted tests and 40 production-build
Chromium cases, plus types, builds, scoped lint and model registry checks.
The summary and explanation prompts moved to version 4 and require matching
evaluation evidence. No live provider call or promotion occurred.

`1c8dabe5` fills the disabled 2026 Schedule SE candidate from current primary
W-2 Boxes 3 and 7 and the reconciled wagering business, including linked
W-2Gs. The $183,500 test leaves $1,000 of wage base and yields $204 tax and a
$102 deduction. At $184,500, the saved PDF leaves lines 8b through 10 empty
and shows $80 tax and a $40 deduction. An independent Decimal calculation
and strict parser reproduced nine written values, all 27 widget locations,
blank identity and two review notices. Both pages were rendered and examined.
All 3,141 targeted tests, three type checks, engine build, scoped lint,
inventory and 8,853 spec references passed. Distinct employer originals,
exact amounts and separate payroll-source confirmation are required.
[Final Schedule SE](https://www.irs.gov/pub/irs-prior/f1040sse--2026.pdf) ·
[W-2 instructions](https://www.irs.gov/pub/irs-prior/iw2w3--2026.pdf).

`2f317cb4` limits workspace AI requests to the fields consumed by the task.
It redacts the user question and conversation alongside the workspace before
transport. Audit history, structured facts, preview values, and unselected
documents stay out of that request. The failing synthetic test reproduced
an unredacted name and email in helper text. The fix passed 238 focused
tests, 40 production-build Chromium cases, all type checks, both builds,
lint, inventory and the model registry check. The browser test now pins
synthetic metadata and verifies the existing default of zero provider
requests. Unit and coverage each passed all 27,670 tests in 2,004 files,
with 87.80% branches. The full browser check is still running. No
live provider calls or route promotion were involved.

`14ad47f1` accepts individual 2026 cash-slot W-2G originals in the
professional wagering interview. The source test retains $8,000.05 of
annual gross gains and $1,200.01 of federal withholding across two original
statements, including a confirmed zero. The editor requires an independent
ledger gain for each payment and reuses the federal reconciliation before
the section can advance. The 5,163 focused tests, four Chromium cases, all
three type checks, both builds, lint, inventory and 8,852 spec references
passed. The mobile case verified reload, edit invalidation and zero protected
requests. The 65 unrelated focused skips include database-dependent cases.
Broader statement types, state composition and human review remain open.
[Final W-2G](https://www.irs.gov/pub/irs-prior/fw2g--2026.pdf) ·
[Instructions](https://www.irs.gov/instructions/iw2g).

`dc98bc06` projects the verified profit of one 2026 wagering business onto
the disabled final Schedule SE. It requires explicit regular-method and
complete-source confirmations. The $3,000 profit gives $2,771 adjusted
earnings, $424 tax and a $212 deduction. A separate Decimal calculation and
strict parser reproduced the 12 filled values, verified all 27 widget
positions and confirmed blank identity. Both pages and their review notices
were rendered and inspected. The 1,712 focused checks, types, builds, lint,
inventory and 8,851 spec references passed. A conflicting whole-dollar
transfer stays held. Wages, other SE sources and filing are outside this
candidate. [Final Schedule SE](https://www.irs.gov/pub/irs-prior/f1040sse--2026.pdf) ·
[Final instructions](https://www.irs.gov/pub/irs-prior/i1040sse--2026.pdf).

`bf85d34a` preserves a documented Yes and No in the same Pennsylvania local
filing inventory. A reported local W-2 row can link to either documented
decision. Its $500.25 of local withholding stays outside the $1,197 PA
withholding. Unknown or all-No inventories remain held. The 3,474 focused
checks, types, builds, lint, inventory and 8,849 spec references passed.
[PA local withholding](https://dced.pa.gov/local-government/local-income-tax-information/local-withholding-tax-faqs/) ·
[PA local EIT regulations](https://dced.pa.gov/download/local-earned-income-tax-regulations-9-1-2018/?wpdmdl=56769).

`34168bdc` accepts parsed original wage packets for Ohio residents,
part-year residents and nonresidents. The cases retain the same $68, $441 and
$814 refunds. A stale snapshot, unrecognized empty key or retained
unsupported zero-value document is still rejected. The 4,840 focused tests,
types, builds, lint, inventory and 8,848 spec references passed. Parsed
Schedule C amounts still need source proof because the schema can default
unreported expense fields to zero. The exact archive of both state changes
and the preceding Form 3903 candidate passed all 12 checks at `bf85d34a`.
Unit and coverage each passed 27,666 tests in 2,003 files at 87.79% branch
coverage. Managed Chromium passed 615 cases with five hosted-only skips.
[Ohio Revised Code §5747.02](https://codes.ohio.gov/ohio-revised-code/section-5747.02).

`65764509` projects the confirmed federal-only 2026 single-taxpayer move
onto the disabled final Form 3903. Its original Code P and omitted excess
must reconcile when line 4 is positive. An independent Decimal calculation
reproduced $70.44 of travel and each line 5 branch. A separate strict parser
checked 30 widgets on three saved forms, and all three pages were rendered
and inspected. The 49 focused checks, types, builds, lint, inventory and
8,847 spec references passed. The parent mapping and public review and
filing remain gated. [Final 2026 Form 3903](https://www.irs.gov/pub/irs-prior/f3903--2026.pdf) ·
[Final 2026 instructions](https://www.irs.gov/pub/irs-prior/i3903--2026.pdf).

`cf42abf2` collects a complete no-W-2G professional wagering ledger in the
federal-only guided return for one cash-basis owner. The mounted regression
confirms $12,000.15 of gains, $10,000.25 of losses, zero other expenses and
$2,999.925 of exact net profit. Review displays the actual amounts and
synced answers omit them and the ledger reference. Both viewport journeys
restore the draft, revoke confirmations on edits and make zero protected
requests. All 2,005 focused tests and seven production Chromium cases passed,
along with types, builds, lint, inventory and 8,845 spec references. The
620-case audit retains five hosted-only skips and existing request limits.
The exact archive is running. Other filing units, states and human review
remain open.
[26 USC 165(d)](https://uscode.house.gov/us/usc/119-120/t26/s165/).

`07d9bcde` projects a confirmed wagering-loss-only ledger onto the disabled
final 2026 Schedule C candidate. Its $12,000 income, $9,000 deductible loss
and $3,000 net reconcile across Parts I, II and V. The 2,522 focused checks
passed. A separate strict parser verified 11 field values, widgets and
appearances, and both pages were rendered and inspected. State and mixed
expenses, disagreements after rounding and missing sources are held.
[Final Schedule C](https://www.irs.gov/pub/irs-prior/f1040sc--2026.pdf).

`9068658e` links an original domestic cash slot W-2G to a confirmed
professional wagering ledger entry only when its independently entered
recognized gain equals Box 1. Schedule C receipts and Form 1040 withholding
each count once. Reconciliation rejects missing Box 4, changed or duplicate
originals, other statement types and state composition. The 8,483 focused
tests, 12 production Chromium cases, types, builds, inventory and 8,842 spec
references passed. The 618-case browser audit preserves its limits and five
hosted-only skips. The exact archive passed its first 11 checks, including
27,656 tests at 87.77% branch coverage. Its browser run had one unrelated
workspace redaction-count failure, with 612 passing cases and five hosted
skips. Broader methods and human review remain open.
[IRS W-2G instructions](https://www.irs.gov/instructions/iw2g) ·
[IRS Publication 505](https://www.irs.gov/publications/p505).

`57a7da97` collects original business mileage for one primary-owned cash
business in the single-taxpayer federal guide. The June and July example
produces a $21.81 deduction and $9,878.19 net profit. Mileage participates
in the loss limitation check, and changes to the log or owner require
reconfirmation. The optional Part IV answers preserve explicit No values.
All 1,862 focused tests, 241 script checks, nine production Chromium cases,
three type checks, webpack build, lint, inventory and 8,840 spec references
passed. Both viewport cases kept the private reference local and made zero
protected requests. The 618-case request audit retains its original ceilings
and five hosted-only skips. State composition, full-year public calculation
and filing are still gated.
[IRS mileage rate change](https://www.irs.gov/irb/2026-29_irb).

`efcd5c54` collects the actual 2026 medical mileage log for the single
taxpayer's own eligible care in guided Schedule A. Changes to the original
log or taxpayer clear the confirmations. A standard deduction preserves the
draft without claiming mileage. The 407 focused tests, 83 targeted and browser
orchestrator checks, three type checks, webpack build, lint, inventory and
8,839 spec references passed. All 37 production Chromium tests passed. The
two new desktop and mobile cases observed no protected requests and kept the
private reference out of requests. Public 2026 output remains gated.

Archived `4db383ba` passed all 12 checks. Unit and coverage each passed
27,640 tests in 1,996 files at 87.77% branch coverage. Managed Chromium
passed 605 cases with five original hosted-only skips. Its PostgreSQL and
browser processes closed normally.

`e141bdf5` verifies the disabled final 2026 Schedule C mileage and Part IV
fields from the documented log and the taxpayer's separate vehicle answers.
All 444 focused checks passed. A separate strict PDF parser confirmed 15
saved field and widget values and appearances, and both pages were rendered
and inspected. This covers the whole-mile candidate. Public export
qualification remains open.
[Final 2026 Schedule C](https://www.irs.gov/pub/irs-prior/f1040sc--2026.pdf).

`9e381f83` refuses local uploads against a return reset before file selection
or while the browser parses the PDF. The old build stored the new PDF and
metadata in both cases. The successor keeps both empty after reset and
saves one original on a fresh retry. All 37 production Chromium cases and
283 focused checks passed. The exact archive passed all 12 checks. Unit and
coverage each passed 27,649 tests in 1,997 files at 87.77% branch coverage.
Managed Chromium passed 609 cases and retained five hosted-only skips. Its
browser server and disposable PostgreSQL closed normally.

`ebd57bdf` allows ordinary business expenses alongside the confirmed
Schedule C mileage log when the generic vehicle expense is zero. The
previous build failed the parsed-input control. The successor passed
5,075 focused checks and still refuses a competing nonzero vehicle expense.

`6fbd2b74` calculates the single taxpayer's 2026 Schedule A medical mileage
from confirmed, eligible, unreimbursed trips. The rate is 20.5 cents through
June 30 and 23.5 cents from July 1. All 404 focused checks passed, including
exact Schedule A floor arithmetic. Guided intake, official physical output
and independent tax review remain open.
[IRS Announcement 2026-11](https://www.irs.gov/irb/2026-29_irb).

`aeace85a` refuses stale advanced answer and reopen writes after a local
return is deleted or reset. Both controls failed on the earlier production
build and passed on the successor. The focused cohort passed 179 checks and
all 35 production Chromium cases without skips or retries.

Archived `e4734fb1` passed all 12 local checks. Unit and coverage each passed
27,620 tests at 87.78% branch coverage. Managed Chromium passed 601 cases and
retained five original hosted-only skips.

`4db383ba` calculates the federal Schedule C deduction for an eligible
first-use owned vehicle from confirmed mileage and parking and toll records.
The business rate changes from 72.5 to 76 cents on July 1. The 573 focused
checks cover Schedule SE, exact dates and Pennsylvania and Ohio refusal of
the federal-only packet. A separate Decimal calculation reproduced the
example. Vehicle basis, state composition and public output remain open.
[IRS Announcement 2026-11](https://www.irs.gov/irb/2026-29_irb).

`95d7da8e` rejects guided writes from a tab opened before a local return was
deleted or reset. Switching to advanced mode preserves original documents
added by another tab. The earlier production build failed all three controls.
The successor passed 179 focused checks and 33 production Chromium cases with
zero retries or skips. Simultaneous answer writes within the same reset
generation remain subject to Web Storage scheduling.

Archived `6a38aadd` passed all 12 local checks after the earlier draft-table
audit failure was corrected. Unit and coverage each passed 27,620 tests at
87.80% branch coverage. Managed Chromium passed 596 cases and skipped the
five hosted-only tests.

Exact `c94971cd` passed all 12 archived local commands. Unit and coverage
each passed 27,558 tests in 1,988 files, with 87.76% branch coverage against
85%. Managed Chromium passed 589 cases and skipped five hosted-only tests.
Its own server and disposable PostgreSQL shut down normally. The previous
authorized `acb776cb` condition failed before any boot. The first approved
`c94971cd` observation found a temporary-directory mismatch. The corrected
observation passed on the next approved attempt, then its file-only
constructor rejected an incorrectly named source-review field. A replay of
the actual handoff reproduced the failure, and the corrected offline
handoff produced all eight expected bindings under the strict constructor.
Neither attempt booted the VM or modified the shared socket route. The
runtime and image scan still need a valid rehearsal window.

`948e8d69` reconciles actual Form 1099-G Box 7 originals to dated cash-farm
receipts. `b8247aaa` adds guided entry for an ordinary, profitable federal-only
cash farm. It preserves missing amounts and blocks unresolved program types,
losses and state farm returns. `0b18a4f8` restores the existing no-CRP Schedule
SE output shape, fixing 22 Ohio whole-result regressions found in the `db974a65`
archive. The 85-test compatibility cohort passed with its original expected
hashes. The 15-case guided cohort and three type checks passed. The combined
successor `2f836a2b` passed nine static checks and 27,595 unit tests. One
unit check caught a stale browser diagnostic audit hash. `8e4375e3` updates
that binding, and all 25 diagnostic tests pass. The archived `8e4375e3`
unit and coverage jobs each passed all 27,596 tests, with 87.79% branch
coverage against 85%. The browser job stopped before server startup because
its archive lacked the official sample-download directory. That prerequisite
has been copied and checked for the `9215736d` run.
`ad616963` shows confirmed USDA Box 7 receipts separately from federal
withholding in guided review. Two real Chromium cases covered edit,
reconfirmation, saved-return replay, review download and deletion. The
browser audit for the successor `9215736d` covers all 596 cases and retains
the five hosted-only skips and the existing request limits. The exact-source
combined run for `9215736d` passed all 12 local checks. Unit and coverage
each passed 27,601 tests, with 87.79% branch coverage. Managed Chromium passed
591 cases and retained five hosted-only skips. Qualified human review and
2026 public output remain open. [Package evidence](upgrade-2026-progress.md).

`d93621a3` collects actual benefit status and dated evidence for each fully
taxable Conservation Reserve Program annual rental payment. The worksheet
matches a same-owner, same-year SSA-1099 separately and clears the previous
evidence when the payment date changes. The 223 affected tests and three
actual Chromium cases passed, including saved Schedule SE values and private
reference checks. The finite method remains federal-only. [Schedule SE
instructions](https://www.irs.gov/instructions/i1040sse).
The combined source passed nine static checks and 27,604 unit and coverage
tests with 87.80% branch coverage. Its initial browser run hit a loopback-port
conflict and the first retry stopped on a missing Python setting. The unchanged
suite then passed 592 Chromium cases with five hosted-only skips and closed
its loopback listener.

`0411dab9` binds hosted AI credit fulfillment to the original Checkout issuance.
`c4998c56` separates test and live accounting with a PostgreSQL storage marker.
The focused PostgreSQL 16.16 cohort passed 247 tests and restored 11 tables.
`5595f396` also binds the stored receipt to the Checkout Session and product.
Its PostgreSQL 16.16 cohort passed 252 tests, including backup and restore of
the current schema and an actual historical archive.
`aac4667d` adds an operator-only, read-only comparison for a conflicting paid
Stripe event. It reports retained issuance, purchase, receipt, PaymentIntent,
Charge, refund and dispute evidence without emitting identifiers or amounts.
The focused 290-test cohort and a separate SELECT-only verified-TLS invocation
passed. Staging remediation and the credit-sales gate remain open.
The `db974a65` production build separately passed 13 local HTTP checks using
TLS PostgreSQL and a controlled loopback rate-limit transport. The automatic
Stripe retry needs a new isolated Preview database because the prior branch
expired. Staged paid credit conflict reconciliation, credit-sales qualification,
and security/privacy signoff remain open. [Hosted HTTP evidence](upgrade-2026-hosted-http-fault-rehearsal-work.md) ·
[AI credit ledger](upgrade-2026-ai-credit-issuance-work.md).

`f3117ed1` corrects guided Form 1099-R duplicate identity. A payer TIN with or
without hyphens identifies the same payer. Joint-return recipients can each
use the same local account label. The focused 164-test cohort passed, preserving
the entered TIN, original account reference and exact amounts.
[IRS Form 1099-R instructions](https://www.irs.gov/instructions/i1099r).

`fe8fcd69` fixes the browser storage cache that could lose a restored return
or bring back a deleted one when an older tab saved a different return. A save
now preserves other entries' stored fields. Both regressions failed on the
previous code. All 125 focused tests and 13 local production-browser tests
passed, including a two-tab restore with matching original PDF bytes and guided
answers. Simultaneous writes in different browser processes still depend on
Web Storage scheduling. [HTML standard](https://html.spec.whatwg.org/multipage/webstorage.html#introduction-16).

`3b2b3a68` makes the self-host rehearsal independently authenticate its
downloaded backup and compare the saved workspace, guided answers, local
preference and original PDF before deleting the synthetic return. The 45
focused checks passed. Local production Chromium accepted the real download
and rejected both a one-cent change to the expected answers and a wrong
password. The final Compose image rehearsal remains open.

`75e1faf5` saves new local original files in one IndexedDB transaction before
publishing the upload. When the return metadata write fails, it removes only
the pending batch. New local originals have independent IDs, so cleanup cannot
select a same-named file from an older upload. The 142 focused tests and 23
Chromium cases passed, including actual file-transaction abort, metadata quota
failure and retry. IndexedDB and Web Storage remain separate persistence systems.
The `8080bba3` archive exposed two verification bindings that still needed
updating. `e7cec93f` makes both test titles visible to the spec checker and
rebinds the unchanged 14-case diagnostic selection to the 599-case collection.
All 952 spec and orchestrator checks and 23 Chromium cases passed after the repair.

`06f43988` applies Schedule AI's ordinary $400 self-employment threshold
before rounding for each owner. It also prints the same amounts the engine
used in Part II. The 237 affected tests passed. `656fb5f8` adds confirmed
ordinary qualified-dividend and net-capital-gain periods. It annualizes each
amount independently and reconciles both amounts exactly to the full-year
return. The 230 affected tests include the actual 2025 review PDF and isolated
2026 indexed arithmetic. Special capital methods, final 2026 forms and
qualified review remain open. [Schedule AI evidence](upgrade-2026-form-2210-schedule-ai-work.md).

`addd7688` preserves entered period amounts and clears confirmation after
an original payer or worksheet reference changes, including when the amounts
stay the same. The 69 focused tests and 24 production Chromium cases passed.
The browser audit binds 600 cases with the five hosted-only skips and all
prior request limits. [Schedule AI evidence](upgrade-2026-form-2210-schedule-ai-work.md).

Exact `2ad7edea` passed all 12 archived local checks, including 27,606 unit
and coverage tests at 87.80% branch coverage and 592 Chromium cases with
five original hosted-only skips. Exact `e31e9745` subsequently passed all 12,
with 27,610 unit and coverage tests at 87.80% branches. Chromium completed
597 collected cases, with 592 passing and five original hosted-only skips.
The runner and its disposable PostgreSQL closed normally.
Exact `656fb5f8` also passed all 12 checks, including 27,617 unit and
coverage tests at 87.79% branch coverage. Managed Chromium passed 594
with five original hosted-only skips.

Two separate PDF extractions agree on 8,248 ordinary-tax and 11,240 EIC cells
in draft 2026 Publication 1040. Decimal comparison matched every draft cell
using the table methods with 2026 indexed values. The final endpoint still
serves 2025 and 2026 remains gated. [Draft reconciliation](upgrade-2026-draft-federal-tables-work.md).

`d10cc135` adds the single-proprietor professional wagering source
calculation and Schedule SE handoff. The 396 affected checks passed. The
source uses the current ledger's gross gains, losses and otherwise
deductible expenses and applies the statutory cap before rounding.
Joint and mixed activity, guided intake, physical output and human review
remain open. [26 USC 165(d)](https://uscode.house.gov/us/usc/119-120/t26/s165/).

`6a38aadd` makes later original-file reads honor another tab's committed
deletion. Two unit regressions and an already-open Chromium W-2 review
reproduced the old read. The 188 focused checks and 24 Chromium cases passed.
The fix applies to subsequent reads. A File already handed to a reader or
suggestions already displayed remain outside this change.

`bdd31ea1` keeps a local document's original and saved metadata together
when either write fails during individual removal. The earlier build lost
the original on a quota fault and reported success when the same test
attempted to abort the already committed deletion. The successor passed
127 focused checks and 26 Chromium cases with no skips or retries. Recovery
also preserved an unrelated saved return field during a forced abort. The
full collection now contains 603 cases, with five hosted-only skips, 14
fixed diagnostics and the same request limits. The two browser stores do
not share a crash-atomic commit. [IndexedDB transaction lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifetime).

`1a44d113` extends the local rollback to resetting and deleting a return.
Three production Chromium cases reproduced quota rejection, failure to
clear guided answers, and a transaction abort on the earlier build. The
successor preserves the saved return, exact original PDF, scoped guided
answers, preference and recovery marker after failure. A successful retry
clears the relevant data. The 206 focused checks and 29 production Chromium
cases passed. The browser collection retains the five hosted-only skips,
14 fixed diagnostics and unchanged request limits.

`12dd9a10` refuses a stale document-year edit after another local tab
deletes the return. The old Chromium case reproduced the resurrection.
All 206 focused checks and 30 production Chromium cases passed on the
successor. The collection now covers 607 cases under the same request
limits. The archived `b76cf211` source separately passed 11 checks and
87.79% branch coverage. Its browser preflight rejected an outdated source
binding for the tax-table fixture README, which `6a38aadd` repairs.

`a6c4fd18` adds IRS-published expected values for 2026 Schedule SE and 8812.
The 147 affected tests passed. The checks use the worksheet inputs the IRS
supplied. Full-return testing still requires final tables and professional
review. [IRS ATS scenario 12](https://www.irs.gov/pub/irs-efile/ty26-1040-ats-scenario-12.pdf) ·
[IRS ATS scenario 14](https://www.irs.gov/pub/irs-efile/ty26-1040-ats-scenario-14.pdf).

The November 13 npm production and full audits both exited zero across 447
and 539 dependency records, respectively. The lockfile Git blob is
`24444f81fec0dbd9ed94f39cb94a239514844b76`. The production audit SHA-256 is
`802c55f7c0fed74cd44169b476634570a7f531cdf59d8a8688e396513ae3e5ce` and the full
audit SHA-256 is `2bd34d50bec6f2f16e90551fcae80e94f898eabc4c169417a21a74f3fdf42d1f`.
The Next advisory index still shows the November 3 batch. The current pin
16.4.5 addresses those advisories. Release 16.4.6 includes a compression fix,
a Tailwind starter fix and a Turbopack development fix. Both image stages
install Debian's fixed zlib in `f502f328`. The composed AMD64 and ARM64
images still need scans, and outstanding findings need owner and expiry.
[Next advisories](https://github.com/vercel/next.js/security/advisories) ·
[Next 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6) ·
[Debian DSA-6613-1](https://security-tracker.debian.org/tracker/DSA-6613-1).

The IRS final endpoints for Form 1040, Publication 1040 tax and EIC tables,
Schedules A and F, and Forms 2210, 2441, 6781, 8863, 8889 and 8949 still
serve 2025. Final 2026 Schedule 8812, Schedule SE and Form 4952 already have
disabled physical candidates. Pennsylvania's annual filing index still
shows 2025. Ohio's alerts search indexed a 2026 draft announcement, and
the direct alert returned 404. Final 2026 state filing sources remain open.
[IRS final forms](https://www.irs.gov/downloads/irs-pdf) ·
[Pennsylvania Personal Income Tax](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) ·
[Ohio filing eligibility](https://tax.ohio.gov/individual/ohtax-eligibility).

The official provider pages still list short-context standard input, output
and cached input per million tokens at $0.10, $0.50 and $0.01 for Luna and
$2, $10 and $0.10 for Sol. Gemini 3.8 Flash lists $0.75, $3.75 and $0.075
through December 31 and $1.50, $7.50 and $0.15 from January 1. The last
authenticated OpenAI observations and unresolved usage reserve retain their
previous scope. Google credential access and model qualification remain open.
[OpenAI pricing](https://developers.openai.com/api/docs/pricing) ·
[Google Gemini pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash).

## November 12 on `main`

PR #13 merged as `59248889`. The merge has the same source tree as
`3024b848`, which passed all 12 local checks. Coverage was 87.71% against an
85% branch threshold, with 27,334 unit and coverage tests. Managed local
browser verification passed 587 cases with five pre-existing hosted skips.
On the merge SHA, GitHub's coverage, managed browser and Docker build jobs
passed. The separate unit job timed out on one Pennsylvania saved-PDF test.
The strict runtime-container browser job recorded 27 failed cases, including
two bounded RRTA PDF privacy inspection timeouts. See [GitHub CI](https://github.com/utilityfueled/tax-engine/actions/runs/42292813045)
and [GitHub Web](https://github.com/utilityfueled/tax-engine/actions/runs/42292813115).

The owner directed subsequent commits to local `main` and asked to keep
them local while automatic Vercel production deployments are disabled.
Vercel's history records the PR merge as an automatic production deployment.
The November 13 read-only settings check showed Production still tracking
`main`, automatic assignment of production domains enabled and Ignored Build
Step set to Automatic. [Vercel Production settings](https://vercel.com/utility-fueled-llc/tax-engine/settings/environments/production).
Prepared education review integrity is committed as `397ef68c`. The Node
26.13.1 security update is committed as `6fe8dcac`. The [progress log](upgrade-2026-progress.md)
and [external actions](upgrade-2026-external-actions.md) track later local
commits, exact-source rehearsals and the remaining gates.

The mapped PDF privacy fix `9c72d014`, PA-40 field lookup update `540a6ce4`
and their browser source bindings `f29ddc28` are verified locally. The
[November 12 source refresh](upgrade-2026-refresh-20261112.md) records the
newly final Schedule 8812, the outstanding federal and state form revisions,
and current documented provider availability and pricing.
The [2026 Schedule 8812 physical candidate](upgrade-2026-schedule-8812-physical-candidate-work.md)
has a verified field map and two fictional saved specimens. It stays outside
the public review and filing registries pending final companion sources and
qualified review.

Exact `320a69fc` passed all 12 local commands with 87.71% branch coverage,
27,373 unit and coverage tests and 587 managed browser passes. The five
hosted-only skips remain. The next archived commit `acb776cb` failed the
unit job. The Ohio audit compatibility and Pennsylvania spec-reference
repairs passed all 1,030 affected checks. Exact `a1349ad8` then passed all
12 archived local commands. Unit and coverage each passed 27,434 tests in
1,978 files, and branch coverage was 87.71%. Managed Chromium passed 587
cases with the five hosted-only skips. The owned synthetic PostgreSQL
process stopped normally. The separate disabled final 2026 Form 8606
physical candidate is `49785e57`. [Local package evidence](upgrade-2026-progress.md).

Subsequent local commits reconcile 2026 W-2 Code P (`61764bcf`), calculate
an original-bound 2025 Pennsylvania meals per diem excess (`0cae459d`),
map two more disabled 2026 physical forms (`a182cf85`), and reconcile
prior-service foreign wages and NIIT (`30e6c254`). Browser source hashes
were updated in `f78d600e` with the same action and deadline contracts.
Targeted verification passed for these changes. Exact combined and
distribution checks for the successor remain separate.

Commit `19948573` pins PostgreSQL 16.16 for Compose and CI. Its 125
focused tests, types, scoped lint and Compose configuration passed.
The macOS ARM64 recovery tools were built separately from the 16.16
source archive. All 12 archived checks passed. Unit and coverage each
passed 27,475 tests in 1,983 files with 87.73% branch coverage. Managed
Chromium passed 587 cases with five hosted-only skips. The separate local recovery
rehearsal restored nine tables across two synthetic tenants and preserved
the exact provider cost of USD 0.0000006. The owned server stopped normally.
The approved `acb776cb` native attempt used zero boots because its unit
run failed. The current ARM64 image, strict browser and recovery rehearsal
still require eligible source and execution evidence.
[PostgreSQL 16.16 release notes](https://www.postgresql.org/docs/release/16.16/).

Subsequent commits correct regular Schedule SE's exact threshold and
wage-base aggregation (`bb9a326f`), attach only qualifying owners' 2025
Schedule SE review pages (`b65a71b3`), collect finite PA union dues
(`840bd598`) and bind actual Ohio Akron school-district and county
evidence (`3f2c236c`). Focused tests and distinct review passed.

Two managed Chromium cases now verify the original Pennsylvania union-dues
interview and saved-return replay (`b99cde43`). The full collection has 594
cases, including the same five hosted skips. The final 2026 Form 8824
and Form 6252 physical maps passed independent checks and stay outside the
export registries. Trusted 2025 review PDFs now remove legacy active data
and stale Reader rights at verified template load (`e4025f63`). All 46
registered templates passed saved-object inspection. [Package evidence](upgrade-2026-progress.md).

Hosted commits `d39209de` and `8357ed99` add an opt-in Preview-only
Stripe delivery receipt and settle purchased AI credits only after
confirmed payment. The purchase grant and event receipt commit in one
PostgreSQL transaction. Local signed fixtures and PostgreSQL 16.16 tests
passed. Commit `34eec376` validates the Stripe catalog price and Checkout
session before returning its URL. The isolated live retry, webhook event
subscription and credit-sales qualification remain open.
[Package checks and source links](upgrade-2026-progress.md).

The current public Git references still point to `59248889` on `main`
and `3024b848` on the merged upgrade branch. Local successor commits
are held as directed until the owner disables automatic production
deployment. No successor remote CI, Preview or native execution is
implied by the local evidence.

## Historical November 6 evidence

Current crosswalk, November 6 UTC: exact `4ee5e082` passes all twelve local
checks and the remote unit, coverage, static/build and managed browser jobs.
Each engine run passes 27,284 tests in 1,959 files; branches are 87.68% against
85%. Local and remote managed browsers each pass 587 cases with five original
hosted skips. The owned local server is closed. See the
[current runtime ledger](upgrade-2026-4ee5-runtime-evidence.md).

The container recovery job fails the unchanged 30-second upgrade heading
assertion, before its browser suite runs. Exact source/tree/image/SBOM/scan
bindings reconcile; all 81 image advisory IDs remain open and unaccepted.
Cumulative static-network failures are evidence for further diagnosis, not a
confirmed root cause. No retry, timeout or readiness gate was weakened.

The isolated hosted counter remains 1,207/1,793. Exact-9283 Preview admission
failed before a recorded deployment request; no successful third build or
reissue is claimed. The native test disk was enlarged once from 80 to 384 GiB
while stopped, with preserved other-machine metadata. The constructor passed;
the controller stopped at admission before runtime/boot, and is not replayed.
Source-only diagnosis continues. Both distribution qualification gates stay open.

The separately reviewed [PA field batch](upgrade-2026-pa40-field-batch-work.md)
and [RRTA name verdict reuse](upgrade-2026-rrta-name-verdict-work.md) are included
in the passing 4ee5 checks. Earlier source-specific results below remain historical.
The [complete COD loss-pool endpoint](upgrade-2026-cod-full-pool-exhaustion-work.md)
is adopted with 93 affected passes and three independent controls. Later tax
source changes require a new integrated run. The [charitable full-excess endpoint](upgrade-2026-charity-total-exhaustion-work.md)
also passes 27 affected and six independent controls; its correct positive case
is historical2025, while the2026 partial case stays denied. Other endpoint work
remains private; failed oracles and harness attempts are retained.

The [recovery observation package](upgrade-2026-rehearsal-navigation-observations.md)
passes15 main and seven distinct pure controls. Its exact runner inverse keeps
recovery actions and gates unchanged; no new actual rehearsal is claimed.

The [historical binding-owner full repayment method](upgrade-2026-marketplace-binding-owner-full-repayment.md)
passes40 affected cases with types3/spec8657/inventory/build. Each actual owner
limit and the final zero-credit/full-repayment proof comes from original sources;
partial and capped methods remain outside this endpoint. Eighteen lint warnings
are disclosed, seven introduced. Independent saved-PDF review keeps its strict
raw numeric-stream marker HOLD explicit. Human and full successor gates stay open.

The [combined browser source audit](upgrade-2026-combined-browser-audit-work.md)
now binds exactly seven reviewed runtime hashes and one new fixture, preserving
all154 contracts/592 cases/five skips and every request/deadline control. Existing
protocol controls pass51/3. Later remote72 recovery passes; managed and container
browser jobs stop before cases, so source-bound browser qualification is still open.

The [sole-prior charitable floor endpoint](upgrade-2026-charitable-prior-floor-no-excess.md)
passes 72 affected tests after five genuine baseline guard failures. Exact
consumption, deductible use and original years remain distinct; unresolved
competing-origin and surviving-excess methods stay denied. Product types,
spec8664, inventory, lint and build pass. Independent software review passes
87 tests, including 15 distinct controls.
The [human review packet](upgrade-2026-human-tax-review-packet.md) now includes
the later COD, charitable and marketplace endpoints without recording a human
opinion. Current full and distribution qualifications remain open.

The later prior-floor audit binding retains all 1,835 previous keys and adds its
exact fictional fixture, now 1,836 keys, with two calculation hash replacements.
Distinct review, actual admission and 51 protocol controls pass; action contracts,
request budgets, cases, skips and deadlines are unchanged. Tax `047eb40a` is
pushed. The final combined source is being frozen for all twelve checks and the
separately authorized distribution rehearsals.

Fresh [official Next advisory metadata](upgrade-2026-next-1645-security-work.md)
now resolves the seven affected/patched-range contradictions: installed16.4.5
is patched. The mfr8 severity disagreement remains conservatively High; image
findings, exposure checks and required human review are separate open gates.

[Provider source observations](upgrade-2026-provider-refresh-20261106.md) do not
qualify models. Known usage remains 0.26282160 USD plus 0.022384 USD held for
unresolved settlement, combined 0.28520560 USD. Final 2026 forms, independent
human tax/AI/security review, and source-bound hosted/native qualification remain
open. The [execution brief](upgrade-2026-execution-brief.md) retains every
completion criterion; release, filing and model promotion remain disabled.

## Earlier source-specific continuation records

Updated November 5 UTC, 2026, on `upgrade/2026-baseline`. The latest full unit and
coverage runs bind exact `7d93fd67`: [26,262 tests and 87.61% branch coverage pass](upgrade-2026-7d93-global-verification-work.md),
with all 53 real PostgreSQL cases on each run and no reported skips or source drift.
Package static/build checks remain separately attributed; original stale-inventory
failures are retained.
The [full managed browser successor](upgrade-2026-portable-browser-work.md) passes 569 cases with five original hosted skips and zero failures/retries. Exact
hosted/native artifacts still require qualification. This is the current
crosswalk into the append-only history. Earlier checklist entries and checkpoint root values describe their
named revisions. The [execution brief](upgrade-2026-execution-brief.md) remains
the completion contract. **The upgrade is not release-ready.**

The [SSA source-box safeguard](upgrade-2026-ai-ssa-grounding-work.md) passes925 focused/spec-reference tests plus all package static checks and is included in the current full unit/coverage pass. Historical provider runs remain unchanged; the separately recorded current SSA run does not establish human or held-out qualification.

Subsequent reviewed commits add separate PA payment composition (`6454304f`),
single PA local W-2 originals (`8b9eb78f`), native passenger originals
(`f957012d`) and source-only 2026 Ohio school records (`f0da6d75`). Their package
checks pass and their committed sources are included in the full unit/coverage result above. The
[passenger browser successor](upgrade-2026-passenger-native-browser-work.md)
passes two selected desktop/mobile cases, with 576 now collected. Full current
runtime remains pending. The [midday advisory refresh](upgrade-2026-advisory-midday-refresh-work.md)
(`6a5da878`) finds zero package audit findings but leaves image findings,
Next metadata conflicts and ownership/expiry requirements open.

The [current CI image record](upgrade-2026-7d93-remote-image-work.md) verifies
smoke, six isolated recovery phases and immutable SBOM/scan binding for the
merge tree matching `7d93fd67`. Both full browser jobs fail before cases at source
audit; all 80 advisory IDs remain unaccepted. Distinct saved-evidence review also
reconstructs the current full unit/coverage counters without rerunning workloads.

The [later security/CI record](upgrade-2026-late-security-ci-refresh-work.md)
retains46fresh primary GETs with no new actionable patch and80unaccepted image
advisory IDs. Actual earlier8781 image smoke/recovery/scan evidence is separately
bound to its full merge tree; both browser jobs failed before cases. New branch
commits require their own full verification and release evidence.

The [separate PA payment browser package](upgrade-2026-pa-payment-native-browser-work.md)
passes two selected desktop/mobile journeys with zero retries/skips and no protected
requests. Full collection now578 preserves all576 previous cases. The initial
source-drift HOLD and four-path projection restoration are retained; the clean
rebuild passes with unchanged source/build and owned-server closure.

The [finite mixed-spouse PA source method](upgrade-2026-pa-married-residency-work.md)
adds actual separate calendars and dated resident/nonresident payroll without
altering federal MFJ or worldwide SP income. Distinct240/current298focused and
880metadata tests pass with package checks; resident-only paper denies these
mixed sources. Native intake, mixed paper and broader qualification remain open.

The [prepaid mortgage-insurance source package](upgrade-2026-mortgage-insurance-prepaid-work.md)
adds canonical original-policy allocation for the finite2026 FHA/private cohort.
Distinct263/current218focused plus881metadata checks and all package static/build
checks pass. The [native original collector](upgrade-2026-mortgage-insurance-native-work.md)
now passes distinct170/current281focused plus882metadata checks and all package
static/build checks. The [actual original-premium browser](upgrade-2026-mortgage-insurance-native-browser-work.md)
now passes two selected desktop/mobile cases without retries. Actual580collection
preserves all578previous IDs/deadlines/statuses; four protected scopes stayzero
and the owned server closes with unchanged source/build. Current full integration
remains pending; whole2026 and filing gates stay closed.

The [full-federal prepaid insurance tests](upgrade-2026-mortgage-insurance-prepaid-return-work.md)
verify existing SALT, charity, QBI and section68 composition with actual original
sources: distinct92/current82 plus883metadata and package checks pass. No
calculator change or public 2026 gate opening is included. Exact current IRS
endpoints still show the 2025 final and an explicitly draft 2026 tax table.

The [current Form172 insurance source method](upgrade-2026-form172-current-mortgage-insurance-work.md)
now classifies finite actual original main-home PMI independently in regular and
AMT loss origins. Genuine2RED precedes author149/distinct164/current153 plus885
metadata checks; all package checks pass with4673pins unchanged. Other insurance
methods, professional review and final2026 qualification remain open. The public
2026 rule pack still rejects; browser hash metadata is separately reviewed.

The [isolated hosted baseline](upgrade-2026-isolated-two-account-baseline-work.md)
now has two synthetic accounts/trials and verified owned subscription/event rows.
Actual operations bind deployed480ca19d; failed-delivery automatic retry and
outages remain untested, and later code is not qualified by this result.

The [later provider refresh](upgrade-2026-provider-late-refresh-work.md) retains
current selected prices and lifecycle guards with no inference spend. Exact
current Google generateContent wire compatibility remains unverified; public
listing and finite historical runs do not qualify routes or human evaluation.

The [actual minute usage export](upgrade-2026-ai-minute-usage-reconciliation-work.md)
exactly matches 33 known successful Mini requests in the timeout window. It
contains no request-level settlement; the0.022384USD reserve stays held and
known-plus-reserve remains0.28520560USD. No new paid request or promotion.

The later [guided render performance experiment](upgrade-2026-guided-render-experiment-work.md)
is rejected after its final unchanged browser comparison yields successor9PASS/1timeout
against baseline10PASS. All seven experimental paths are archived and restored/removed;
the previously verified application source remains unchanged. Its bounded PDF and CPU
observations do not qualify the outstanding container/native browser gates.

| Package | Verified evidence | Remaining work |
| --- | --- | --- |
| Coverage and dependencies | Exact045fbedb local unit and coverage each pass25,244 tests/1,854files with zero failures/skips, including53 assertions in all six real PostgreSQL files on each run. Coverage is91.81% statements/87.54% branches/90.69% functions/95.03% lines at unchanged gates. All eight remaining checks pass, including both builds. Lint retains11,715warnings/0errors with no semantic additions or removals against the retainedb254 baseline. Exact045 remote push/PR CI also passes25,244unit and25,244coverage assertions; priora4ac/b254 evidence remains separately attributed. See [the local verification ledger](upgrade-2026-045-full-local-verification-work.md). | The earlier local a4ac run stopped on an unbounded synchronous PDF stdin reader after1,852 files; no coverage followed. Test-only8487 uses the existing bounded file-stdin helper; the original3cases and full local checks now pass without application-product changes. Final hosted/native/browser artifact qualification, package/security owner decisions and human/final-form gates remain open. The earlier f09 cancelled coverage result stays historical. |
| Complete taxpayer facts and federal law | Source-bound collectors, year-aware rules, original records and guarded unsupported methods are documented in the package ledgers. Unknown values and actual zero remain distinct. | Independent professional review and the specific unresolved interpretations in the [external handoff](upgrade-2026-external-actions.md). Do not treat software tests or agent review as professional approval. |
| Pennsylvania and Ohio | The owner selected both states for full-year, part-year and nonresident returns. Delivered finite source methods and historical review companions remain bounded by the [support disclosure](upgrade-2026-oh-support-publication-work.md) and [state gap analysis](upgrade-2026-state-gaps.md). Commit 5cbec8e8 adds dated Ohio part-year school payroll sources; its 68 focused and 564 adjacent tests and 12 checksets passed. | Commit a757d735 delivers separately source-bound part-year school paper: current-main22 focused, original68 and648 adjacent controls and all13 checksets pass; independent32PDF/76page review passes. Commit e3ec646c delivers source-bound Schedule AI physical review:41 new and 222 existing controls and all 14 main checksets pass. Independent review of 142 PDFs and 335 pages matches 1,680 cells; new Form 2210 and workspace outputs are clean. The independent scan also identified inherited Adobe scripts in 120 retained legacy PDFs. Commit 51a8d4c4 removes the listed executable entrypoints from mapped review copies: 1,948 PDF and 62 workspace controls pass; independent four-PDF/six-page review confirms unchanged appearance. Historical retained files remain unchanged. Broader state and final-year form qualification remains open. |
| Guided interview | Exact045 remote managed browser run passes565 with five hosted skips; its Web workflow fails separately in the container browser job. The earlier exactb254 local managed run passes565/five skips with retries0. Current managed CI retains its configured retry1; the five hosted skips do not qualify hosting. | Current exact045 AMD64 container browser run reports541PASS/24FAIL/fiveSKIP at unchanged30-second deadlines and retries0. Actual trace review confirms cumulative body exhaustion, with field-heavy source entry consuming about12–15seconds; no causal CPU claim follows. The oldera4ac550PASS/15FAIL/fiveSKIP andb254541PASS/24FAIL/fiveSKIP stay historical. Saved trace review separates input/render delays from later teardown actions. Actual trace analysis identifies repeated transient source hashing. Separately reviewed a4ac9f0e compares complete stable material directly at three transient guards while preserving every durable digest and fresh federal replay. The same-host managed comparison passes4/4 at each revision with unchanged30s/retry0, and independent saved8PDF/240page/88PNG review passes. Observed case totals70.857s→64.987s are one serial pair, not native or causal performance evidence; see [the comparison ledger](upgrade-2026-oh-source-material-equality-work.md). |
| AI routing, billing and evaluation | The supplied OpenAI credential worked in actual synthetic smoke runs and a prospective classification comparison. The [classification ledger](upgrade-2026-classification-live-smoke-work.md) records12requests, nine exact canonical outputs and independently recomputed0.01618585USD cost. The [actual local billing rehearsal](upgrade-2026-ai-live-local-ledger-work.md) adds three real requests, exact0.0081287USD and two correctly aggregated one-cent charges. The later [four-case development smoke](upgrade-2026-ai-four-case-smoke-work.md) completes39requests at0.06966185USD. Luna andSol each have12/12 strict literal and critical-correct outputs; baseline has0/12 critical-correct, including SSA field swaps that current source binding missed. The subsequent [current SSA smoke](upgrade-2026-ssa-v3-live-smoke-work.md) completes12requests at0.02051895USD; all9four-money-field answers are exact/current-bound, while envelope metadata stays unverified. Cumulative calculated spend is0.26282160USD with0.022384USD still reserved, totaling0.28520560USD; no failed attempt is assumed free. | Independent human review of representative cases, repeated held-out qualification, grounding/privacy failures, representative Sol High/Google evaluation, provider invoice and hosted retail-ledger reconciliation remain open. The testing authorization is strictly below140USD; model promotion remains disabled. |
| Hosted service | Currenta4ac auth bootstrap passes8requests; its tenant/limits run fails48requests at an unclassified first multipart500, with JSON3PASS and all5owned tuples cleaned. A separate same-body upload later passes200/eight requests; a separate remainder passes4boundaries/23requests with all4tuples cleaned. The first default-sandbox remainder attempt has no response or writes and remains failed. See [the episode ledger](upgrade-2026-a4ac-preview-tenant-limits-work.md); these are not one successful tenant run. Earlier bounded Preview auth/recovery, tenant/workspace and Stripe sandbox evidence remains separately attributed. Exact b254 Preview health observes Node26.13.0/Undici8.12.2/x64. Its real official blank-W2 upload exposes rejected workspace shell metadata. Fix76af2285 preserves only canonical public prompts or existing fact IDs;31 focused and64 adjacent controls, types/spec/inventory/strict lint and both builds pass. | Privacy3d13cfe1 passes actual Preview upload/reopen, confirmed synthetic2025 federal review,12-page strict/visual PDF checks, encrypted full-fidelity backup/restore, and explicitly approved deletion with scoped DB before/after counts. The blank official W-2 matches an explicitly confirmed illustrative fixture; no taxpayer extraction is claimed. Completed backup restores after hosted deletion with full re-export parity. Hosted metadata uses pseudonymized IDs; raw local originals remain intact. See [the journey ledger](upgrade-2026-preview-document-recovery-journey-work.md). The approved private credential transfer is complete. Historical9d388825 V5.3 and currenta4ac9f0e isolated-schema rehearsals pass migration dry-run/rollback/apply/idempotence, exact nine-table native backup/restore and RESTRICT cleanup with zero sessions; [the rehearsal ledger](upgrade-2026-preview-schema-rehearsal-work.md) retains both failed corrections. Read-only observation verifies TLS1.3, CA/hostname verification and exact identity while PostgreSQL reports backend SSL=false; the provider internal hop remains unverified. No verification is reduced. Final deployed integration, staging outages and integrated security/billing/recovery remain open. |
| Self-hosting and images | Exact045 push image98569b07 passes smoke and six synthetic recovery phases;20independent full-config/rootfs/SBOM/scan and Git-tree/archive binding checks pass. Remote synthetic mergee28f7107/a4ac image534f7cc0 evidence stays historical. Its scan retains181 matches/80IDs/zeroCritical without risk acceptance. Historicalb254/ARM64/f09 receipts remain separately bounded. | The current045 AMD64 image browser command has24 failures and its Web workflow fails; that image remains unqualified. See [the current remote evidence](upgrade-2026-045-remote-verification-work.md); [earlier a4ac evidence](upgrade-2026-a4ac-remote-verification-work.md) stays attributed. Earlier web41801597467 fails independently. Earlier ARM64 pre-build store faults remain retained and unrepaired. A later same-parent exact8487 build exits 0 and produces immutable ARM64 candidate c23e86d4, but OCI export converts its config and omits the healthcheck; strict archive identity rejects it. Final disk 17,107,730,432 bytes is below the unchanged 17,179,869,184-byte floor, so final safety fails. The V5 strict Docker-archive correction and owned-space recovery remain source-only/pending; see [the native build/export ledger](upgrade-2026-8487-native-build-export-work.md). Restart/import and complete same-image smoke/browser/recovery/scan qualification remain. No image is released or broadly qualified. |
| Advisories and independent review | The retained and currenta4ac AMD64 images have181 Debian matches across80 advisory IDs, zero critical. The [November 4 primary-source record](upgrade-2026-image-advisories-20261104.json) maps installed packages to the actual open trixie records. A fixed-source [human tax-review packet](upgrade-2026-independent-review-packet-20261104.md) and [f09-to-a4ac source companion](upgrade-2026-independent-review-delta-a4ac-20261104.md) are prepared; human decision fields remain blank. | All 80 owner decisions remain unaccepted. ARM64 scan processes succeeded but the enclosing post-operation memory gate failed. Independent human tax, AI-case and security/privacy reviews remain missing. The November 7 advisory review and earlier November 4 19:30 UTC-or-before-qualification Next obligation are unchanged. |

Documentation-only commits through4190b5d3 follow8487 without changing its application bytes;8487 differs froma4ac only in the PDF-reader test setup and work ledger. The native configuration remains fixed to8487. Historical output/source boundaries remain intact.

The later bounded native inventory admits its three exact empty volatile directories and passes final safety, then stops on Podman125/readlink at exact candidate inspection. No archive/deletion/export follows; the root cause remains under investigation. [Retained native evidence](upgrade-2026-8487-native-build-export-work.md).

Isolated hosted outage provisioning now has a separate Preview project, empty Neon branch and test Stripe catalog. The original unused Redis cache was deleted. The separately approved replacement now has a verified $20 automatic cutoff and Sensitive Preview-only access for the isolated project, retaining a $1 actual-spend limit and 240-request ceiling. Direct read-only Neon identity passes. The original literal-exclusive bootstrap remains failed; the separately reviewed restricted NOLOGIN role, administrator-owned synthetic database and scoped ACLs now pass their narrow metadata setup. No new deployment or outage qualification is claimed. See [the provisioning ledger](upgrade-2026-isolated-outage-provisioning-work.md).

## Work continuing independently

- Currenta4ac isolated Preview-schema rehearsal now passes with the tracked pool-closure helper, exact restore and zero sessions. Preserve its backend-versus-client SSL boundary and carry the bounded mechanism into final deployed integration. No new access approval is requested.

- Carry the completed finite Ohio part-year school lifecycle into the final distributions. Header compositione8d0a2c5 passes37focused/489adjacent controls and all12sets. Browser6bc0d747 passes all4 desktop/mobile refund/known-zero journeys, static4 and inventory/spec3 with unchanged budgets and zero retries/skips. Distinct saved4PDF/124page review verifies660cells/88statuses,48geometry records and62desktop/mobile text/RGB pairs. All earlier failures remain retained in the [browser ledger](upgrade-2026-oh-school-district-part-year-native-browser-work.md).
- Recover native qualification through isolated owned storage without hand repairing retained stores. Preserve the earlier pre-build failures and the later exact8487 build success/export failure: strict OCI ConfigID rejection and final disk-floor failure remain open. Review and execute the V5 Docker-archive correction and separately bounded owned-space recovery only under their grants, then prove restart/import and same-image runtime gates. The earlier bounded one-case CPU diagnostic preserves the original30-second deadline and every action/assertion.
- Carry forward the separately recorded currenta4ac tenant/ingress observations: auth8PASS; tenant48FAIL at an unclassified multipart500 despite JSON3PASS and cleanup5; later single-upload8PASS; remainder23PASS/four cases and cleanup4. Preserve the first no-response/zero-write remainder failure and all original source/transport corrections. Diagnose the500 and complete isolated upstream failure/recovery plus final deployed qualification; [bounded episode evidence](upgrade-2026-a4ac-preview-tenant-limits-work.md) is not a combined tenant PASS.
- Carry the reviewed PDF active-content fix into final integrated outputs and runtime artifacts; exact3d13 actual Preview12-page output now passes strict/logical/visual inspection.
- Carry the delivered Form2210 Schedule AI review package and truthful Ohio disclosure commit f6000455 into final integrated checks.
- Carry the passing provider-free HTTP fault rehearsal forward to the final integrated source; controlled REST transport does not qualify actual Upstash/Neon staging.
- Complete actual browser/native measurements of the integrated source-comparison successor and repeat required checks on the resulting final source and qualify exact hosted/native artifacts. Fresh private Compose targeting must be proved against the isolated import store before ARM64 recovery; historical provider receipts are insufficient.

## External inputs still needed

- OpenAI access is received and has produced actual bounded synthetic results;
  no additional key setup is needed. Google access and the independent human
  corpus review remain missing. Known costs and the unresolved reserve stay
  separate from invoice settlement.
- Assign the required independent professional reviewers and advisory owner,
  and retain their actual findings and dispositions against fixed sources.
- Obtain and qualify the final official 2026 forms/revisions for enabled
  scenarios. The November 4 refresh still returned 2025 Form 1040; available
  2026 Schedules C/R do not supply the rest of the final packet.

No production deployment, main merge, force push, filing activation or model
promotion is authorized by these results. Versioned artifact publication remains
subject to its qualification and authorization requirements.

The later isolated credential attempt fails at COMMIT with `XX000`. A fresh
independently reviewed read-only reconciliation confirms the app remains NOLOGIN
and every restricted map matches, while password and original external COMMIT
state remain unknown. The failed prehashed path conflicts with Neon's documented
unhashed-input requirement, missed in its original source review, and is prohibited
from retry. A separately supported private credential path remains required;
[all failure and reconciliation evidence is retained](upgrade-2026-isolated-outage-provisioning-work.md).

The November5UTC supported successor now confirms a fresh isolated app password/
LOGIN COMMIT and actual verified-TLS/SCRAM-PLUS app authentication. The actual
boolean-only prerequisite and four exact maps pass; its first membership-fixture
defect is preserved and corrected in immutable V2. All ten connections close,
and distinct actual review verifies353queries/nine rollbacks and all nine hashes.
The historical failed COMMIT remains unknown. Preview installation, deployment,
outage/retry and all broader qualification gates remain open; see the same ledger.

The guided-flow source-comparison successor now changes application bytes after
8487: it reuses an identical PA dependency comparison only when both records
lack all three PA packets. Current-main505focused controls, all eight
static/build/lint checks and distinct behavioral review pass. Fixed CPU
measurements are bounded function-level evidence. Fresh exact045fbedb full local
checks now pass; actual image/browser/hosted qualification remains required. See [the successor ledger](upgrade-2026-pa-dependency-comparison-work.md).

The later verified official machine-image transfer and local-file initialization
now produce a separate stopped80GiB test VM with exactly two empty scoped mounts.
All existing-state preservation classifications match, with independent actual
review. A later approved diagnostic boots the empty guest once, observes Podman6.0.2,
and fails strict read-only mount admission. The separately reviewed owned stop
restores the original user route within the original15-minute window; both
helper processes are absent. No application source or build/store workload runs;
every same-image native gate remains open. The old candidate's zero-byte layer records
are diagnosed but not repaired. [Current native ledger](upgrade-2026-8487-native-build-export-work.md).

The independently reviewed NOLOGIN bootstrap V2 now retains one actual failure: fresh catalog comparison passes, then role metadata validation stops before COMMIT and cleanup ROLLBACK returns. No database-create attempt, password or LOGIN occurs. The separate rollback-only diagnostic now captures safe metadata and passes fresh before/after catalog reconciliation, including target absence; independent review identifies only the reverse creator-edge grantor mismatch. A narrowly bound V3 now commits the restricted NOLOGIN role, administrator-owned new database and scoped ACLs with305queries/nine rollbacks. Independent actual privilege review passes its narrow checks; separate credential admission continues; broad privacy and hosted qualification remain false. See [the provisioning ledger](upgrade-2026-isolated-outage-provisioning-work.md).

### Exact480 terminal browser evidence

Both exact480 Web runs now finish with managed563/2FAIL/fiveSKIP(PR) and562/3FAIL/fiveSKIP(push), plus container542/23FAIL/fiveSKIP(PR) and550/15FAIL/fiveSKIP(push). These supersede earlier pending480 observations while retaining prior045 results as historical. All43failed cases/48failed attempts are preserved. Static/unit/coverage CI passes; large current runtime artifacts remain unqualified. See [the current browser ledger](upgrade-2026-480-remote-browser-work.md). No causal performance or stable tax defect is established, and no test gate changes.

The isolated app's restricted connection is now installed Sensitive/Preview only.
Project-only removal of the unused Neon integration connection leaves exactly 13
Preview variables and removes 16 aliases, with distinct saved metadata review.
No database deletion is requested. Actual stored-value equality, deployed app
connectivity, outage and automatic Stripe retry remain unqualified. See [the
provisioning ledger](upgrade-2026-isolated-outage-provisioning-work.md).

The [November 5 security refresh](upgrade-2026-security-refresh-20261105.md)
records a fresh zero-finding package audit alongside unresolved Next metadata
conflicts, unchanged vulnerable trixie High records and Node's pending November
11 security release. No risk is accepted and the elapsed Next deadline remains
elapsed. Final-image and independent human security qualification stay open.

The November 5 [provider documentation refresh](upgrade-2026-ai-work.md) finds
no new mismatch in exact model IDs, configured efforts or six scoped price rows.
Documented listings do not establish account access or live qualification. This documentation snapshot preceded the actual synthetic runs and later under140USD
authorization summarized above; model promotion remains disabled.

The November 5 Ohio school currency repair preserves source confirmation across
presentation-only blur using exact normalized string identity. It passes 151 focused
and 25,253 full-unit controls, all static checks and independent source review.
Coverage is running; new-source builds/browser and all remaining qualification
gates remain open. See [the UI ledger](upgrade-2026-oh-school-currency-noop-work.md).

The [November 5 tax-source refresh](upgrade-2026-tax-source-refresh-20261105.md)
checks 20 official endpoints with no new scoped law or final-form change. All 11
PDFs match prior bytes. The incomplete final 2026 packet and qualified human review
remain external gates; retrieval success alone does not qualify a form.

The separate [shared currency grammar repair](upgrade-2026-currency-symbol-grammar-work.md)
and [PA source-integrity repair](upgrade-2026-pa-currency-source-integrity-work.md)
retain malformed symbols/grouping and preserve confirmation only for exact no-op
strings. Focused controls and independent engineering reviews pass. Combined
required types, spec/inventory and both builds pass; current full unit, coverage,
lint and browser qualification continue. Earlier exact-source results are not
relabeled as validation of these later fixes.

### November5 UTC: current strict local browser closes with four failures

c25 combined types/spec/inventory/builds/lint pass; actual strict managed browser
finishes561PASS/4FAIL/5hostedSKIP. Four Ohio part-year school journeys time out
near full-return navigation; later export/deletion assertions remain unpassed.
All traces and gates are retained. Earlier school-no-op coverage passes87.54%
branches, but final combined full unit/coverage remain pending. See [the actual
browser ledger](upgrade-2026-c25-local-browser-work.md).
