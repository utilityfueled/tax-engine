# Provider documentation refresh, November 3

Public documentation was retrieved again during the active upgrade. These are
documented capabilities and prices, not authenticated project availability or
successful evaluation results. Actual provider spend remains zero; the secure
OpenAI project-selection flow is awaiting its owner selection. No route or model
is promoted and no identifier is silently replaced by a newer model.

The exact requested [GPT-6 Sol page](https://developers.openai.com/api/docs/models/gpt-6-sol)
still documents `gpt-6-sol`, low/high effort, structured outputs and Responses.
Its standard short-context input/cache-read/cache-write/output USD per million
rates are 2/0.20/2.50/10. Above 272,000 input tokens, the full request uses twice
the input/cache rates and 1.5 times output; regional processing adds 10%.
The current main catalog features GPT-6.1 Sol, whose cache-read price differs.
That newer model's price must not be applied to the pinned `gpt-6-sol` route.

The exact [GPT-6 Luna page](https://developers.openai.com/api/docs/models/gpt-6-luna)
documents high effort and structured outputs. Standard short-context
input/cache-read/cache-write/output rates remain 0.10/0.01/0.125/0.50, with the
documented long-context multipliers and regional premium. Actual billing must
still use the selected context, service tier and reported usage.

The [GPT-5 Mini page](https://developers.openai.com/api/docs/models/gpt-5-mini)
now marks the alias/snapshot deprecated. This is a comparator access risk,
not evidence of an attempted request or an authorized substitution.

[Gemini 3.8 Flash pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash)
still lists standard input/output (including thinking) at 0.75/3.75 through
December 31, rising to 1.50/7.50 on January 1. Cached input rises from 0.075 to
0.15 and storage from 0.50 to 1.00 USD per million tokens per hour. Free-tier
content use differs from paid-tier terms; no free-tier taxpayer processing is
qualified here. The old Gemini 3 Flash Preview detail URL could not be retrieved
with the source tool; its actual API availability remains untested.

The existing price/usage contracts and conservative gates remain unchanged.
Representative independently reviewed cases, held-out repeat runs, actual
project access and usage/cost/latency/privacy results remain required. Public
documentation alone does not satisfy any promotion criterion.
