# Hosted webhook configuration gates

Reviewed implementation adopted and verified in the main checkout. Exact baseline: `5996cbda71678c70f16f3c909590163f38b21909`, containing the independently reviewed subscription reconciliation package.

The existing POST route checks incompatible key mode but does not honor the complete billing `blocked` result or the database `blocked` result. Its subscription path selects process memory when the database resolver returns no URL; an explicitly injected store also wins regardless of deployment. Missing signing secret currently returns 400, while missing other production billing fields can pass to authentication/reconciliation. These source observations require genuine existing-API runtime confirmation before a correction.

The new spec was written before the new test. Four positive controls cover configured production, configured isolated Preview, explicit hosted development memory and production self-host bypass. Ten unavailable-configuration controls cover missing production DB, missing isolated Preview DB despite general DATABASE_URL, malformed isolated Preview DB, five required production billing fields individually absent, invalid app origin, and invalid Preview origin metadata. Each negative control independently asserts the actual resolver is blocked, then exercises both injected signature and default SDK entry with explicitly injected memory. Expected 503 must precede body consumption, signature construction, SDK construction, atomic reconciliation, credits, receipts, legacy mutations and memory writes. Rate limiting is mocked allowed, preserving its earlier precedence.

The controls use synthetic account IDs/configuration only, an injected event constructor for positive behavior and SDK spies for forbidden construction. They are not live signature, PostgreSQL, provider, entitlement or deployment proof. Existing transaction controls remain; the explicitly documented signed-mode setup successor is below. No old assertion, parser, price/mode rule, response deadline, rate policy or fallback is changed here.

## Separate SSL source gap

Current `getHostedServerDatabaseConfig` validates the isolated Preview URL scheme/host/database path but has no invalid-SSL blocked state. `resolveHostedPoolSsl` recognizes `require`, `verify-ca`, `verify-full` and the provider hostname suffix; no supported environment-based SSL validator was identified. Therefore this package does not invent an invalid-SSL mock, legal policy or implementation. Any finite SSL policy needs its own specification, actual input contract and failing controls before product changes.

## Historical source-first correction proposal (now implemented privately)

After existing self-host bypass and before content type/body/authentication, honor the existing billing and database blocked results with the current generic 503 billing-unavailable response. Keep early rate-limit behavior, key-mode guards and permitted explicit development memory. Database and billing resolvers remain unchanged. The original proposal awaited genuine RED and root authorization. That evidence is retained; the final bounded package contains the three new files plus the one-product correction and approved existing-test setup/additive-control successor.

## Approved source-first successor after first GREEN

New14 PASS; adjacent96 yielded86PASS/10FAIL in the old keyless-production setup. The original failure receipts remain immutable. Before any successor runtime, two additive parameterized production controls cover subscription/credit matching and opposite/absent/malformed signed event modes using the actual local SDK signature verification and complete matching test/live keys, both prices, app origin and database configuration. They exercise four test instances with both billing modes and retain no-provider/no-database boundaries.

Only four old setup expressions add NODE_ENV development, preserving original signed payloads, modes, amounts, titles and assertion outcomes. Removing those four setup properties and the additive describe block restores the original test byte-for-byte. The old keyless tests describe development behavior; keyless production remains explicitly503 in the unchanged new14. No additional product change.

## Final bounded verification

The first declared command failed before test execution because Vitest4 no longer accepts minWorkers; the original diagnostic is retained, and removing only that flag preserved worker1/default5000ms. Positive4 then passed; existing API negative10 genuinely failed (nine200, one400), establishing the missing gates. The approved sole product condition then made new14 pass. The first adjacent run retained86pass/10fail due to original keyless-production setups. The source-first successor preserves these original logs and moves exactly four keyless setup expressions explicitly into development, with all payloads/titles/assertion outcomes retained and inverse restoration verified.

Final18 source/configured-production-signature controls PASS; the declared adjacent100 PASS. Four additive production cases overlap those invocations, so114 unique non-AST tests passed. Root/contracts/web types3 PASS; spec7934 references PASS; AST753 PASS; owned3 strictlint has0warnings/errors. The initial inventorycheck correctly failed stale; private inventory regeneration820/check PASS, both engine and production web builds PASS. Generated inventory is explicitly excluded from the owned adoption patch; root must regenerate it on main.

Final product is only the existing webhook conditional extension. No database/billing configuration resolver, signing/parser/price/default/transaction semantics, rate-limit precedence, provider HTTP, SSL policy or main file changed. Actual provider delivery/configuration and deployed behavior remain unverified here. No external credentials/network/DB invocation; valid production signature controls use actual local SDK cryptography with synthetic signing secret and keys, then test-only forwarding adapters.

## Main adoption and distinct review

At main base `d26e17c1`, the unchanged source-first14 reproduced10fail/4pass before product adoption (log `fadfab8890f00b4782e2f708db622667f48a7e01f05569c5307a300c2ef2b70a`). The exact reviewed five-file candidate then passed18selected plus100adjacent,114unique. All12main check sets passed: types3, spec,753AST controls, strictlint0warnings, regenerated820inventory/check and both builds. Checks receipt `33721063b2f1c0042e9258fefbf548a74aeb8442ee7280838d0e58ff1f0069af` in `.local/upgrade-evidence/nov03-root-webhook-config-green/checks.json`. No real PostgreSQL or external Stripe replay is attributed to this configuration package.

Distinct static review `4312a7ec05005f4d52d008cd8a50b32e83d8730c607e9740fb61826c4f7a26cd` found no blocking issue and verified the exact product inverse, original14, four development setup changes and additive production signature controls. Prior actual transaction evidence stays separately recorded. Deployment, SSL-policy and complete hosted/release qualification remain open.
