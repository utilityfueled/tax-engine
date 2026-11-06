# Prospective classification test

The corrected classification contract was tested in a new live development run,
separate from the earlier smoke and its unchanged failures. Luna High, Sol Low
and GPT-5 Mini each completed one capability probe and three repeats of the
synthetic corrected-W2 case. All nine case responses passed the current actual
application schema and returned the expected canonical `w2c` ID. This descriptive
classification does not establish a tax year or calculation support.

The run completed 12 requests in 35.345 seconds, below its $1 and 12-request caps.
Independent Python Decimal calculation reproduces the exact text-token cost:

| Profile | Provider USD, including capability probe |
| --- | ---: |
| Luna High | 0.0008657 |
| Sol Low | 0.013504 |
| GPT-5 Mini baseline | 0.00181615 |
| Total | 0.01618585 |

Current cumulative calculated cost is $0.16451210. The earlier unresolved
request's $0.022384 maximum remains reserved, making known usage plus reserve
$0.18689610. It was not retried, assumed free or reconciled without provider
evidence. These are calculated token costs, not provider invoice settlement or
application retail-credit charges. No secret was persisted by this run.

Before execution, 27 distinct offline controls reviewed the exact plan and
executor. The separate saved-measurement review validates all 25 journal-chain
rows and 12 usage pairs, current schema/grounding/privacy validation, model
identities, unchanged 57 evaluation source pins and exact pricing arithmetic.
The plan digest is
`925ac6628dc57c4e1ce9c7d06de88597610a89e139540b1763673817f55c1234`.
Source-review manifest:
`bb537f23d9fc4249e959dc19b8628beda37edb81704ec35b40b81e447daea25f`.
Actual-result review manifest:
`de18007d1b7596f3d72a0984dc090acd9cb5763d3147f6e0f2c17e169e2cb76b`.
Root reads both full reports and verifies their 17 members plus the six
prospective source members. Private artifacts retain the original responses,
usage and independent verification scripts.

Official [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Mini documentation](https://developers.openai.com/api/docs/models/gpt-5-mini)
and [pricing](https://developers.openai.com/api/docs/pricing) were refreshed on
November 5, 2026. The accepted Mini response identifies its documented snapshot;
the documentation marks Mini deprecated. No substitute was silently selected.

Baseline Mini repeat 2 suggests supplying a full image or transcript without a
redaction qualifier. That wording needs review before a real-document workflow
or promotion. The actual test sent synthetic text only, with no image upload.
This one development case supplies no representative-corpus, held-out, qualified
human, broad privacy, account-retention, exact billing-ledger or rollout evidence.
No route was promoted; all existing readiness gates remain closed.
