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
