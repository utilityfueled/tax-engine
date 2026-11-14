# Official provider refresh, November 14, 2026

Seven unauthenticated official documentation requests returned HTTP 200 at 18:22:39–18:22:41 UTC. All 28 finite source assertions passed. The named candidates' standard prices and required effort/structured-output capabilities remain consistent with the [November 6 refresh](upgrade-2026-provider-refresh-20261106.md). No credential was loaded, generation requested, pricing/routing code changed or model promoted by this refresh.

| Explicit candidate or baseline | Published standard USD per million input / output tokens |
| --- | --- |
| GPT-6 Luna High | `0.10 / 0.50` |
| GPT-6.1 Sol Low / High | `2.00 / 10.00` |
| GPT-5 Mini baseline (published Deprecated) | `0.25 / 2.00` |
| Gemini 3.8 Flash High, through December 31, 2026 | `0.75 / 3.75` |
| Gemini 3.8 Flash High, from January 1, 2027 | `1.50 / 7.50` |
| Gemini 3 Flash Preview baseline | `0.50 / 3.00` for text input |

The [official OpenAI pricing table](https://developers.openai.com/api/docs/pricing) retains Luna cached input/30-minute write/12-hour write at `0.01 / 0.125 / 0.25`, and Sol at `0.10 / 2.50 / 5.00`. Their model pages retain the full-request surcharge above 272K input tokens: input/cache rates double and output rates multiply by 1.5. Regional/FedRAMP pricing must retain its separate conditions; no new tier or residency route is selected. The [Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) supports High reasoning and structured output through Responses; the [Sol page](https://developers.openai.com/api/docs/models/gpt-6.1-sol) supports the requested Low/High settings. The [GPT-5 Mini page](https://developers.openai.com/api/docs/models/gpt-5-mini) marks both the model and snapshot `gpt-5-mini-2025-08-07` **Deprecated**. The account catalog receipt below still lists those identifiers; this published lifecycle status does not establish that account requests are disabled, and this refresh changes no routing.

Google's [current pricing page](https://aistudio.google.com/docs/pricing#gemini-3.8-flash) includes thinking tokens in output billing. Standard Gemini 3.8 cached input/storage remain `0.075 / 0.50` through December 31 and`0.15 / 1.00` from January 1, per million tokens/million token-hours. Its [model document](https://aistudio.google.com/docs/models/gemini-3.8-flash) lists High thinking and structured output; Minimal is rejected. The [baseline model document](https://aistudio.google.com/docs/models/gemini-3-flash-preview) remains explicitly Preview. The former `ai.google.dev/gemini-api/docs/pricing` and baseline-model URLs redirect to official `aistudio.google.com` pages; those successful redirects are retained as observations, not account-access evidence. Advertised image/PDF/tool capabilities do not authorize those inputs in this application.

## Availability and qualification boundaries

The separate same-day `.local/upgrade-evidence/nov14-openai-availability/receipt.json` records an actual authorized account catalog GET at 05:04:45 UTC: 96 models and the exact Luna, Sol and GPT-5 Mini identifiers listed. That is model metadata visibility, not proof that every task/profile can generate successfully. This refresh reuses that receipt and makes no authenticated catalog request.

The [actual local credit-ledger rehearsal](upgrade-2026-ai-local-ledger-20261114.md) separately records two genuine Luna High Responses successes, exact usage costs and actual atomic PostgreSQL settlement. Its deliberately rejected second result is an engineering rejection rather than an independently labeled quality failure. No new generation, effort-compatibility result or quality score is inferred for Sol or either Google profile here. Public Google pages establish published offerings; authorized Google project access and actual evaluation remain separate unresolved evidence requirements.

Known provider usage remains `$0.26329920`; the historical unresolved timeout reserve remains `$0.022384`; accounted exposure remains `$0.28568320`. These are the existing ledger amounts, not a new invoice or project-balance reconciliation. The refresh neither releases the reserve nor spends against the user's `$140` testing cap. Independent human labels, held-out repeated evaluation, final tax review and model-promotion authorization remain required.

## Source custody

Private evidence is `.local/upgrade-evidence/nov14-public-provider-refresh/`: `receipt.json` retains requested/final URLs, UTC times, statuses, content types, sizes and raw response digests; `checks.json` records 28 passing assertions. OpenAI Docs search/fetch results were cross-checked with the direct official responses. No secret, private provider output, authentication cookie or connection URL appears in this document.

| Official raw response | SHA-256 |
| --- | --- |
| OpenAI pricing | `a1d8bbfbb336a18083d576e6df763a31648c08043f5d43b3e0e8dd3704c9a8be` |
| Luna | `44dcc0a50961150ee700aa701df8d46c59488f003979f3c755c3230bd8a0dfb2` |
| Sol | `02dff9ef937bbc97fb24ba7c936269a549563cfb8a49b91a6ba1c1575d2b77c0` |
| GPT-5 Mini | `7b07ef496f0bc6ab1925825b8ba344591575008f0c676d87cd34a51415805e54` |
| Google pricing | `2185b4ebe9b296fe5d6827fba6b9879ddef5c80ca7e41e7cedfe54d3e340085b` |
| Gemini 3.8 Flash | `c61d2a686d486598f31f6746a4fbacf71b8293295d54ec0cd004a15b898f0099` |
| Gemini 3 Flash Preview | `bb99a4a27c9bb1e0ee0bb37c6277c0fc4f016c9bf1370b793413eb5e77036336` |
