# Signed-credit provider settlement, November 17

The supplemental provider phase passed against the isolated signed Stripe
Sandbox grant. It uses application source
`c0760d2b1421ed22ff62dc4e4e72caba484b8a69`; subsequent main changes are test,
diagnostic and documentation work, not a whole-runtime equivalence claim.
The prior official same-event replay remains recorded separately (`85e48353`).

Two real provider calls returned known usage: one accepted result and one
deliberate parsed, grounded rejection. Exact costs are $0.0002783 and
$0.0002463, totaling $0.0005246. Actual purchased-credit settlement is
1,000 cents granted, 2 cents used, 998 cents remaining. Duplicate dispatch was
denied; settlement replay left the ledger unchanged; the control account's
budget remained unchanged. The real before/after eleven-table observations
and signed Session/customer/grant bindings are retained privately.

The phase used 129 of 300 allowed queries and completed within its 200-second
bound. Database pool, import scope, observers and hooks closed/restored. The
supervisor observed exit 0, child reaped, both EOFs, absent owned process group
and no TERM. Runtime receipt SHA-256:
`daad393261260d8b8ae81f8abf9b6f43cd98127febe38d7d77682e1dc1d0f2d5`.
Supervisor receipt:
`c2d7b0e73cec2a6a3f84d2dd3c43dd64744e36e8d842fa8446a268fbf044c6a3`.
Root recomputed the exact Decimal cost sum and checked the outcome/closure
invariants. Independent saved-artifact review passed, including exact token-cost
recomputation, the two real HTTP 200 results, durable reservation/journal,
135 pins and original monetary/closure gates. Review SHA-256:
`29dbb1f4d90fd634daf32233d9a343d14263fa23bed3ca7afe4101b5a1eab80f`.
NUMERIC equality is supported by the pinned executed runtime predicates; the
independent review made no new database query.

## Preserved failures and budget

The predecessor V2 attempt held before its output directory, reservation or
provider phase because it compared the saved Session customer to a field in a
preparation record written before customer creation. V3 fixes that concrete
admission bug by checking both exact saved signed-grant snapshots instead.
It does not invent the absent field. Genuine failing and passing controls,
135 pinned source/evidence files, all 12 root offline checks and independent
source review are retained. The V3 manifest is
`5589246e51bb710da28b9ffb4fcd8329b678432a8890a8edb87e62feeef1ef2f`.

Known reported goal usage is now 183 calls/$0.27285490. The earlier $0.022384
unknown-timeout reserve and eight additional conservative failed-runtime holds
remain. The complete new $0.05 reservation remains held, including these two
known calls; the retained conservative ceiling is $0.47348230, below the
user's $140 testing cap. This is a goal-scoped bound, not a current account
balance or an assertion about unrelated account use. The fixed reservation
and append-only journal have no automatic release/reclaim operation.

No public credit-sale qualification, model promotion, complete original
rehearsal or full external-resource cleanup is claimed. The independent human
AI-label/held-out/privacy and security gates remain open. Credentials, raw rows,
provider IDs and private journals stay outside Git.
