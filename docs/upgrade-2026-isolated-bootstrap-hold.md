# Isolated hosted rehearsal: protected Preview ready

## Current observed state — November 5 UTC

The authorized isolated bootstrap and both authorized Preview builds now exist.
The final Preview reports READY with a present null target (Preview), the exact
approved public source `480ca19d06a68032fce8fa08255e9f9c9e2c1e88`, and unchanged
all-URL authentication, domains, bootstrap and earlier Preview. Fourteen app
environment metadata entries are Preview only, including the sensitive webhook
signing-secret entry. This verifies metadata, not secret-value equality or
application functionality. No additional build is authorized by this grant.

The first final-Preview attempt recorded zero deployment negotiations. Read-only
diagnosis reproduced the installed CLI inheriting a different default team;
the original raw error was discarded, so it is not reconstructed as evidence.
Its failed receipt and read-only reconciliation remain intact. A successor binds the same
authorized team in the CLI request; 96 author and four distinct controls pass.
The actual successor performs one deployment command, two negotiations after an
explicit missing-files response, one upload and one accepted deployment. Five
unauthenticated host checks observe the authentication redirect without sending
credentials or following redirects. Existing production is untouched.

The existing isolated Stripe sandbox webhook now points to that final Preview.
One URL-only POST and three GETs verify the same endpoint, account, events, API
version, description, metadata and enabled test-mode status. Full private URLs
are compared in memory; neither the access token nor raw provider responses are
saved or printed. The signing secret is neither read nor rotated. The actual
worker exits zero with zero stdout/stderr and a bounded safe projection.

The updater's first review catches an invented fixture field absent from actual
deployment evidence. Its genuine failure is retained. The corrected successor
validates the original Preview through its exact retained history record; 86
source controls and eight independent saved-evidence consistency checks pass.
These engineering checks do not establish authentic signed delivery, duplicate
or automatic-retry behavior, exact billing effects, outages or recovery.

The subsequently approved signup/session phase now creates two synthetic
accounts and two distinct no-payment-method sandbox trials. Their baseline
metadata updates and scoped read-only database inspection pass. See the
[two-account baseline ledger](upgrade-2026-isolated-two-account-baseline-work.md)
for exact scope and independent saved-evidence review. Automatic failed-delivery
retries, dependency outages, current-source distribution and release
qualification remain open.

Private evidence SHA256 bindings:

- Final Preview source manifest: `9ddc0773eb6e6579f05fd639b3db45209c4bb42782caf9facaccc593eb809bba`.
- Actual READY receipt: `d93754659f62454964595bd94722dd3cf7e0b8bbcbae05b5781f84f78d00df0f`.
- Actual deployment evidence: `1352436fb920ce1ead350c73bae4443ead103539a6c1d1e3f3939ad7b67f4ce4`.
- URL updater source manifest: `f5df188f6e6ba60c96b201f771e8fa3b0fb9ca8e0784dad8a03492999fb67b52`.
- Actual URL update receipt: `6d4628de8379a47fcad9d228b824598031b99c3e24a28e8485e710d66eb7df88`.
- Distinct actual consistency manifest: `0458fb4ab554d8bc1a043cd9bc6dbd8c56c941316aaf7f0f4959e0a6ef0f19e6`.

## Historical canceled first deployment and original hold

The approved isolated project received one explicit Preview CLI submission of
public commit `480ca19d06a68032fce8fa08255e9f9c9e2c1e88`. Vercel classified that
first deployment as Production. It was immediately canceled; provider readback
confirmed CANCELED. The existing production application was untouched. No
rehearsal accounts, subscriptions, webhook endpoint or outage traffic followed.

The first local receipt's `productionAction:false` described the requested
intent, not the actual provider target. The separate incident receipt supersedes
that statement. Both remain preserved. This is not a successful Preview build.

The reviewed CLI path and [Vercel's first-deployment behavior](https://github.com/vercel/vercel/pull/17206)
explain the mismatch. A canceled deployment does not prove a subsequent build
will be Preview. No second deployment is authorized by the original Preview-only
grant. No flag workaround, CLI upgrade or automatic replay has been attempted.

Fresh read-only metadata shows the isolated project has only Preview application
variables and its default Vercel domain. Its current authentication scope does
not establish protection of the Production default alias. [Vercel distinguishes
standard protection from all-deployment protection](https://vercel.com/docs/deployment-protection).

A concrete request is pending for free authentication on all URLs of only that
isolated project, one deliberately Production-labeled bootstrap without
Production application credentials, and at most two subsequent Preview builds.
The default isolated alias is explicitly included. No such protection mutation
or bootstrap has occurred. The request excludes the existing production project,
custom domains, paid plans, new bypass tokens, live charges, filing and model
promotion. Every stage still requires actual target, source, protection and
build-state readback; process exit alone is insufficient.

The corrected disabled runner passes 14 offline policy controls and six actual
entrypoint controls. An earlier entrypoint error was found before execution and
its failed controls remain preserved. These checks establish source behavior,
not hosted qualification. Actual dependency outages, automatic same-event Stripe
retry, precise credit effects and cleanup remain required and unperformed here.

Private evidence: `nov05-isolated-first-deployment-production-incident`,
`nov05-vercel-first-deployment-target-independent`,
`nov05-isolated-production-bootstrap-candidate-v2`, and
`nov05-isolated-bootstrap-protection-permission`.

## Approved protection successor — November5 UTC

The user subsequently approved one protected isolated Production bootstrap and
up to two Preview builds (call_63b350efe3904427b0a41f9ce827b53f). The purpose-built
connector performs one scoped protection PATCH, then independent GETs confirm
`ssoProtection.deploymentType=all`. The returned project projection changes only
the protection and update timestamp. The sole isolated default domain is
unchanged; normal CLI non-decrypted metadata confirms all13 Preview-only entries
are identical before and after. No credential value is printed or saved by these
checks. The connector's environment-list403 is retained; the approved normal CLI
read supplies that bounded metadata evidence.

Private evidence: `.local/upgrade-evidence/nov05-isolated-protection-root-current/`.
This protection readback does not establish HTTP/application qualification or a
successful bootstrap. The earlier canceled deployment remains canceled and its
incorrect original target intent remains preserved. At this record no additional
deployment has been submitted; the reviewed exact480 bootstrap still needs fresh
source/project/target checks. No existing production project is changed.
