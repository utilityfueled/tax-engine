# SQLite nested-FROM rowid prerequisite

The exact-source Linux run `44221292131` at `385db284` built its baseline
package but failed fulltest with 16 errors in 5,550,520 tests. Only
`join8-1010` and `misc8-3.0` failed, each in eight configurations. Candidate,
CVE and sanitizer stages were not reached. This is failed qualification.

The authenticated final SQLite snapshot `296ae1e4673151e59593105b653e87eceae25163`
expects the original join8 SQL to succeed. The earlier conditional join8
transformation is explicitly retired, with its full predecessor and inverse
retained. The unchanged original test remains an identity-checked input.
The misc8 ambiguity expectation already matches that snapshot and stays intact.

Its runtime repair adapts the four-file nested-FROM prerequisite from
[official SQLite commit f99a27f](https://github.com/sqlite/sqlite/commit/f99a27fab927a8c8fc8dc3c7d179654fa2b12fcd).
Hidden rowid expressions preserve column indices and real-column precedence,
select an unshadowed alias, and remain excluded from ordinary star expansion.
Later runtime rowid configuration checks and bounds remain. This is a manual
adaptation with common runtime changes, rather than an unchanged upstream patch.

The active transformation plan has 21 paths: 16 predecessor rows remain exact,
three runtime rows extend the predecessor, and two paths are added. Retired
join8 is preserved separately. All original fuzz invariants, complete suites,
paired CVE conditions, sanitizer checks, package flags, budgets and deadlines
remain required. Source custody requires exclusive ownership; partial-write
failures are retained without a rollback or hostile-concurrency guarantee.

Before the repair, host ARM64 tests reproduce join8 1/104, misc8 1/16 and
expanded joinH 9/36 errors. Both repaired host configurations pass all nine
focused scripts (627 legacy and 625 standard tests). The 21 appended joinH
controls retain the final snapshot's SQL and expectations; the original prefix
is unchanged. Root separately repeated join8, misc8 and joinH on both repaired
binaries and the two original failures. These are host checks, not Linux
package qualification.

The private proposal manifest is
`8d89a97071d4d30654181f62a55a55c8122de6e8906e8351b8d9e517502948b4`.
Root verified its 190 manifest bindings and 71 host source/header/binary
bindings. Independent review passes (manifest
`43b483eaf290c3c302cf2c706d499dddb6a1f4ae5d1e52a0648068d9891486d2`).
The nine public paths match the reviewed proposal. Public-source checks pass:
30 Vitest tests, 31 Python controls, TypeScript, strict scoped lint, 9,515 spec
lines and generated inventory validation. The sole generated derivative adds
the new unsupported ops-spec entry; independent review confirms all other
inventory entries are unchanged. Root adoption receipt is
`e93cc88a0abdd237a9af7e025154ff2e245b8778ce78d8e668201ac36fa2579b`.
Three of eight recipe pins change. Although none of the nine adoption paths
changes a member of the 37-file GPG authority set, successor package, ABI, GPG
and final runtime evidence must bind the newly built artifacts. No readiness,
generic ABI approval or filing qualification is claimed.
