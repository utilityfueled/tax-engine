# PA 2026 care-credit conformity method

This package corrects the ordinary current-year 2026 Schedule DC computation
using actual current Form 2441 sources and Pennsylvania's frozen 2022 section 21
percentage. Historical 2024/2025 cases remain unchanged. Ownership and original
source research are recorded in `.local/upgrade-evidence/nov02-pa-dc-conformity`.

The spec and linked tests preceded product. `red.log` retains ten financial/source
failures and eleven passes (including the nine untouched historical tests).
`green-attempt1.log` passes the initial21. A later source validation review added
an invalid runtime filing-status negative before correction; its genuine1fail/
21pass is retained in `runtime-filing-red.log`. The final helper accepts only
actual supported ordinary federal filing statuses, then uses a fresh current-year
Form2441 replay to reconcile actual federal9a before applying frozen2022 rates.

Final `pnpm test` affected cohort passes462tests/10files, covering the PA helper,
resident/nonresident orchestrators, historical PA mapping/reference paths and
five actual federal Form2441 cohorts. All three typechecks pass; spec6525/6525
and strict references555 pass. Scoped lint has0errors/25test warnings; no rule
or threshold was changed. `affected-attempt1.log` requested a nonexistent federal
path and therefore executed only the five actual PA files (334tests); the later
corrected five-file federal127tests and final actual ten-file462test cohort are
recorded separately. No claim is made that a nonexistent path executed.

Independent source/rate originals were pinned before candidate outputs by a
separate agent at `nov02-pa-dc-independent-review/pre-output-source-oracles.json`
SHA a839ab98e953476d2834a98bd817811b286fa4710163b431832390087c097c50.
Author originals/source contract and both red runs remain durable. Frozen author
source passed independent implementation/source review: 32/32 controls, with
pre-output originals unchanged; receipt SHA
`de06ca38922606021fd87eb08a70a86cb53945032a8938e548119825417868f4`.
No agent review is substituted for required qualified human review.

The first finite method requires known zero section 129 benefits and prior-year
expenses, actual separate earned income, actual resident eligibility, current-year
paid/incurred eligible care not claimed by another taxpayer, and a supplied
nonbinding federal liability worksheet. Positive benefits, special earned-income
rules, MFS exceptions, liability-limited and residency allocation scenarios need
separate source methods. These are internal scenario work, not external approvals.

Canonical orchestration, guide origination and exact original-bound review are
required successors alongside PA full-year/part-year/nonresident facts. This
isolated helper does not qualify those routes or activate a final 2026 form.

Sources: Fiscal Code §§1602-W, 1603-W(c), 1604-W, 1605-W; current DOR OBBBA
conformity table; official 2022 Form 2441 lines 3–9a and its instructions, retrieved
November 2, 2026. The source contract lists their exact URLs and limits.

The historical PA mapping regression checks use the then-cached historical asset;
a separate parent package is correcting its actual2025 physical revision/header.
Those regression passes do not qualify an actual2025 or final2026 physical form.
The helper's2026 source packet is not yet originated by canonical PA orchestration
or the guide. Those integrations, whole-PA payment/source replay and all3 owner
residency work are required internal successors; missing final forms and human
review are separate evidence gates. No external approval is claimed to block
this deterministic source-method integration.

Parent integration on November 2 passed all nine checks recorded in
`.local/upgrade-evidence/nov02-parent-pa-dc-main-v2/checks.json`: actual affected
439 tests across 11 files, root/contracts/web types, spec 6561/6561, inventory
617, scoped lint and build. The first parent run retained a genuine failure
where an old 2026 zero-credit fixture lacked actual care sources. Its existing
zero assertion and all surrounding assertions remain unchanged; the fixture now
provides explicit fictional zero-care/earnings/benefits/prior-credit/liability
originals. Independent fixture-only review SHA
`bf8f4426f67abd416e805a7042cee3cad9276be26caee0edca57fbbab1add02a`
confirms unchanged assertions and no production guard relaxation. A previously
requested nonexistent federal path is not counted as executed; the corrected
parent command names the four actual Form 2441 files. Parent logs and hashes
retain both attempts. This commit covers the finite helper and fixture only;
the canonical state/guide and additional care methods remain internal work.
