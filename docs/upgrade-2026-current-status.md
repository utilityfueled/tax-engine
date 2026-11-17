# Current 2026 upgrade status

The goal remains active and is not release qualified. Reviewed work is pushed to
`main` through `bb3fd00e5b70f705655dec517c9613fbe75c6c30`. Automatic production
builds are disabled; no production deployment, filing or model promotion is authorized.

For continuation, read only `activeContinuation` in
[the checkpoint](upgrade-2026-checkpoint.json) and its named current ledgers.
The complete earlier status is preserved verbatim in
[the historical record](upgrade-2026-status-history-through-20261117.md).
Do not reload that history unless a specific unresolved question requires it.
The [execution brief](upgrade-2026-execution-brief.md) remains the complete scope.

| Package | Verified result and remaining work |
| --- | --- |
| Global checks | Full CI at `7ea7453b`, `c40ad8cf` and `b9fe12dc` passed all six jobs. Coverage: 29,004 tests, 88.2% branches; the 85% gate is unchanged. At b063, spec validation passed but generated-inventory check failed; the sole missing diagnostic row was regenerated and committed as `5b56e256`. Other source checks remain in progress. |
| Tax facts, federal and PA/OH | Extensive finite, source-bound cases pass; broader enabled scenarios, independent expected outputs and applicable final 2026 forms remain required. All three residency types remain in scope for each selected state. |
| Strict browser | Ordinary and strict modes retain different 90/30-second case deadlines. Strict 2fcc/6cf/7ea/c40/b9 runs failed with 14/2/10/8/13 cases respectively. No successful ordinary run replaces those failures. Original-batch diagnostic `44187013822` completed with original baseline 646/4/5; its two sampled batches failed, retaining ten valid/four unavailable partial-isolate profiles. No cause or qualification follows. [Diagnostic ledger](upgrade-2026-full-batch-cpu-diagnostic-20261117.md). |
| SQLite | Paired run `44184632007` preserves the original join/OOM failures. Official corrections pass both complete targeted scripts, 107 and 8,162 tests. Root and independent artifact review pass. Full-package attempt `44190069976` built the baseline package but failed fulltest at recover.test1.1.2; candidate/CVE/sanitizer, ABI and runtime integration remain open. The common DBPAGE profile is reviewed for a new full run. Inert discovery passed and identifies `gpg` as the sole regular ELF direct consumer; indirect uses remain unresolved. [Discovery](upgrade-2026-sqlite-consumers-20261117.md), [profile](upgrade-2026-sqlite-dbpage-profile-20261117.md), [experiment](upgrade-2026-sqlite-upstream-experiment-20261117.md). |
| RRTA interpreter | Paired experiment `44190812240` retained 104 passing children, but 4.07449%/4.17741% medians fail the predeclared 10% threshold. No version adoption or strict privacy qualification. [Evidence](upgrade-2026-rrta-python-paired-20261117.md). |
| glibc | XFD assertions now pass; ten XPASS retain the unchanged strict package hold. Candidate build, allocator, ABI and consumers were not reached. [Package evidence](upgrade-2026-glibc-package-profile-20261117.md). |
| Hosted billing and real provider costs | The signed-credit proof issued 1,000 cents, charged two one-cent settlements and retained 998 cents. Two real calls cost $0.0005246; duplicate/replay/control-account checks pass. Current isolated cleanup passed. Historical/global cleanup, public-sale and model qualification remain separate. [Evidence](upgrade-2026-signed-credit-provider-20261117.md). |
| AI evaluation | Known goal usage is 183 calls/$0.27285490. Old unknown holds and the full current reservation remain; conservative reserved ceiling is $0.47348230. Independent labels, held-out review, repeated qualification and route-specific provider evidence remain required. |
| Security and self-hosting | Earlier bounded rehearsals do not qualify newer artifacts. Remaining advisories and final AMD64/ARM64 runtime, recovery and release evidence require exact-source disposition. No FAIL/XPASS/coverage/privacy/readiness gate is relaxed. |

The [external-action list](upgrade-2026-external-actions.md) identifies required
qualified human tax, AI and security/accountability reviews, Google project access
where that route is selected, and final applicable annual forms. No qualified
human reviewer has accepted the tax assignment. Agent review does not replace it.

The [November 17 official-source refresh](upgrade-2026-official-source-refresh-20261117-continuation.md)
and [provider catalog](upgrade-2026-provider-catalog-20261117.md) record bounded
observations; they do not qualify drafts, prove entitlement or establish global absence.
The [picomatch ledger](upgrade-2026-picomatch-security-20261117.md) retains its
unfixed advisory and dated follow-up. Formal verification remains excluded.
