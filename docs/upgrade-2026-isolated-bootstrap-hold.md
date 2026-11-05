# Isolated hosted rehearsal: bootstrap blocked

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
