# Public release-source refresh — October 25, 2026

This is public document evidence, not filing qualification, authenticated model
availability or a release approval. Retrieval occurred October 25 in
America/New_York (October 26 UTC); exact timestamps and SHA-256 values are in the
[companion manifest](upgrade-2026-release-source-refresh.json). The audit baseline
is `31a1c4a`. No calculation, metadata version, model route or readiness gate changes.

## Federal final-form endpoints

All 48 requested IRS final-form endpoints returned PDFs. All 37 hashes in the earlier
source register are unchanged. Scope includes that register, two newer historical
manifest entries (7206/8962) and nine named implemented forms. It is not an
exhaustive IRS catalog search.

- [Form 4952](https://www.irs.gov/pub/irs-pdf/f4952.pdf) is final 2026, four pages,
  SHA-256 `90b9fc0bd6778983521b61ed5c94cc5668e62af858e38e94a1a6fd4b631bfb6d`.
  Its existing 2026 candidate is still unqualified.
- The other 45 annual forms fetched still identify 2025, including 1040,
  Schedules 1/1-A/2/3/A/D/EIC/SE/8812 and Forms 7206/8962. Their presence is not a
  final 2026 map or source-rule qualification.
- [Form 172](https://www.irs.gov/pub/irs-pdf/f172.pdf) is revision December 2024;
  [Form 982](https://www.irs.gov/pub/irs-pdf/f982.pdf) is revision March 2018.
  Revisioned forms are not automatically obsolete for 2026. Applicable instructions,
  actual line layout and scenario qualification must be checked separately.

## PA/OH annual-return candidates

The [PA personal-income-tax page](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax)
links the [2025 PA-40](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40.pdf).
The available [2026 PA-40 ES](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2026/2026_pa-40es.pdf)
is an estimated-payment voucher, not a final annual PA-40.

The [Ohio official forms index](https://tax.ohio.gov/home/forms/tax-forms)
was visible through the search index but failed direct browser retrieval.
It lists 2025 IT 1040/SD 100 and 2026 estimated vouchers. The official
[2025 IT 1040 booklet](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf)
was successfully retrieved and hashed. Bounded official searches did not locate
final 2026 annual PA-40, OH IT 1040 or SD 100. This does not establish exhaustive absence.
No state selection, demand evidence or qualification is inferred.

## Prospective Schedule 3-A dependency

[IR-2026-93](https://www.irs.gov/newsroom/treasury-irs-proposes-rules-to-protect-refundable-tax-credits-from-abuse-by-illegal-aliens)
announces a proposal, not an effective calculation change.
[REG-119882-25, 91 FR 53812](https://www.govinfo.gov/content/pkg/FR-2026-08-20/html/2026-16985.htm)
relies on PRWORA 8 USC 1611/1614/1641 and 26 USC 7805. Its proposed applicability is tax
years ending on/after final-rule publication. The
[October 9 hearing cancellation](https://www.govinfo.gov/content/pkg/FR-2026-10-09/html/2026-20790.htm)
does not finalize it. No final applicability was established in this refresh.

The proposed restriction concerns the aggregate refunded portion of EIC, ACTC,
refundable AOTC and refundable adoption; it does not erase withholding or every
underlying credit. Published example 8 gives 2272−1451=821, while withholding 250
remains separately refundable. A future effective implementation would need
actual first-claim filing-date eligibility (citizen/national/qualified alien,
including the joint rule), supported source attestations and the aggregate
calculation. Tax residency and employment-valid SSNs are not substitutes.

The [draft 1040](https://www.irs.gov/pub/irs-dft/f1040--dft.pdf) and
[draft Schedule 3-A](https://www.irs.gov/pub/irs-dft/f1040s3a--dft.pdf) remain marked
do-not-file. The latter adds actual benefit-request/eligibility answers and a
payment adjustment; its line 5 uses 1040 line 24a less Schedule 2 line 20. Current code
has no corresponding claimant source contract or aggregate adjustment. Record
this precise prospective gap and recheck final authority/instructions/forms;
do not activate it or guess immigration facts from draft availability.

## Provider prices and public availability

The refresh agrees with [the existing provider ledger](upgrade-2026-provider-refresh.md).
Standard text USD per million input/output/cached-input tokens remains:

| Model | Rates | Public status/condition |
|---|---|---|
| GPT-6 Luna |0.10/0.50/0.01|Documented model; configured High supported.|
| GPT-6.1 Sol |2/10/0.10|Documented model; configured Low/High supported, not minimal/none.|
| GPT-5 Mini baseline |0.25/2/0.025|Alias and snapshot retire December 11, 2026; January cost is historical-only.|
| GPT-5.2 historical cost |1.75/14/0.175|No new route selected.|
| Gemini 3.8 Flash through 2026-12-31 |0.75/3.75/0.075|Stable; High supported, minimal rejected.|
| Gemini 3.8 Flash from 2027-01-01 |1.50/7.50/0.15|January price switch retained.|
| Gemini 3 Flash Preview baseline |0.50/3/0.05|Still preview; no announced shutdown located.|

[OpenAI pricing](https://developers.openai.com/api/docs/pricing) retains Luna/Sol
cache-write rates 0.125/0.25 and 2.50/5 for 30m/12h, input/cache 2x and output 1.5x
above 272,000 input tokens, and eligible regional 1.10 multiplier.
[Google pricing](https://ai.google.dev/gemini-api/docs/pricing) retains 3.8 cache
storage 0.50 then 1 per million token-hours; 3 Preview storage 1.

Model/effort sources: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Mini](https://developers.openai.com/api/docs/models/gpt-5-mini),
[5.2](https://developers.openai.com/api/docs/models/gpt-5.2),
[3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash),
[3 Flash Preview](https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview),
[Google thinking](https://ai.google.dev/gemini-api/docs/thinking).
Lifecycle sources: [OpenAI](https://developers.openai.com/api/docs/deprecations)
and [Google](https://ai.google.dev/gemini-api/docs/deprecations).

No authenticated capability probe, paid call, human-reviewed evaluation, account
privacy setting or rollout evidence was created. Existing account availability,
approved budget, exact billing, qualification and promotion gates remain closed.
