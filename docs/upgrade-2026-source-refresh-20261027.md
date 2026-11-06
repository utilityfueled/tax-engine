# Public source refresh — October 27, 2026

The checkout was refreshed from `origin/upgrade/2026-baseline` at
`318127142879f68472ab8440a95f1b9abdc49234`; local and remote have no divergence.
Unrelated `.pnpm-store/` and `docs/reviews/` remain untouched. This is public
document evidence. It does not qualify a tax rule, final form, provider account
or release. The [manifest](upgrade-2026-source-refresh-20261027.json) records
retrieval times, response hashes, failures and the bounded conclusions below.

Seventy-nine direct requests produced 75 successful responses and four retained
HTTP failures. All successful bodies were independently rehashed after download.
The 48 IRS final-form PDFs and five additional draft/state PDFs are byte-identical
to the [previous refresh](upgrade-2026-release-source-refresh.md). Forty-five
annual federal endpoints still identify 2025; Form 4952 identifies 2026 but is
unqualified. Forms 172 and 982 retain their revision dates. The draft 1040 and
Schedule 3-A remain drafts. No mapping or filing gate changes.

The [SSA wage-base table](https://www.ssa.gov/OACT/COLA/cbb.html) and direct
download of its [2026 fact sheet](https://www.ssa.gov/cola/factsheets/2026.html)
returned HTTP 403. The browser research tool successfully read the official
fact sheet: the 2026 Social Security maximum is $184,500, with the separate
6.2% Social Security and 1.45% Medicare rates. This is explicitly recorded as
browser-extracted evidence, without inventing a successful direct-response hash.
The IRS [2026 inflation procedure](https://www.irs.gov/irb/2025-45_IRB),
[Schedule A](https://www.irs.gov/instructions/i1040sca),
[Schedule 8812](https://www.irs.gov/instructions/i1040s8),
[Schedule 1-A announcement](https://www.irs.gov/newsroom/irs-published-schedule-taxpayers-will-use-to-claim-deductions-on-no-tax-on-tips-no-tax-on-overtime-no-tax-on-car-loans-no-tax-on-seniors),
[Publication 505](https://www.irs.gov/publications/p505),
[2026 AFTR outline](https://www.irs.gov/pub/irs-pdf/p6079.pdf) and
[data-security reference](https://www.irs.gov/pub/irs-pdf/p4557.pdf) were retrieved.

The [PA index](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax)
and retained PA/OH PDFs do not establish final 2026 annual-return qualification.
Both direct Ohio forms-index URLs returned HTTP 404; the official search index
still exposes the [forms page](https://tax.ohio.gov/individual/get-a-form).
Bounded official searches did not locate final 2026 PA-40, OH IT 1040 or SD 100.
This is not an exhaustive absence claim or a decision to select these states.

The [REG-119882-25 proposal](https://www.govinfo.gov/content/pkg/FR-2026-08-20/html/2026-16985.htm)
and [hearing cancellation](https://www.govinfo.gov/content/pkg/FR-2026-10-09/html/2026-20790.htm)
returned changed HTML hashes; their inspected content remains a proposal and
hearing cancellation. The [October 26 bulletin](https://www.irs.gov/irb/2026-44_irb)
still indexes REG-119882-25 under proposed regulations. A bounded search of IRS,
GovInfo and Federal Register sources did not establish a final rule or effective
applicability. The prospective Schedule 3-A dependency remains separate from
implemented credit calculations.

All eleven provider documentation endpoints returned HTTP 200. The standard
text rates, cache charges, context/regional multipliers, effort support and
lifecycle observations agree with the [existing provider ledger](upgrade-2026-provider-refresh.md).
In particular, [OpenAI's notice](https://developers.openai.com/api/docs/deprecations)
still retires the GPT-5 Mini alias and snapshot on December 11, 2026. The
[Google price schedule](https://ai.google.dev/gemini-api/docs/pricing) still doubles
Gemini 3.8 Flash's documented input/output/cache rates from January 1, 2027.
[Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
documents stable availability, structured output and High thinking, while minimal
is unsupported. These are public product statements; account access, paid-tier
privacy settings, schema/effort acceptance and billed usage remain unverified.

No authenticated provider requests or paid calls were made. Existing runtime
price records, approved evaluation-request digests, account evidence, model
routes, rule versions and readiness gates are unchanged. Human-reviewed cases,
approved credentials/spend, final form qualification, state selection and staging
evidence remain in the [external-action handoff](upgrade-2026-external-actions.md).
