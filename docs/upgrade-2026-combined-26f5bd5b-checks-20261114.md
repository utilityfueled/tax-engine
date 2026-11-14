# Twelve exact-source checks, November 14

All twelve required local checks pass on immutable application revision
`26f5bd5b1d99df1655aa89cbd88e59d7333161de`. Four isolated copies of the same
tracked Git archive run in parallel; every check retains unchanged tracked-source
hashes. The archive SHA-256 is
`f5f27ec35a4dc8631d17d72d0757ee6ecbe94765f84a0879a38d4888cb0f2a3d`.
Subsequent work and runtime artifacts retain their separate revision boundaries.

| Required check | Actual result |
| --- | --- |
| `pnpm test --maxWorkers=8` | 28,449 pass / 2,066 files |
| `pnpm test:coverage --maxWorkers=8` | 28,449 pass / 2,066 files; 88.03% branches |
| `pnpm typecheck` | Pass |
| `pnpm typecheck:contracts` | Pass |
| `pnpm typecheck:web` | Pass |
| `pnpm spec:validate` | Pass |
| `pnpm spec:inventory:check` | Pass |
| `pnpm build` | Pass |
| `pnpm build:web` | Pass, explicit webpack preserved |
| `pnpm lint` | Pass; existing warnings retained |
| `pnpm test:web --timeout=30000` | 633 cases: 628 pass, five original hosted-only skips |
| `pnpm eval:models:check` | Pass, no model promotion |

Frozen offline installation uses the existing pinned dependency store, Node
26.13.1 and unchanged lockfile. The unit and coverage lanes each use their own
loopback SCRAM PostgreSQL 16.16 cluster and restricted passfile. Both clusters
stop normally and the controllers acknowledge no owned running database. The
browser uses the existing Python/pypdf test environment and fifteen independently
pinned official specimen PDFs. It is the sole owner of its localhost server.

The browser's eight actual batches contain 92, 47, 113, 122, 45, 10, 13 and 191
cases. All exit zero, with zero failures, retries or flaky results. The unchanged
configuration uses two workers, zero retries and a 30-second default timeout.
Eight existing executed cases retain their source-specific overrides: six PA
cases at 180 seconds and two PA care cases at 240 seconds. The five original
hosted skips retain their existing 180-second setting. An independent auditor's
first overly strict default-timeout assumption fails and is retained; the
corrected audit binds these actual overrides to unchanged predecessor source
and reports. No runtime test or policy changes to pass that audit.

Independent actual review verifies 5,882 tracked regular files, 5,079 browser
inputs, all batch reports and 24 immutable-build observations. The owned server
PID 7229 records normal closure. Five skips establish no hosted qualification;
protected Preview tests remain separate. Local success supplies neither final
2026 form qualification nor human tax/security review, AMD64 evidence, remote CI,
production deployment, filing permission or AI promotion. Main remains unpushed.

Private evidence root: `.local/upgrade-evidence/nov14-main-parallel-26f5bd5b/`.

| Artifact | SHA-256 |
| --- | --- |
| `static/result.json` | `62ade76b84468ac3692e659ba8d6135f9bedebc103b7b331c4c17f53a07de895` |
| `unit/result.json` | `42c736ef532d2e786506b64420eb8500131eeb66610d3ae53ef1cd4534d44653` |
| `coverage/result.json` | `0a04a08f2f1510dba879b016d544f4008fb3a508666c9eaf4cb17fa89f855fb6` |
| `browser/result.json` | `d35ad7b66efe52f019b9d758c249d3b3e45ed7abca6685fc76b588d8eb449a05` |
| Independent `nov14-main-26f5bd5b-browser-independent-review/REVIEW.json` | `38079cb695f7421050b37c5f736fff4f11362ddde45fc7818093d685720a5b58` |

The preceding sandbox, fixture, lint, strict-reference and overlapping-server
failures remain in their original evidence folders. This successor changes no
test assertion, privacy rule, readiness gate, coverage threshold or historical
result. It is a completed verification package, not completion of the upgrade.
