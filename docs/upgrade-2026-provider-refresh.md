# Provider documentation refresh — 2026-10-25

This records public documentation, not authenticated availability or a live run.
The account-capability records remain empty and production routes remain disabled.
The benchmark retains all six requested profiles and both original baselines.

## Current sources and prices

Standard text USD per million tokens; output includes charged reasoning. Existing
effective dates and all numerical rates are preserved. Retrieval dates advance to
October 25. Batch, priority, tools, audio and image rates remain outside this path.

| Model | Input / output / cached input | Other applicable prices | Source |
| --- | --- | --- | --- |
| GPT-6 Luna | 0.10 / 0.50 / 0.01 | 30m/12h writes 0.125/0.25 | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| GPT-6.1 Sol | 2 / 10 / 0.10 | 30m/12h writes 2.50/5 | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| GPT-5 Mini baseline | 0.25 / 2 / 0.025 | Retires before January; historical projection only | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| GPT-5.2 historical ledger | 1.75 / 14 / 0.175 | No candidate route added | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| Gemini 3.8 Flash through 2026-12-31 | 0.75 / 3.75 / 0.075 | Cache storage 0.50 per million token-hours | [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Gemini 3.8 Flash from 2027-01-01 | 1.50 / 7.50 / 0.15 | Cache storage 1 per million token-hours | [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Gemini 3 Flash Preview baseline | 0.50 / 3 / 0.05 | Cache storage 1 per million token-hours | [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) |

Luna/Sol input and cache rates double above 272,000 input tokens; output multiplies
by 1.5. Their eligible regional processing multiplies cost by 1.10. These existing
Decimal boundaries remain tested. Source refresh also exposed a legacy Google
guard that compared a documentation URL to identify the provider: the `.md`
preview URL bypassed rejection of unpriced regional usage. Its new red regression
reproduced acceptance; price records now carry explicit provider identity, and
both Google models reject that unsupported charge category. No rate is guessed.

## Model identity, capability and lifecycle

- [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) and
  [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) document their
  exact current IDs, Responses and structured outputs. The configured High and
  Low/High efforts are supported; Sol does not support minimal/none.
- [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini) documents
  snapshot `gpt-5-mini-2025-08-07`; the
  [August 2025 changelog](https://developers.openai.com/api/docs/changelog) documents
  minimal effort for the GPT-5 family. The
  [June 11 deprecation notice](https://developers.openai.com/api/docs/deprecations)
  retires alias and snapshot on **December 11, 2026**. No replacement is selected.
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
  is stable; [Gemini 3 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview)
  remains preview. Both document structured output and
  [High thinking](https://ai.google.dev/gemini-api/docs/thinking). The
  [current lifecycle page](https://ai.google.dev/gemini-api/docs/deprecations)
  lists no announced shutdown date for either. That is not a future guarantee.

The machine-readable public manifest is included in `benchmark.json` and the
approved request-policy digest. Every entry explicitly says account availability
is unverified. Actual credentials, project settings, paid-tier privacy terms,
structured schema acceptance, effort acceptance and reported usage require the
separate approved capability probe. No public source is converted into such a
record. Google pricing distinguishes paid and free/contributor data-use terms;
public paid-tier terms do not establish this account's tier or settings.

Published shutdown dates have no stated hour; execution conservatively stops at
00:00 UTC on that date. Planning rejects already-retired profiles. Every later
dispatch rechecks time, so crossing the date after a paid probe does not dispatch
the next case. Imported post-shutdown records cannot qualify. Historical costs
remain visible and pre-shutdown measurements remain historical evidence. January
baseline cost is explicitly labeled `historical-price-projection-retired-model`;
it does not assert a service available in January. Comparison and human approval
gates are unchanged.

## Verification and remaining evidence

All five initial lifecycle/documentation regressions failed before implementation
(`ai-provider-refresh-red.log`); the separate regional guard regression also failed
before correction (`ai-provider-region-red.log`). The current 52 focused tests in
five files pass (`ai-provider-refresh-final.log`), with exact UTC boundary, one
charged probe/no later request, historical cost preservation, explicit January
labels and unchanged Gemini rate switch. No service was contacted by these
synthetic tests.

Final immutable tree `4b2808c96814c5bcf200ed54bd41917a7603314e` passes106
tests across13 files, root/web/executor typechecks,4,584 spec references,
generated-artifact freshness, zero-error/zero-warning scoped lint and the production
webpack build (`ai-provider-4b28-{tests,types-spec,lint,build}.log`). Parent's
independent review reran18 pricing/refresh tests and separate literal probes for
UTC offsets on both sides of shutdown, nested manifest immutability, forged
lifecycle policy rejection, approved pre-shutdown plans invoked after shutdown
with zero calls/cost, both Google regional guards even with zero usage, and the
historical Mini January projection of0.000225. All pass with no remaining scoped
finding (`parent-provider-refresh-review.log`, `parent-provider-refresh-probes.log`).
The parent independently refreshed the official shutdown/lifecycle sources. This
is agent software/source review; no authenticated provider or human qualification
evidence was created.

Remaining external inputs are approved provider account access and spend cap,
independent human review of the 240 draft cases and resulting answers, actual
staging account/billing/outage/recovery evidence, and any eventual owner-approved
rollout. The full upgrade's final-head checks remain in the central checklist.
