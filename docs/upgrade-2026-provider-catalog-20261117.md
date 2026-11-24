# November 17 account-visible AI model refresh

One authenticated OpenAI model-catalog GET at 08:09 UTC returned HTTP200 and
reported96models, including `gpt-6-luna`, `gpt-6.1-sol`, `gpt-5-mini` and
`gpt-5-mini-2025-08-07`. Count and these four listings match November15; the
response hash differs. Raw catalog bytes were not retained, so neither a full
catalog equality claim nor independent reparsing of the response is possible.
The independent review verifies the saved source and reported receipt.

The request reused the already authorized memory-only key loader. It made no
generation request, key creation, credential persistence, retry, redirect or
model promotion. The response read is capped at2,000,000bytes;20seconds is the
socket timeout, not a proven total wall-clock deadline. Account catalog presence
establishes visible metadata; generation access, effort compatibility and
qualification require separate evidence.

Private packet: `nov17-openai-account-catalog`. Receipt SHA256
`dc75255df7f2320bfdda390d98ea9b5159ce35b237414d1d4e0c7e44391ad26a`; root review
`af289f6dbed6f7ce5253cf3e36ba7537186e3069aeb1bf9236c88d28baf912ce`;
independent review `62a5024617c07fc5c6cf5801c75af66b6cdad596e7e23596fad2e0a795e787d4`.
The November15 catalog ledger preceded two later purchased-credit provider
attempts. Including their$0.0004776 reported cost, known paid calls are181 and
known usage is$0.27233030. The unresolved$0.022384 reserve remains; conservative
exposure is$0.29471430. Independent human
labels, held-out evaluation and Google project access remain open.

The separate [official source refresh](upgrade-2026-source-refresh-20261117.md)
records current public documentation; it does not establish account access.

Accounting correction: the first catalog summary reused the earlier179-call
ledger as current. The later [actual purchased-credit receipt](upgrade-2026-cloud-purchased-credit-20261115.md)
was already recorded separately. Root recomputed both known costs with Decimal;
no new paid calls, invoice reconciliation or reserve release occurred. The old
root review is retained and superseded for cumulative accounting by private
`nov17-openai-account-catalog/ACCOUNTING-CORRECTION.json`.

The superseding independent accounting review also passes:
`dec1090f91df45d7411c52943dc5bb27e63da9179bc1a28c504b41eec845a31c`.
It binds the later actual receipt and normal controller closure and independently
recomputes the two costs and conservative exposure with Decimal.

## November 19 public documentation recheck

The published selected-model prices and retirement dates match the November 17 source refresh. Gemini 3.8 Flash standard text stays at $0.75 input, $3.75 output and $0.075 cache read per million tokens through December 31. On January 1, 2027 those prices become $1.50, $7.50 and $0.15, and cache storage becomes $1 per million token-hours. The published Gemini lifecycle lists no shutdown date for the two selected IDs. [Google pricing](https://aistudio.google.com/docs/pricing) · [Google model lifecycle](https://aistudio.google.com/docs/deprecations)

OpenAI still lists December 11, 2026 as the retirement date for the GPT-5 Mini alias and snapshot, with GPT-6.1 Terra listed as its replacement. The original comparison baseline is retained. The November 19 observation used public documentation. The November 17 account metadata, actual provider receipts and outstanding review gates retain their original scope. [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [OpenAI model lifecycle](https://developers.openai.com/api/docs/deprecations)

At `25bbd2e3`, the offline benchmark is in sync and all 33 application, corpus, runner and journal tests passed. Those checks exercise the evaluation tooling without provider calls. Independent human review of expected results and held-out cases is still required for qualification.

## November 20 public documentation recheck

OpenAI's standard Luna, Sol and GPT-5 Mini prices remain unchanged.
The GPT-5 Mini alias and dated snapshot still show December 11, 2026
as the shutdown date, with GPT-6.1 Terra listed as the replacement.
[OpenAI prices](https://developers.openai.com/api/docs/pricing) ·
[OpenAI deprecations](https://developers.openai.com/api/docs/deprecations).

Google's AI Studio pricing and release guide confirm Gemini 3.8 Flash
standard input and output at $0.75 and $3.75 per million tokens through
December 31, 2026 and $1.50 and $7.50 starting January 1, 2027. The
direct AI Studio pricing page also confirms cache reads at $0.075 and
$0.15 across that boundary. The separately retrieved Developer API
pricing view omitted the standalone model heading. The model page
still lists the stable release. This recheck used public sources.
[Google AI Studio pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash) ·
[Google release guide](https://aistudio.google.com/docs/whats-new-gemini-3.8#pricing) ·
[Google model page](https://aistudio.google.com/docs/models/gemini-3.8-flash).

## November 21 public documentation recheck

The supported response modes, reasoning options, standard prices and
published transition dates still match the tracked Luna, Sol, GPT-5 Mini
and Gemini routes. The public recheck made zero generation requests.
The draft 240-case corpus still awaits independent human label and source
review with the fixed 80 held-out cases. Selected Google project access
and repeated provider measurements remain open.
[OpenAI lifecycle](https://developers.openai.com/api/docs/deprecations) ·
[Google pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash).

## November 24 exact model and pricing recheck

The candidate registry, hosted billing and evaluation bind Sol Low and
Sol High to `gpt-6.1-sol`. The public Standard table lists cached input
at $0.10 per million for short context and $0.20 for long context. The
model page gives the same five percent cache-read multiplier. The
distinct `gpt-6-sol` model has $0.20 and $0.40 cache-read rates. The
repository rejects that ID for the configured Sol profiles, so the
distinct listing changes no rate or historical receipt. The published
standard `gpt-6-luna` rates remain $0.10 input, $0.01 cache read and
$0.50 output per million tokens. OpenAI still lists December 11, 2026
for the `gpt-5-mini` alias and dated snapshot shutdown.
[OpenAI Standard prices](https://developers.openai.com/api/docs/pricing) ·
[GPT-6.1 Sol details](https://developers.openai.com/api/docs/models/gpt-6.1-sol) ·
[GPT-6 Sol details](https://developers.openai.com/api/docs/models/gpt-6-sol) ·
[OpenAI lifecycle](https://developers.openai.com/api/docs/deprecations).

Google's published `gemini-3.8-flash` Standard text rates per million
remain $0.75 input, $0.075 cache read and $3.75 output through December
31, 2026, then $1.50, $0.15 and $7.50 starting January 1, 2027.
This recheck used only public documentation. Project access, live
comparisons and independent held-out review remain open.
[Google AI Studio prices](https://aistudio.google.com/docs/pricing#gemini-3.8-flash).

Independent engineering review checked the exact model binding against
the shared rate table and found the published configured rates unchanged.
On the exact current application archive, 37 focused registry, settlement
and evaluation tests passed with 20 conditional skips.
