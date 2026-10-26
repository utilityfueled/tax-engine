# Temporary workspace PDF serialization

The workspace export previously compressed each component's PDF object streams, immediately reopened those components and compressed the merged download again. This package omits object-stream compression only for those temporary merge inputs. Direct/default exports and the final download retain compression. The temporary directory still uses the existing `finally` cleanup; identifiers, original-fact binding, notices, flattening, supported years and filing gates are unchanged. No dependency, monetary arithmetic, timeout, retry or coverage threshold changes.

The explicit temporary-file save option passes through `fillReturn` to its existing packet finalizer. The shared save utility defaults to compressed object streams. Other PDF stream data still uses pdf-lib's existing behavior. The tradeoff is larger short-lived local component files.

## Retained diagnosis and focused checks

The earlier larger-batch experiment gave inconsistent results and was not integrated. A separate alternating save/load probe of an actual filled Form 1040 found that omitting object streams reduced save work while increasing intermediate bytes. This is a local diagnostic, not service performance or a solution proven against the complete coverage run.

New actual-file tests first failed because the requested temporary format was ignored. The first attempt also named the home checkbox while expecting the fixture's single-filing-status checkbox; that incorrect selector was corrected, and both tests then failed at the intended serialization assertion. Those logs are retained as `pdf-temp-streams-red.log` and `pdf-temp-streams-red-v2.log`.

The first implemented test run hit the unchanged five-second deadline in both new cases because it started a Python interpreter for each small component. The corrected test reads all completed files in one independent parser process and retains every field/text comparison, page count, visible notice, checkbox, monetary and flattening assertion. The exact final focused cohort passes eight tests in four files with one worker (`pdf-temp-streams-green-v3.log`). Root types pass; scoped lint reports zero errors and two pre-existing non-null warnings. The earlier two timeouts and both intermediate runs remain recorded; no deadline or assertion was relaxed.

## Saved workspace comparison

An alternating private eight-case probe uses the same original saved synthetic education workspace. Four baseline runs force the previous compressed temporary format and four use the candidate format. All eight final downloads are 521,690 bytes; all 22 pages have exactly equal extracted text, no retained fields or widgets, and exactly one visible review notice per page. Two original known monetary controls remain 1,150 taxable earnings and 85 additional tax. The first baseline/candidate pair also renders identically across all 22 pages at scale 0.75. The parent inspected the all-page contact and readable Form 5329 and reference pages with no finding.

Temporary serialization took 247–277 ms for the baseline and 202–214 ms for the candidate. Temporary serialized bytes increased from about 1.25 MB to 2.05 MB. Overall elapsed and process CPU observations are retained individually; concurrent local work and warm-up limit their interpretation. This does not establish that the retained full-run or remote timeouts are resolved.

The private producer is `tests/apps/web/private-component-profile.test.ts` under the task's isolated work copy; it is not part of the product patch or authored suite. Original inputs, eight PDFs, raw observations, rendered contacts and `checks.json` are under `.local/upgrade-evidence/pdf-temp-streams-profile-artifacts/`. These artifacts use the private candidate over `5b1b57cc`; later frozen integration checks remain separate. The main checkout has no PDF change until independent review and exact integration checks finish.

## Independent review and integration checks

The frozen candidate over `11039247422b50ef9032b0e371b7529f8b05c8d5` is tree `9f531f41a717ca7652d238ac1d3b8840398305fa`. All 3,459 tracked hashes remained unchanged through 1,344 passing tests in 215 files with one worker, root/web/contract types, scoped lint (zero errors, two existing warnings), both builds and the production browser download checks. Desktop and mobile both passed with one worker and zero retries; the actual downloaded PDFs were reopened by the existing independent parser assertions. The task's loopback server was stopped afterward. Exact-source receipts are retained in `parent-pdf-temp-streams-frozen-verification.json` (SHA256 `fbaa61714a1e6383eba8e88b66395e5596c9fe0ddbe3ea12d33d6a191a54992a`).

Independent software review passed 55 tests in five files with one worker, including three private controls for simultaneous request-local options, stale equal-money original sources rejecting before I/O, and cleanup after an actual merge failure. The reviewer independently reopened all eight retained profile PDFs, checked every page's text/notices/flattening, and inspected the all-page contact and readable Form 5329/reference pages. The report is `ai-pdf-temp-streams-independent-review.json` (SHA256 `068bdbac6d2abddf4744926f61308fccb05ec1402f590ef753d01ac97fdbc1cb`); it records the older profile-artifact source boundary and does not claim an independent rerun of the parent's pixel comparison.

The six reviewed paths are applied without product changes. Tax rules and readiness gates do not change. Earlier complete-run and remote coverage failures still require an integrated rerun; the separate section 465 Python stdin hang is unrelated to PDF object-stream compression.

Main-checkout verification passes four tests in three files with one worker; all five reviewed product/test hashes still match the frozen candidate (`parent-pdf-temp-streams-main-verification.json`). The command also named a nonexistent packet-finalization test, which matched no file; the actual three-file count is recorded, and the full PDF suite is covered by the 1,344-test frozen run above.
