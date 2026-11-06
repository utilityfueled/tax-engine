# Digital browser actual-source fixture migration

This fixture-only package starts at fcf41e68. The former desktop and mobile tests
both genuinely failed at the unchanged $1,536 PA ticker assertion because their
raw federal originals lacked actual PA source packets. The original setup remains
an independent negative control. No app, engine, source gate, or configuration
changes belong to this package.

The new records are explicitly fictional: a full-year PA home/domicile and actual
PA service payroll of $50,000, a filed full-year 2024 PA original with zero taxable
income, a separately stated expected April 15 payment of $1,536, no dependents,
complete worldwide sources, and complete credit/local-account review. The original
Austin mailing address stays intact. No PA residence is inferred from that address.
The W2 original has explicitly known source year and zero benefit/retirement boxes,
with actual no-state/local-row confirmation. Digital withholding remains federal
$0.10 and state zero. There is no VA or other-state refund record.

The original monetary assertions remain: proceeds $100.49, federal basis $90.24,
PA basis $80.24, federal income $50,010.25, federal tax $3,875 and PA tax $1,536.
The PA acquisition-reference edit still clears child statement/basis confirmations.
The browser explicitly reconfirms the digital child, residency, ordinary facts and
completion panels through native buttons before expecting the restored PA result.
The already reviewed State Return fixture section is marked visited so the native
stepper can revisit it. After the investment edit, real Continue validates and
records the Investments visit; no extra completed-section fixture flag is added.
The incomplete fixture remains unvisited and unchanged. The fictional taxpayer
explicitly elects the standard deduction before snapshots are confirmed, preserving
the source identity through normal JSON/storage loading.
Removing basis still prevents an estimate. Original source values and private
request-payload exclusions remain asserted at both viewport sizes.

Runtime evidence, exact source copies, failures and check hashes are retained in
`.local/upgrade-evidence/nov03-browser-digital-actual-sources`. This local fixture
proof does not qualify staging, hosted services, filing, final 2026 forms or human
review. Check outcomes are recorded only after actual execution.

Verified author evidence: six source/persistence controls passed, both original
browser cases passed (1280px and 390px), three type checks passed, 7,156 spec lines
validated, 644 strict spec-reference checks passed, owned lint reported zero
warnings, and root plus explicit-webpack web builds passed. The final browser-only
navigation change received a fresh strict lint check and real browser execution;
production source bytes were unchanged from the tested webpack build. All 20 old
browser assertion lines remain byte-identical. Desktop/mobile screenshots were
inspected after the missing-basis negative: the estimate stays unavailable, PA
basis remains $80.24, and the page has no horizontal document overflow. This is
local synthetic evidence, with no hosted-account or live-service operation.

Retained failed evidence includes the original two missing-PA-source browser
failures; the new unit's initially incorrect preview-field name; the normal
Playwright root-fixture import diagnostic; the saved-data fingerprint regression;
and a native navigation timeout before the real Continue step was added. The
accidental default Turbopack command was stopped and its log retained; the correct
repository webpack command passed. None of these failed runs is counted as a
successful qualification result.

## Actual main integration — November 3

Five source/test/documentation paths were adopted exactly after parent review on `314cbba3`. All twenty old browser assertion lines remain byte-identical and in order. Main passes 685 tests across six files, three typechecks, 7,222 spec references, inventory generation/check and strict lint. Both desktop and mobile browser cases pass against the actual current local application build with retries disabled; both saved screenshots were inspected. The loopback server and port3548 are closed. Source code is identical to the tested owner-clear webpack build, so a test-only rebuild was not repeated.

Parent integration receipt `a9f23058cc58930bb9bac4cf472e46cdb748081e7d4748cee47055b31ae5346d`; browser log `77354716ff99cc00c87563e84c7579c53b90fcdab53480b6f4cf3309d3ca2fe2`; scoped log `f554766fe95cfbff301f96bd9d44c9036104f93fe8aa21272ed54e2d3b09b454`. Private evidence `.local/upgrade-evidence/nov03-parent-browser-digital-main*`. This does not qualify the separate native VA refund entry flow, hosted staging or final2026 filing. Owner-clear fix `314cbba3` is committed/pushed.
