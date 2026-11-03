# Public provider refresh at November 3, 14:25 UTC

Current public documentation corroborates the existing candidate configuration.
No authenticated provider request, evaluation spending or model promotion took
place. The approved total ceiling is $5; recorded live spending remains $0.
Project access and credentials are still missing.

| Candidate | Public capability checked | Standard text USD per million input / output |
| --- | --- | --- |
| GPT-6 Luna High | Responses, High reasoning, structured output | 0.10 / 0.50 |
| GPT-6.1 Sol Low / High | Responses, Low and High reasoning, structured output | 2.00 / 10.00 |
| Gemini 3.8 Flash High | High thinking, structured output | 0.75 / 3.75 through December 31; 1.50 / 7.50 from January 1, 2027 |

Sources: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[Gemini model](https://aistudio.google.com/docs/models/gemini-3.8-flash) and
[Google pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash).
Gemini explicitly rejects Minimal thinking. The model's advertised PDF/image
inputs do not authorize or enable taxpayer document uploads.

Luna cached input / 30-minute write / 12-hour write remain 0.01 / 0.125 / 0.25;
Sol 0.10 / 2.50 / 5.00. Above 272,000 input tokens, the model pages prescribe
double input/cache and 1.5 times output for the full request. Regional processing
has a 10% uplift; the pricing page also states a 10% FedRAMP uplift from November
1. This refresh enables no new service tier or FedRAMP route. Existing immutable
October price records retain their original retrieval dates.

Google output includes thinking tokens. Cached input / storage remain 0.075 /
0.50 through December 31 and 0.15 / 1.00 from January 1, per million tokens /
million token-hours. The Standard section controls this comparison; Batch and
other tables are distinct. Paid/free data-use terms are not interchangeable.

The [GPT-5 Mini page](https://developers.openai.com/api/docs/models/gpt-5-mini)
responds successfully. The web reader could not retrieve
[Gemini 3 Flash Preview](https://aistudio.google.com/docs/models/gemini-3-flash-preview);
a separate direct request then returned HTTP 200 with the actual model document
in its noscript content. Both outcomes are retained. A documentation fetch
failure is not evidence of model shutdown, and a successful document response is
not proof of authenticated account availability. No lifecycle claim was newly
verified in this refresh.

Raw official responses, final URLs, UTC timestamps and SHA256s are retained in
`.local/upgrade-evidence/nov03-afternoon-public-refresh/receipt.json`; extracted
Google documents have a separate `google-extraction-receipt.json`. OpenAI pricing
response SHA256:
`842ac0dce2324251d274026d197a81473e72ff40eef1194bdd4e6b32833d8f55`.
Google pricing response SHA256:
`5c5a6f7e435d341667982e8056d8c44ec8d719bacfaac7117c0ba2906105258e`.

- [x] Refresh public candidate capabilities and standard prices.
- [ ] Verify the authorized project's actual model access and usage accounting.
- [ ] Obtain independent human labels, preserve the held-out subset and run the
  approved bounded repeat evaluation against available baselines.
- [ ] Pass exactness, privacy, quality, latency and full-cost gates, including
  January pricing and failures/escalation, before any promotion.

The deterministic fallback, opt-out, privacy controls and disabled promotion
remain in force. Agent-generated review does not satisfy human evaluation.
