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
Known paid calls remain179 and reported usage remains$0.27185270. The unresolved
$0.022384 reserve remains; accounted exposure is$0.29423670. Independent human
labels, held-out evaluation and Google project access remain open.

The separate [official source refresh](upgrade-2026-source-refresh-20261117.md)
records current public documentation; it does not establish account access.
