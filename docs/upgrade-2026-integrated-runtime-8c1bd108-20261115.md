# Integrated verification of 8c1bd108

All twelve local checks pass for exact committed source
`8c1bd108bbad1a8c68c4273c25e8023ad314b231`. Four separate private source trees use
the same verified Git archive: 6,049 entries including six literal symlinks.
Fifteen separately pinned official PDF samples are added outside that archive.
Frozen installs and source hashes are
checked before and after every command. The pinned runtime is Node 26.13.1;
PDF tests use the existing pypdf virtual environment without resolving away its
virtual-environment interpreter.

| Check group | Actual result |
| --- | --- |
| Engine, contracts and web types; specs/inventory; both builds; model metadata; lint | Nine checks pass |
| `pnpm test --maxWorkers=4` | 28,728 tests in 2,098 files pass |
| `pnpm test:coverage --maxWorkers=4` | Same 28,728 tests pass |
| Statements / branches / functions / lines | 92.02% / 88.13% / 90.99% / 95.27% |
| `pnpm test:web --timeout=30000` | 638 pass, five original skips, zero failures |

The two test lanes use separate actual SCRAM PostgreSQL 16.16 clusters. Both stop
normally; their PID, passfile and private connection-URL files are absent after
closure. Coverage thresholds remain 90/85/90/90.

Browser reports reconcile the complete 643-case identity set across eight paced
batches. Actual concurrency is two workers with zero retries. Executed ordinary
cases retain 30 seconds, with eight original explicit body overrides. The five
original skipped hosted cases retain their unused 180-second declarations.
All 170 request-budget rows, 1,974 audited source entries, fourteen diagnostic
targets and original protections remain unchanged. Twenty-four build observations
preserve the immutable production build. The owned server closes normally and
its PID is absent. Five skipped tests do not establish hosted readiness.

Root and independent artifact review verify the complete tracked trees, official
samples, test/coverage reports, exact case union and cleanup. Earlier 21df source
audit failure and previous remote failures remain retained; they are not
relabeled as passing runs.

| Retained private evidence | SHA-256 |
| --- | --- |
| Tracked source archive | `58ea4dfec0a2021d618ed680238b58b73c520d801d079e6c8dbd5d5a4311af26` |
| Static result | `748673ce81c172107d4b8f6cb221f575c200ed1042a162d8d7a444e31f3f0628` |
| Unit result | `994890a801c45a918d6f75183481f5e1c756fe490ba857097328746cea38b2ec` |
| Coverage result | `0f61f798325936b93fcf2e434d26e30fac918cbb15529431818e9f69d789e86a` |
| Browser result | `ee1a4380d32709cdcc8f201e05f8235bcd52e875bb330a7fca2db7ad25d97c32` |
| Root all-twelve review | `46370283985dadada4bf295f45662cae37f3637dec86c2b09b12be6d87cdbb5b` |
| Independent artifact review | `cba5db849e2ce286ca9d48bc3ca8b189400302f5bf084804d417998c0cfe7d80` |

The protected Preview rehearsal also passes for that exact 8c source archive.
Independent saved-artifact review rehashes all 71 preparation pins, eighteen
runtime pins, 6,049 tracked entries, six literal symlinks and fifteen official
samples, and checks the four actual managed-gate receipts against the one-use
launch review. The isolated project and two existing fictional actors remain
unchanged.

All 105 authenticated API probes complete with their expected outcomes: 46
HTTP 200 mock-fallback responses and 59 HTTP 400 denials before mock dispatch.
Every probe checks private, no-store handling. These are deployed calculation-ingress and admission
checks; the response does not provide an independent remote numeric tax oracle.
Exact numeric comparisons remain local canonical calculations, including the
canonical calculation performed in the deployed browser.

Four actual UI journeys pass at 1,280- and 390-pixel widths: two source-year-2025
Coverdell bank-original journeys and two source-year-2026 HOH own-care-original
journeys. They retain typed originals, reload and unknown-versus-zero checks.
The Coverdell journeys additionally verify revision rotation, stale-write HTTP
412, other-owner shell absence and confirmation invalidation. The HOH journeys
retain the closed annual-2026 calculation and export gates. Saved browser
receipts record zero provider requests, privacy failures, external requests,
page errors, downloads and retries.

The observed total is 877 HTTP operations: 172 direct requests including
cleanup, 699 browser work requests and six browser cleanup requests. Including
the entire fifty-operation CLI reserve gives 927 against the unchanged 1,310
limit. Two fresh no-card Sandbox trials are canceled and their synthetic
customers deleted; both signed cancellation checks return 403. Both sessions
are revoked, seven owned Redis keys are removed, the Preview and its temporary
environment are removed, and the existing webhook is restored. The saved
receipt records complete cleanup, no ambiguous creation and no owned-child
uncertainty. Independent review makes no additional cloud or accounting query.

| Protected Preview evidence | SHA-256 |
| --- | --- |
| Final controller receipt | `2dce583d5b421e1e49430f6813fc37ac4942013a0ab787cd7242b0b8c2f08eed` |
| Four-journey browser receipt | `37442d2ef2877a94e425d7a3443654fd63510fb2acea86b1a1271aa298de99bd` |
| Source preparation manifest | `c7a7404d4c2929b51402a0a54732562ff75f2cb4f07d4819b13711723e7344c4` |
| One-use actual-gate launch review | `e77b34e13ebff8c1f80e66dc04b1e81cf0603a88c6727796e93433382916ef94` |
| Root actual review | `bd3f1c749208abb7cd90a355260abff2bba1dad09b15897710eaf0f5244388b6` |
| Independent actual review | `7aa35adb0a673cbcee3f8edbdbeac1c0c25c9f45b535fe161d9502f35da11ce9` |
| Second independent actual review | `7dad6072dd0ae11dc45f5f017e303baa5bcd9a2100846a3a657832afc4526ae7` |

Native ARM64 and current remote verification remain separate evidence. The later
AMD64 controller correction has its own tests and review; this report does not
imply a native success for that correction. Qualified human
tax/spec/expected-result review, final annual forms, security/privacy acceptance,
advisory ownership and independent AI evaluation remain required. Filing, model
promotion, production deployment and release qualification remain disabled.
