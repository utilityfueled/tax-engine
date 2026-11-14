# Twelve integrated exact-source checks, November14

All twelve required local checks pass on immutable application revision
`aea453eca1d4a0e92cdfbe9a22f2f129fb247a03`. Four separate Git archives run
static checks, unit tests, coverage and browser tests in parallel. Unit and
coverage each use eight workers; the browser retains two workers. Every
recorded check preserves its tracked source hashes. The pure Git archive hash
is`83b57e5a65e39ced1bda0c871ec069728db9eb7b6ef1cf098a45c684db4d6a52`.

| Required check | Actual result |
| --- | --- |
|`pnpm test --maxWorkers=8`|28479pass/2071files|
|`pnpm test:coverage --maxWorkers=8`|28479pass/2071files;88.07percentbranches|
|`pnpm typecheck`|Pass|
|`pnpm typecheck:contracts`|Pass|
|`pnpm typecheck:web`|Pass|
|`pnpm spec:validate`|Pass|
|`pnpm spec:inventory:check`|Pass|
|`pnpm build`|Pass|
|`pnpm build:web`|Pass, explicit webpack preserved|
|`pnpm lint`|Pass; existing warnings retained|
|`pnpm test:web --timeout=30000`|635cases:630pass/fiveoriginalhostedskips|
|`pnpm eval:models:check`|Pass; no model promotion|

Coverage is92.01percent statements,88.07branches,91.06functions and95.26lines;
all existing thresholds remain unchanged. Node26.13.1, frozen offline install,
PDF Python/pypdf and fifteen pinned official specimens are retained. Unit and
coverage use separate loopback SCRAM PostgreSQL16.16 clusters; both stop normally
and their private temporary URL/passfiles are removed.

The eight actual browser batches contain92,47,115,122,45,10,13and191cases.
All exit zero, with no failure, retry or flaky result. The default timeout remains
30seconds and retries zero. Six existing executed PA cases retain180seconds,
two retain240seconds; five original hosted skips retain180seconds. Separate
review binds every exception and skipped case to the predecessor reports and
unchanged source. No policy or assertion is weakened.

Root's actual artifact audit and separate farmland review verify5912regular
Git blobs, six literal symlink targets including trailing slashes,5100browser
inputs including fifteen official specimen PDFs,315immutable build files and
24zero-change build observations. The owned server60758closes normally. The
independent reviewer's initial Unicode-key normalization error is retained; only
the review harness changes.

This source includes the separately reviewed three-family Marketplace, guided
Coverdell bank conversion, mixed-capital foreign service and farming-waiver
packages. The preceding exact73713unit/coverage disclosure failure and partial
owned browser abort remain failures in their own evidence. The AEA test-only
correction retains all monetary, source, missing-fact and edit-invalidation
assertions and explicitly tests both supported education routes.

The protected Preview successor uses this exact archive and has passed, with
separate artifact review. The same-source ARM64 successor is running. Detailed
runtime outcomes belong to separate ledgers; no ARM64 terminal result is inferred. Five skipped browser cases establish no hosted qualification.
Later private foreign-loss/EIC candidates are excluded. Native AMD64, remote CI,
final2026 forms, qualified human tax/security/AI review and model promotion remain
separate gates. Main stays local under the production push hold.

Private evidence:`.local/upgrade-evidence/nov14-main-parallel-aea453ec/`.

| Artifact | SHA256 |
| --- | --- |
|static/result.json|4b098afa4fc89a10043299854c57eb15a551d8a4a82704771438ccffd5ad6440|
|unit/result.json|69857b0ebe0345d7ba1303d8d0ceb7bd8919cb800ea76c41852b08f6397b2753|
|coverage/result.json|77b5a00f81a184c817f1eae66449e8f04d5ec09ac56fafbd3833eac12407681b|
|browser/result.json|539fc11a8f36a43c51f89035a74032570dbeb96ca43263e798eaa34041c8b81e|
|Root actual browser audit|aa51d146acea8a5d5965d2b1b8e935d76cefe9efea6459dab6affd9e6dfb0f97|
|Separate actual browser review|69c35c246b05be30db2429b7f1819d2bb224c355761a85d0c1494679f20a58cc|
