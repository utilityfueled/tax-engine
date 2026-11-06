# November 6 public provider refresh

Seven direct official requests at 05:41 UTC returned HTTP 200. The saved raw
responses, final URLs, UTC retrieval times and SHA256s are retained in
`.local/upgrade-evidence/nov06-root-public-provider-refresh/receipt.json`.
All 16 finite source checks pass. This refresh made no authenticated provider
request, evaluation call, credential change or model promotion.
The 11-member frozen manifest SHA256 is
`dfc485d032ba1ee4c91639ae2df9b355e9008ede17894d6d5d6773d40d2630ea`.

| Candidate | Public capability | Standard USD per million input / output |
| --- | --- | --- |
| GPT-6 Luna High | High effort, Responses, structured output | 0.10 / 0.50 |
| GPT-6.1 Sol Low / High | Low and High effort, Responses, structured output | 2.00 / 10.00 |
| Gemini 3.8 Flash High | High thinking, structured output; Minimal rejected | 0.75 / 3.75 through December 31, then 1.50 / 7.50 from January 1, 2027 |

Sources: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[Gemini model](https://aistudio.google.com/docs/models/gemini-3.8-flash) and
[Google pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash).
The web reader could not parse Google's Markdown response; the separate direct
request successfully retrieved it. No model unavailability follows from that
reader error. The Gemini 3 Flash Preview model document also returned HTTP 200;
documentation availability does not establish authenticated project access.

OpenAI cached input / 30-minute write / 12-hour write remain Luna
0.01 / 0.125 / 0.25 and Sol 0.10 / 2.50 / 5.00. Both model pages retain the
above-272K full-request input/cache multiplier of two and output multiplier of
1.5. The pricing page retains regional and FedRAMP uplifts of 10%. No new tier,
region or FedRAMP route is enabled.

Google output includes thinking tokens. Standard cached input / storage remain
0.075 / 0.50 through December 31 and 0.15 / 1.00 from January 1, per million
tokens / million token-hours. These observations do not authorize tools or raw
document uploads advertised by the provider.

This refresh changes no live cost receipt. Previously reported provider usage
remains USD 0.26282160, with the unresolved USD 0.022384 timeout reserve held
separately, for USD 0.28520560 reported-plus-reserved exposure. No further paid
run occurred here. Independent human case review, held-out repeated evaluation,
exact accounting and all promotion gates remain required. Historical refreshes
retain their original retrieval times, spending limits and availability results.
