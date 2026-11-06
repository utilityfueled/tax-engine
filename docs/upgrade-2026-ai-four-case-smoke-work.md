# Four-case OpenAI development smoke — November 5

Run `nov05-four-case-development-smoke` completed 39 requests: three capability
probes and four synthetic development cases, three repeats for each of three
profiles. The cases cover W-2 zero withholding, Social Security net benefits,
a linked expense refund and an own-account transfer. No held-out case was used.

The tracked checkout baseline was `a0c98b12000a2fc185fe77e572496abe22842e08`;
other browser changes were uncommitted. Execution was bound to 60 exact evaluation
source-file hashes, verified unchanged before and after the run, and the frozen
V2 wrapper manifest below. This is not a clean-worktree claim. The unchanged plan
digest is `aa30641c496aa3d2ff58ac75649ff8067da38a55d17b27bd5e108e2d957b94da`.
The preserved V1 attempt failed approval timestamp validation before dispatch;
its journal is empty and it contributes no recorded provider request.

All 36 case outputs pass the current application schema. Separate source-binding,
strict canonical-literal and actual scorer results are:

| Profile | Schema | Source-bound | Strict literals | `criticalCorrect` | Known USD, including probe |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna High (`gpt-6-luna`, high) | 12/12 | 12/12 | 12/12 | 12/12 | 0.00418260 |
| Sol Low (`gpt-6.1-sol`, low) | 12/12 | 12/12 | 12/12 | 12/12 | 0.05379200 |
| GPT-5 Mini (minimal) | 12/12 | 2/12 | 5/12 | 0/12 | 0.01168725 |

The baseline swaps SSA repayment and withholding in all three repeats: it proposes
repayment 300 and withholding 2,000, while the synthetic source has box 4 repayment
2,000 and box 6 withholding 300. Two of these wrong answers still pass source
binding because the wrong field's value appears in another cited box. Source
binding therefore does not establish correct field assignment. Noncanonical
numeric strings and nonliteral descriptions remain failures; no output or expected
value was repaired to improve these results. Proposals remain unconfirmed facts.

Exact Decimal usage cost for this run is **0.06966185 USD**, with no new unknown
usage. Cumulative known usage cost is **0.24230265 USD**; retaining the earlier
**0.022384 USD** unknown-usage reserve gives **0.26468665 USD**. The old reserve
remains unsettled. These are source-price token calculations, not provider invoice
settlement. The completed run stayed within its 39-request/1 USD cap; that cap did
not guarantee all planned requests would complete for arbitrary responses.

Saved-artifact engineering review verified all 79 journal records, every dispatch
and result, the hash chain, reported model/usage identities, exact per-attempt
costs and the unchanged application parser/scorer. The reviewer authored the
preflight wrapper and did not execute the live run. All 36 entries remain
unaccepted for qualification because independent human reviews are absent.

The small development sample establishes neither representative quality nor
production latency, real-PII privacy, provider retention settings or future model
availability. No human tax/corpus qualification, model recommendation, promotion,
filing readiness or production deployment follows. Existing release gates remain
closed; failures and the original V1 evidence remain preserved.

Private evidence under `.local/upgrade-evidence`:
`nov05-openai-four-case-smoke-actual-v2` (8-member manifest
`5a3690052df2b7bf98e53324f06070f600aa5822fbe3142363908576b2468e8d`) and
`nov05-openai-four-case-smoke-actual-independent` (12-member manifest
`8dcdac164435a72741ebde271f69c49746723e0ac23f830514392e8c4985e7cf`, review
`8cc0215db6cc29235bcf8f2c3eb9ee9f726dc6962c358d87d0da6157862ece68`).
Frozen V2 execution-source manifest:
`5c358844bd5715c9e2f81d28e015b3e47addb8659d693082ba220e8657c4de75`.
