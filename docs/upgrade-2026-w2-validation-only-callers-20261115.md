# Remove two discarded W-2 source commitments

Guided W-2 section validation and Ohio payment-source validation now call the
existing assertion helper instead of constructing a public row result that each
caller immediately discarded. Both wrappers use the same original preparation
and finish: original/source checks, serialization and encoding, final Decimal
conversions and audit construction retain their order. Only the unused SHA256
and public return object are omitted. Actual row-result consumers and the Ohio
payment projection's own source digest remain unchanged. No cache, tax formula,
privacy control, browser deadline, retry or readiness policy changes.

The separate nonqualifying d192 browser diagnostic samples these two original
hashing paths. Sampling weights are wall intervals, not process CPU utilization;
this observation does not establish the cause of its twelve strict browser
failures. A new strict integrated/runtime run must assess the changed source.

The software spec preceded the tests. Both baseline tests actually fail because
the old calculated helper is called once. The final focused run passes 105 tests
in seven files; root types and all 9327 strict spec references pass. Full lint
exits zero with no errors and 12101 repository warnings; no zero-warning claim or
lint-policy change is made. An initial new observer wrongly required a helper
call for year/confirmation facts already rejected by the unchanged earlier guide
check. That failure is retained; the new test now asserts those exact earlier
refusals and zero calls. The two genuine baseline failures remain unchanged.

Independent review rehashes the four source files and passes six tests, including
four separate controls: an independently reconstructed node:crypto payment
digest, stale account snapshot refusal before the W-2 helper, packet-free verified
zero versus unknown, and both-order contradictory originals with predecessor
first-error/input-immutability parity. This is software-preservation evidence,
not an independent tax interpretation. A mistaken private test selection began
the full suite, was interrupted and retained; the corrected exact selection
passes and is the review result.

| Evidence | SHA-256 |
| --- | --- |
| Four-file source freeze | `8bd970be43206ea1f7c63b8e2ff3e536f96a4d22078de124bfacd8f08c5c1003` |
| Independent final review | `bb89b16160c584e4c4cdbbe420993ba4af22e88f3e176b632956a110b3a7c286` |

Private evidence: `nov15-w2-validation-only-callers` and
`nov15-w2-validation-only-farmland-review` under `.local/upgrade-evidence/`.
Source-audit metadata, all twelve combined checks and runtime successors follow
this commit; earlier source passes do not qualify it.
