# Tax Workflow Model Stack Eval

Date: March 12, 2026
Status: Deterministic harness complete; live API worksheet still pending provider credentials

This is the first pass on the backlog item to benchmark the chatbot model stack for the tax workspace.
It now does six things:

- commits deterministic, provider-safe fixtures for workspace summary, interview assist, unsupported routing, and explanation/export tasks
- writes the same provider-safe prompt pack to [prompts/provider-model-eval/fixture-pack.json](../../prompts/provider-model-eval/fixture-pack.json) for later live API runs
- writes a provider-safe benchmark snapshot to [prompts/provider-model-eval/benchmark.json](../../prompts/provider-model-eval/benchmark.json) so the recommendation is available as structured data
- commits a blank live-run worksheet at [prompts/provider-model-eval/live-run-template.json](../../prompts/provider-model-eval/live-run-template.json) so future API benchmarks use the same scoring shape
- prices the current fixture pack against official OpenAI API pricing
- records a default primary, fallback, and low-cost tier for the current product scope

The live API portion is intentionally deferred until a later iteration with provider credentials. The current harness is still useful because it locks the tax-specific prompt mix and the pricing-based recommendation behind tests, and the committed pricing snapshot was re-validated against the official OpenAI pricing and model docs on March 12, 2026.

## Fixture pack

- `workspace-summary-supported`: `workspace-summary` | input≈938 tokens | output≈180 tokens
- `interview-assist-withholding`: `interview-assist` | input≈512 tokens | output≈140 tokens
- `unsupported-route-side-gig`: `unsupported-route` | input≈1592 tokens | output≈220 tokens
- `explanation-draft-ready-preview`: `explanation-draft` | input≈511 tokens | output≈170 tokens

## Candidate set

Pricing was pulled on March 12, 2026 from the official OpenAI API pricing page and is pinned in [packages/engine/src/provider-model-eval.ts](../../packages/engine/src/provider-model-eval.ts):

- `gpt-5.2`: input `$1.75` / cached input `$0.175` / output `$14.00` per 1M tokens
- `gpt-5.1`: input `$1.25` / cached input `$0.125` / output `$10.00` per 1M tokens
- `gpt-5-mini`: input `$0.25` / cached input `$0.025` / output `$2.00` per 1M tokens
- `gpt-5-nano`: input `$0.05` / cached input `$0.005` / output `$0.40` per 1M tokens

Estimated benchmark spend for the committed fixture pack:

- `gpt-5.2`: cold pack≈`$0.016158` / cached rerun≈`$0.010562`
- `gpt-5.1`: cold pack≈`$0.011541` / cached rerun≈`$0.007544`
- `gpt-5-mini`: cold pack≈`$0.002308` / cached rerun≈`$0.001509`
- `gpt-5-nano`: cold pack≈`$0.000462` / cached rerun≈`$0.000302`

Source:
- https://platform.openai.com/docs/pricing

Model-role fit is an inference from the official model guide plus the current workspace task mix:

- `gpt-5.2`: Best premium fallback for nuanced unsupported-case reasoning or explanation quality regressions when the current flagship model is justified.
- `gpt-5.1`: Current recommended GPT-5 sibling for lower-cost premium comparison if live evals show GPT-5.2 quality is not worth the extra spend for fallback traffic.
- `gpt-5-mini`: Best default for structured tax workspace summaries and interview assistance when the prompt stays inside the redaction boundary.
- `gpt-5-nano`: Cheapest viable tier for high-volume classification or extraction checks, not the default explanation model.

Source:
- https://platform.openai.com/docs/models
- https://platform.openai.com/docs/models/gpt-5.2
- https://platform.openai.com/docs/models/gpt-5.1
- https://platform.openai.com/docs/models/gpt-5-mini
- https://platform.openai.com/docs/models/gpt-5-nano

Deterministic scorecard dimensions for the current fixture pack:

- `gpt-5.2`: workspace `10` / interview `10` / unsupported `10` / explanation `10` / structured output `10` / latency `3` / price `2`
- `gpt-5.1`: workspace `9` / interview `8` / unsupported `9` / explanation `9` / structured output `8` / latency `5` / price `3`
- `gpt-5-mini`: workspace `8` / interview `9` / unsupported `7` / explanation `8` / structured output `9` / latency `8` / price `9`
- `gpt-5-nano`: workspace `5` / interview `6` / unsupported `4` / explanation `5` / structured output `7` / latency `10` / price `10`

Role-weighted scorecards:

- `gpt-5.2`: task-fit primary `10.000` / fallback `10.000` / low-cost `10.000`; overall primary `6.600` / fallback `8.050` / low-cost `4.250`
- `gpt-5.1`: task-fit primary `8.650` / fallback `8.900` / low-cost `8.650`; overall primary `6.442` / fallback `7.435` / low-cost `4.848`
- `gpt-5-mini`: task-fit primary `8.250` / fallback `7.650` / low-cost `8.200`; overall primary `8.463` / fallback `8.073` / low-cost `8.630`
- `gpt-5-nano`: task-fit primary `5.250` / fallback `4.650` / low-cost `5.200`; overall primary `7.563` / fallback `6.223` / low-cost `8.980`

Role weighting rubric:

- `primary`: task weights workspace-summary=0.35 / interview-assist=0.35 / unsupported-route=0.1 / explanation-draft=0.2; metric weights taskFit=0.45 / structuredOutput=0.1 / latency=0.2 / price=0.25
- `fallback`: task weights workspace-summary=0.1 / interview-assist=0.1 / unsupported-route=0.45 / explanation-draft=0.35; metric weights taskFit=0.65 / structuredOutput=0.1 / latency=0.05 / price=0.2
- `lowCost`: task weights workspace-summary=0.35 / interview-assist=0.35 / unsupported-route=0.15 / explanation-draft=0.15; metric weights taskFit=0.15 / structuredOutput=0.1 / latency=0.25 / price=0.5

## Current recommendation

- Primary: `gpt-5-mini`
- Fallback: `gpt-5.2`
- Low-cost classifier/extraction tier: `gpt-5-nano`

This recommendation is an inference from three inputs:

- the committed tax-workflow fixture pack in [packages/engine/src/provider-model-eval.ts](../../packages/engine/src/provider-model-eval.ts)
- current official pricing on March 12, 2026
- deterministic scoring weights that favor supported workspace summary plus interview assistance for the default path, unsupported reasoning plus explanation quality for fallback selection, and cost plus latency for the low-cost tier

Role rationales:
- Primary: gpt-5-mini offers the best price-to-quality balance for structured tax workflow prompts in this fixture pack.
- Fallback: gpt-5.2 is the premium fallback when unsupported-case reasoning or explanation quality matters more than cost.
- Low-cost: gpt-5-nano is the cheapest viable tier for classifier or extraction workloads behind the same redaction boundary.

## Remaining gap

The next iteration for this track should fill the committed live-run worksheet with API results over the same fixture pack and record:

- empirical latency by task
- structured-output reliability
- unsupported-case routing quality
- explanation quality regressions
- recovery behavior when the prompt asks for unsupported help
