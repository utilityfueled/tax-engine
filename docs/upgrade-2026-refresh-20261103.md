# Current source and verification refresh — November 3, 2026

Application source648dd8a3 is pushed. The subsequent8ef43fe2 adds reviewed
native-entry tests/spec/documentation without product changes. This refresh
records current sources and local verification; release readiness remains false.

## Dependency and official-source refresh

Both fresh npm audits pass:0vulnerabilities among522full/426production
packages. The initial sandbox attempt failed DNS and is retained separately;
the successful network-enabled run is under
`.local/upgrade-evidence/nov03-root-security-refresh-network/`.
Full audit SHA256 `5a53e55cf00fe12cf2baa62be93e62a01b390225c1294be768cb4472b14a3b2a`;
production `e9cae4590babf78b982f74a1e3636a81d566e5b8ecfa70633c19f69b677dbdb4`.
These results do not clear the image advisory register.

[Next.js latest](https://github.com/vercel/next.js/releases/latest) still redirects
to16.4.4, released November2. The [official advance notice](https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026)
announces seven medium fixes for November3; it supplies no published patch or
impact details yet.16.4.4 is not claimed to contain those forthcoming fixes.
Recheck before final image/release qualification; do not silently change versions.

Sixteen public official pages/PDFs were captured successfully with UTC retrieval
times, final URLs and raw hashes. Sources include
[Rev. Proc.2025-32](https://www.irs.gov/irb/2025-45_IRB),
[ScheduleA](https://www.irs.gov/instructions/i1040sca),
[8812](https://www.irs.gov/instructions/i1040s8),
[Publication505](https://www.irs.gov/publications/p505),
[AFTR](https://www.irs.gov/pub/irs-pdf/p6079.pdf),
[Publication4557](https://www.irs.gov/pub/irs-pdf/p4557.pdf), current1040/tax-table
PDFs, OpenAI/Google model/pricing pages and the two Next.js pages.
This is availability/provenance verification, not a fresh rederivation of every
rule. Raw SSA retrieval returned403; the official
[SSA table](https://www.ssa.gov/OACT/COLA/cbb.html) was verified separately through
web browsing:2026 taxable maximum184,500;2027 maximum192,300. No raw SSA bytes
are claimed. No2027 value is substituted into the2026 rule pack.

The actual [current1040 PDF](https://www.irs.gov/pub/irs-pdf/f1040.pdf) still says2025,
SHA256 `3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982`.
The [current tax-table PDF](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf) also remains2025,
SHA256 `8ae019bd3b28b07b37e46e18597d8e899222a2224ce7482c015b130033403532`.
Final2026 physical qualification stays blocked. AFTR explicitly covers preparation
of2026 returns; its course outline is not a final form or qualified tax review.

[OpenAI standard prices](https://developers.openai.com/api/docs/pricing) remain
Luna0.10/0.50 and Sol2/10 per million input/output tokens, with their existing
cache rates. [Google](https://aistudio.google.com/docs/pricing#gemini-3.8-flash)
retains Flash0.75/3.75 through December31 and1.50/7.50 from January1. The
existing [provider refresh](upgrade-2026-provider-refresh.md) already records
FedRAMP scope, exact model IDs, effort/capability and lifecycle limitations.
Public listings do not establish authenticated project availability. No keys
were present in inspected process/usual private local env locations; approved
ceiling5USD, actual spending0. No live runs or model promotion occurred.

## Actual disposable PostgreSQL checks

On the unchanged648dd8a3 product source, all45cases across the five existing
AI-ledger, database-outage, workspace, recovery and metadata-migration files
pass with0skips. This includes all33database cases skipped by the no-DB full run.
A new PostgreSQL16.14 cluster was initialized under a unique private temporary
path and bound only to loopback. No deployment DATABASE_URL was used. Its server
was stopped successfully and its temporary cluster removed in finally cleanup.

The unchanged existing tests exercise concurrent atomic reservation/settlement,
exact recorded provider costs, cancellation/refund/idempotency, query and
transaction outages, tenant scope, recovery tokens and metadata rollback.
No production, Preview or provider was contacted by these checks. They do not
establish staging auth, actual recovery-email delivery, Stripe webhook delivery,
remote backup restoration or final runtime-image qualification.

Evidence: `.local/upgrade-evidence/nov03-root-postgres-current/`.
Test log SHA256 `d4847ced4962bae827b2ee8a64d582252cd0719ca4561e00f47e8b9a60878656`;
execution receipt `b53989868ed850f6bb1b91e2fda00274c1bbd92fe463970379e0db655fa75860`.
Full no-DB coverage still has six failures and functions89.20% below90; its
33pending rows remain historically pending in that specific run, despite this
separate successful DB execution. Exact final integrated checks remain required.

Current648dd8a3 Preview is READY in deployment metadata:
[tax-engine-87bhutogw](https://tax-engine-87bhutogw-utility-fueled-llc.vercel.app).
CI742/Web741 were in progress when inspected. No green-CI or hosted rehearsal
claim follows from that metadata.
