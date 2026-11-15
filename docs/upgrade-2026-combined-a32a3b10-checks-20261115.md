# Consolidated local checks and main backup, November 15

Exact source `a32a3b10796656d881d0bff042512cdb620710fc` passes all twelve
local checks. Its pure Git archive is
`5c491e2044ab4ed25b8ff89925d29366263464b668e1f575c66ba123095097a1`.

| Check | Actual result |
| --- | --- |
| Engine, contract and web types | Pass |
| Strict specs and inventory | Pass; all 9,223 line references resolve |
| Engine and web builds, model registry, lint | Pass |
| Unit | 28,555 passes across 2,079 files; eight workers |
| Coverage | Same 28,555 passes; 92.02% statements, 88.10% branches, 91.09% functions, 95.28% lines |
| Browser | 637 collected, 632 pass and five original hosted-only skips; two actual browser workers, no retries |

The existing 85% branch threshold, five skips, eight existing timeout overrides,
14 diagnostic targets and default 30-second browser timeout remain unchanged.
All four actual execution sessions ended with exit zero and were acknowledged.
Root rechecked all 5,966 Git members (5,960 regular files and six literal links),
15 official sample PDFs in each managed source tree, all reports, 24 browser
observations and 315 immutable browser files. Both separate owned PostgreSQL
clusters stopped normally and their private temporary credential files were
removed. The browser's owned server closed normally. Root artifact receipt:
`d6e6ecffb56e58855b88bc99207a1767cdce964bd67337c8ee150098f3a495b0`.

## Push and production boundary

The owner explicitly instructed: disable automatic production builds, then
push main. On the existing Vercel `tax-engine` project, root saved and reloaded
**Ignored Build Step → Only build pre-production**, whose displayed command
builds only when `VERCEL_ENV=preview`. No production deployment was invoked.
The main push completed with exit zero, fast-forwarding `59248889` to `a32a3b10`;
a separate remote read verified both `main` and
`codex/2026-upgrade-backup-20261114` at the full source SHA above. All 398
previously unpushed commits are on both remote branches. The Docker workflow
was inspected before the push and retains `push: false`.

## Runtime and remaining work

Exact-source ARM64 and protected isolated Preview preparations passed separate
source reviews and root review. After all four actual local gates passed, the
one-use Preview launch review was written and the native wrapper invoked.
The first Preview controller stopped before any HTTP or external mutation
because its launcher selected an older unsupported Python interpreter; its
failed receipt is retained and a separately reviewed interpreter successor
is being prepared. Native image work is underway. Preparation and green local checks do not
constitute runtime, human tax, security, filing or 2026 form qualification.
Remote CI/Web checks also continue. Older `e719e3fe` remote runs were canceled
by the existing branch concurrency policy when these replacement runs began;
their partial outputs are not a complete CI or image-scan pass.

A further scope audit identified finite Ohio balance-payment sources and guided
investment-election parity work. Official 2025 PA Schedule A instructions also
show that the existing $2,500-only attachment trigger is stale: the actual
attachment depends on adjustment lines, with separate ownership rules.
These follow-up candidates are being developed privately and are not included
in this checked source. The official source is
[2025 PA Schedule A and instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40a.pdf),
retrieved HTTP 200, SHA-256
`dd32da96a856d033725e772c9a7dc4339131b4abe776e4caa4e7de722c0cbfce`.
Qualified independent human reviews, final annual 2026 forms, held-out human AI
labels and security advisory disposition remain external gates; none is waived.
