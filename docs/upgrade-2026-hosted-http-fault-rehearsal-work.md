# Hosted production HTTP fault rehearsal

November 4, 2026. The [source-first contract](upgrade-2026-hosted-http-fault-rehearsal-spec.md)
precedes the runner and corrections. This is local synthetic production-server
evidence, with actual Better Auth and a disposable PostgreSQL 16 cluster. It
does not qualify Neon, Upstash, SMTP, Stripe, providers or the deployed service.

## Observed defects and corrections

On application base `a757d7355fd7140193c6eafcda52e8a88a63e393`, a database
outage after successful initialization produced HTTP 500. Ten new unit cases
reproduced uncaught workspace actor/entitlement dependency failures before the
existing persistence boundary. The narrow correction contains those awaits
using the existing generic private 503. Null sessions still return 401 and
denied plans still return 403.

After that correction, the actual HTTP rehearsal still failed on initialized
authentication. Better Auth serializes a dependency error into a 500 response;
the application's exception boundary cannot catch a returned response. Four
new cases reproduced upstream 500/502/503/504 diagnostics and cookie leakage at
that boundary. Five preserved-status controls cover 200/400/401/403/429 and
ordinary cookies. The correction normalizes only the actual upstream auth
handler's server failures to the existing generic private 503/Retry-After 30,
discarding its body and failure cookies. Local rate-protection responses retain
their existing code, body and headers.

Retained failures include the initial runner setup failure (stream not yet
open), an invalid new fixture fact ID correctly rejected by the metadata
allowlist, a lint diagnostic, and the first overbroad auth normalization caught
by the unchanged shared-protection test. The fixture uses the valid `wages`
identifier; the application allowlist and existing tests were preserved.

## Verification

- Genuine workspace RED: 10 failures, log SHA-256
  `cf053a55458f33061e59eb204757d61115730438b5240e5ae09c22431e8fb35a`.
  Focused 62 and adjacent 102 subsequently pass; root/contracts/web types,
  specs, test-reference validation, inventory, strict lint and both builds pass.
- Genuine returned-auth RED: four failures and 12 passes, log SHA-256
  `fbd11a07d310e7a43809189ea4d6602cadf7a7802a9223432660f7b0a236a213`.
  Final auth 22/2 files, web types, specs, test-reference validation, strict lint,
  inventory and production web build all pass. The nonexistent optional test
  path in that invocation contributes no case or claimed evidence.
- Final actual HTTP run: 13 passed, zero failed; production build ID
  `qofxswBPkDMetWeHCGktL`. Receipt SHA-256
  `a0e473cfa7f52501303801acef7cd6295f990250e412b36ad592e76e0192b530`.
  Runner SHA-256
  `ac0bbe1785a89d36777a24183c10d0221b7285efc32f011c6df8fdfa36349af9`.
  The receipt records base HEAD; the tested workspace/auth source SHA-256 values
  are respectively `633d86e1815eed97422d20eeb4ef49a454cbac2425a7e4133a31f589ca4e905e`
  and `27a8c5374452d100c75ef13186a9dfecc97ae101c5c279c970743708f0675da4`.
- Independent engineering source review approves both narrow product seams;
  final upstream review receipt SHA-256
  `1a0091af738907ecdb0326e7bcbe81a147691303f0a2c73b7ee1d57d0bd9303d`.

The actual run exercises two production Next processes, distinct real sessions,
same-ID owner isolation, metadata-only save/list/reopen/delete, a shared exact
100-request boundary, three controlled REST faults, database startup and
post-initialization outages with exact recovery, oversized and interrupted
bodies, unavailable email recovery, and finite response/log privacy checks.
Three observed database backends use TLS 1.3 with the owned CA and matching IP
SAN. The delayed REST fault fails closed after 2,039 ms under the unchanged
two-second SDK deadline. All owned processes stop, all four ports close and
temporary cluster files are removed; retained evidence remains private.

Local receipts and logs are under `.local/upgrade-evidence/`, specifically
`nov04-root-http-outage-*`, `nov04-root-http-auth-returned-*`,
`nov04-hosted-http-faults-independent` and `tax-hosted-http-F7qvT2`.
Previous actual runs `tax-hosted-http-gv6gr1` (11 pass/two fail) and
`tax-hosted-http-GoBOFb` (12 pass/one fail) remain retained.

## Remaining qualification

The controlled transport is not a Redis/Lua qualification. Synthetic inserted
entitlements are not Stripe evidence; absent SMTP is not delivery evidence.
Finite interruption/privacy observations are not universal guarantees. Repeat
the required integrated checks on final source and staging, complete the
approved Preview-schema recovery rehearsal, qualify final runtime images and
obtain independent human security/privacy review. No filing, deployment,
production or model-promotion authorization follows from this package.
