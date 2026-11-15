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

Protected Preview, native ARM64 and current remote verification remain separate
evidence. The later AMD64 controller correction has its own tests and review;
this report does not imply a native success for that correction. Qualified human
tax/spec/expected-result review, final annual forms, security/privacy acceptance,
advisory ownership and independent AI evaluation remain required. Filing, model
promotion, production deployment and release qualification remain disabled.
