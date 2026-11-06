# Replacement staging database bootstrap

The approved isolated replacement branch completed catalog inventory, restricted role/database bootstrap, password-presence inspection and first application-role authentication. These qualify only those database operations. The app has not received the new connection; replacement Preview builds, synthetic app accounts, outage, automatic Stripe retry and cleanup remain outstanding.

## Authority and actual results

The user approved a free 24-hour schema-only branch, restricted credentials, two protected Preview builds of `fe1d14620f3f93f8ef7111e01a20fdada612bab9`, two synthetic no-card trials, a database outage/restoration and cleanup. The combined ceiling remains 1,793 operations including 156 historical operations. Redis retains its separate 240-request, $1 actual-spend and $20 automatic-cutoff limits. Production is excluded.

The original V3 worker manifest is unchanged: `d08d92d8d1315afc3bb2fbc786b5f529cd0efc27bb980071f359731412db2e1f`. The four original receipts and their source-authority fields remain exact.

| Phase | Actual result | Operations | Cumulative with history and Console |
|---|---|---:|---:|
| Catalog | Read-only reachable inventory | 108 | 276 |
| Bootstrap | Restricted NOLOGIN role, admin-owned database and scoped grants | 325 | 601 |
| Presence | Four databases agree that the new role has no password | 162 | 763 |
| Login | Password/LOGIN commit, post-commit metadata and application authentication returned | 372 | 1,135 |

Twelve Console bookkeeping units are included; this is not a physical browser HTTP census. Every counted first-four ledger attempt has a returned record. Existing parent/application rows were not copied into synthetic application data. Intended catalog changes are the new role, its reverse admin membership and the new database/schema grants. Distinct saved bootstrap review covers all 25 inventory categories and privilege decisions across four databases, plus five adversarial controls.

The actual external connections report authorized TLS 1.3, hostname verification and SCRAM-SHA-256-PLUS server-final validation. `backend_ssl` is false, so internal provider-hop encryption remains unqualified. Bootstrap closes rely on awaited source control flow and successful rollbacks; presence and login have explicit session-close witnesses. The login write session commits. Credentials remain in ignored private files; their contents were not printed or hashed.

## Preserved failures and current hold

The catalog supervisor originally returned HOLD after receiving its worker receipt. EOF preceded its final process wait. The original natural exit remains unknown; ROOT later observed the recorded PID absent and reconciled the complete nonmutation ledger. The reviewed outer successor adds a bounded natural-close wait inside the original deadline. Bootstrap, presence and login subsequently closed naturally with exit 0. The original HOLD is retained.

Two normal-phase connector metadata requests raised the cumulative count to 1,137. Project metadata omitted required configuration fields, and environment listing returned 403. The reviewed local CLI fallback initially stopped before spawning because its verifier rejected two legitimate zero-byte JavaScript files. A source successor now admits those files only with their exact empty hashes, retains the full CLI census and pins the four historical V3 receipts explicitly. Independent engineering review passed 167 controls and the actual installed CLI census.

ROOT then ran the reviewed metadata helper once. It closed naturally with exit 1 after one read-only project GET was marked attempted and unknown/failed. The cumulative count is **1,138**. The environment GET did not run. The helper discarded raw vendor output as designed; the failure's cause is unknown. No environment write or build occurred. Its intent, failed attempt and HOLD remain retained, and no automatic reissue is allowed. A reviewed correction or diagnostic path is required before further service requests.

The expired original branch's unknown commit remains unresolved and is not reused. Its old sandbox endpoint is disabled and its two old trials are canceled. No replacement outage, automatic retry, release, filing, final 2026 form, AI or human security/privacy qualification follows from these checks.

## Retained evidence

- Actual receipts and dispatch ledger: `.local/upgrade-evidence/replacement-actual-60d62543077f`.
- ROOT grant, catalog reconciliation and metadata hold: `nov05-hosted-replacement-root-actual-60d62543077f` and `nov05-hosted-replacement-current-metadata-root` under the same evidence directory.
- Distinct bootstrap manifest: `93f4bc01390b9934e85ff2f966b08092415d1b735af8db7d5498bda6e8d56ad9`.
- Accepted close-fix source manifest: `51b4a502fcd295a5b4948a4cd71aada7e0b771dfde1869c629c657065ae75282`; its worker binding remains V3.
- Corrected V4 worker manifest: `1d6bc66dbc084668c01015afc447afad0e799635dc7f3209ff94504facd8943c`; metadata V2 manifest: `301496c6645672bf30e39018898308b86b0badd2d456864ab647484399465909`.
- Distinct worker/metadata review manifest: `89ca1c2b74b9d0783d16a9f84905b805af27daaf34eb6c69df5c6a2fd8dbb905`. Later worker phases also require the separately reviewed close-fix outer binding to V4.

These are engineering checks. Required human security/privacy and tax reviews remain open.
