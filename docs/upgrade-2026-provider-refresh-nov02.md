# November 2 public provider refresh

Public documentation still supports the named candidate profiles below. This
refresh made no authenticated model requests, consumed no approved evaluation
budget, and supplies no quality, latency, account-access or promotion evidence.
The user approved at most $5 total for synthetic runs; the project/account and
credentials remain pending. Actual spend established in this work is $0.00.

| Candidate | Public capability confirmed | Standard text USD per million input / output |
| --- | --- | --- |
| GPT-6 Luna High | Responses, structured output, High effort | 0.10 / 0.50 |
| GPT-6.1 Sol Low / High | Responses, structured output, both efforts | 2.00 / 10.00 |
| Gemini 3.8 Flash High | Stable, structured output, High thinking | 0.75 / 3.75 through December31; 1.50 / 7.50 from January1,2027 |

OpenAI sources: [model catalog](https://developers.openai.com/api/docs/models),
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), and
[pricing](https://developers.openai.com/api/docs/pricing).
These exact model IDs remain candidates; no newer catalog model was substituted.
Existing candidate prices agree with the refreshed standard table. Luna cached
input is0.01, 30minute write0.125 and12hour write0.25; Sol0.10,2.50,5.00.
Above272,000 input tokens, the full request uses doubled input/cache rates and
1.5times output rates. Regional processing has a10% uplift; the source now also
states a10% FedRAMP uplift effective November1. Fast/Ultrafast, tool, image and
FedRAMP account routes are not newly enabled by this refresh. Their billing must
be explicitly qualified before use; standard accounting cannot establish them.

Google sources: [model](https://aistudio.google.com/docs/models/gemini-3.8-flash),
[pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash), and
[lifecycle](https://aistudio.google.com/docs/deprecations).
The model page lists Low/Medium/High thinking and rejects Minimal. Output prices
include thinking. Cached input/storage remain0.075/0.50 through December31 and
0.15/1.00 from January1, respectively, per million tokens/token-hours. Paid and
free data-use terms differ; no free-tier privacy eligibility is inferred.

The original requested baselines remain distinct. [GPT-5 Mini retirement](https://developers.openai.com/api/docs/deprecations)
is still announced for December11,2026. Gemini3FlashPreview still has its own
[published model page](https://aistudio.google.com/docs/models/gemini-3-flash-preview)
and no announced shutdown date on the refreshed lifecycle page. Neither statement
proves that the eventual authorized account can invoke the model. January GPT-5
Mini projections remain historical price projections for a retired model.

Ignored evidence `nov02-parent-provider-refresh/` retains full official OpenAI
markdown and Google responses, retrieval timestamps, final URLs and SHA256s.
The Google lifecycle web-reader request failed; the subsequent direct official
fetch succeeded with HTTP200, and both outcomes are retained. No failure was
silently converted into provider availability. Historical October25 immutable
price/lifecycle records retain their original retrieval dates; this separate
refresh corroborates them without rewriting those historical claims.

Outstanding: actual account access, bounded approved run plans and independent
held-out human labels; repeat provider results and exact usage settlement; all
quality/privacy/latency/cost gates and reversible rollout evidence. Model
promotion remains disabled. Agent or generated labels are not human reviews.
