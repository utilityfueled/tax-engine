# Actual November 5 daily AI cost export

The signed-in Utility Fueled LLC usage page supplied an actual cost CSV for November 5 UTC00:00 through November 6 UTC00:00. The retained 363-byte file reports one organization row at **0.2628216000000000000000000000 USD**, exactly matching the recorded known **0.26282160 USD**. Independent Decimal80 parsing confirms an aggregate residual of zero. The current daily bucket was still open at the reported observation time, 17:46:57 UTC.

The export has blank project and user/key fields and no request identifiers. It does not allocate a charge to the earlier timed-out request or establish finalized invoice settlement. The **0.022384 USD reserve remains held**; known-plus-reserve exposure stays **0.28520560 USD**. No further paid calls, reserve release, model promotion or hosted retail-ledger qualification follows from this observation.

The UI showed Utility Fueled LLC, the selected Default project (the only available project option), 174 requests and 123,408 tokens. The export was grouped by Organization. Those UI observations are root-collected; the independent reviewer verified the retained file and arithmetic rather than repeating the browser observation. CSV alone does not supply those request/token counts or project attribution.

The browser download-event wait timed out while its control became disabled. A separate exact-path filesystem check then found and parsed the downloaded file. Both facts are retained; an event timeout is not being reported as a missing file. No API key or credential was read, copied or placed in the export evidence.

## Evidence and review

- Root factual packet: `.local/upgrade-evidence/nov05-ai-exact-daily-cost-root`, four members; manifest `a3ac9f1b43018b452cd8bb106e66c43ba9a816f6bd69da4766c5d26b3f221ec9`.
- Actual CSV SHA256: `56fda37fa6875e8ec4fa527f63d2c0a005f48277201bc552d1711220e5f89b37`, retained privately with mode0600 in a0700 directory.
- Distinct factual review: `.local/upgrade-evidence/nov05-ai-exact-daily-cost-independent`, three members; manifest `0e23988d019d96bfc7150cd70d98fec6755666011431a4564dfa671f4a6d967c`.
- Root read the full independent report and reverified all member hashes/sizes. Both pinned prior ledgers remain unchanged. This evidence-only package changes no application source; JSON and diff checks apply.

The [minute reconciliation](upgrade-2026-ai-minute-usage-reconciliation-work.md) and [SSA smoke](upgrade-2026-ssa-v3-live-smoke-work.md) retain earlier observations and qualification limits. Request-level settlement, independent human case review, representative held-out evaluation, provider/profile availability, exact hosted accounting and route qualification remain open.
