# Hosted workspace returned-response cache policy

Two separate authenticated Starter actors on historical Preview80bc752f received ready200 workspace-list responses with `Cache-Control: public, max-age=0, must-revalidate` while their session/billing responses already used private/no-store. The combined preflight retained nine cache-policy failures; its five unauthenticated workspace requests correctly returned application401 owner-required JSON. No cross-owner cache disclosure was demonstrated. The preflight recorded zero authenticated workspace-write tuples and zero verified cleanup tuples; it did not qualify tenant isolation or writes.

Source-first52 controls then genuinely failed only the missing cache policy against unchanged handlers. The bounded product wraps all five existing returned-response paths (list/get/save/delete/uploadDocument), applies `private, no-store, max-age=0`, and returns the same response object. Bodies, status, non-cache headers such as Retry-After, current auth/owner/rate/storage behavior and all five original handler bodies remain unchanged. No document, fund, email, account or provider operation is part of this code verification.

The first product attempt passed52 focused and199 adjacent controls but strict web typecheck exited2: all five existing inferred handler results include `Response | undefined`. This failure remains retained. A separately reviewed narrow correction admits that original union in the wrapper and guards the header mutation only when the result is defined; it uses no assertion/non-null cast or altered handler body. Original rejection behavior and the original possibly-undefined return contract are preserved.

The successor completed all12 recorded checks:52 focused PASS;199 adjacent PASS with18 database-dependent controls SKIPPED (not executed); root/web/contracts types; spec7,871 references/zero broken;745 AST controls; owned strict lint0errors/0warnings;812-entry inventory generation/check; engine and web builds. No timeout, retry, assertion, cache-source qualification or global gate was weakened. The skipped database cases are not counted as successful database validation.

Distinct source-only review approved response identity/body/status/header preservation and the strict-union correction. This review did not execute an independent runtime or establish deployed behavior. Framework-generated errors from uncaught rejections, middleware/CORS short-circuits and external proxy behavior remain outside this finite returned-response patch.

A new Preview containing this fix has not yet been validated. Required next evidence is authenticated and unauthenticated current-Preview header replay, then the authorized two-owner workspace/document read/write/isolation/delete/cleanup rehearsal. Existing historical80bc failures and the correct401 controls remain historical evidence, not successor success. No staging, global, release, risk-acceptance or final2026 qualification is asserted; releaseReady remains false.

Evidence index (safe receipts only):

- `.local/upgrade-evidence/nov03-staging-tenant-rehearsal/receipt-preflight-a.json`, `receipt-preflight-b.json`, `receipt-preflight.json`: historical80bc read-only/preflight observations.
- `.local/upgrade-evidence/nov03-root-hosted-workspace-cache-policy/source-first-before-red.json`, `genuine-red-and-product-scope.json`, `red52.log`: unchanged-product source-first RED.
- The same directory's `checks.json` and `web-types.log`: first focused/adjacent success and retained strict-web failure.
- `successor-strict-types/checks.json`: all12 successful successor commands and exact log SHA256s.
- `.local/upgrade-evidence/nov03-root-hosted-workspace-cache-policy-independent-review/receipt.json` and `strict-union-repair-static-successor.json`: bounded independent static judgments.

Exact proposed source/check hashes are retained with this private document draft's manifest. No credential, cookie, token or raw actor/workspace payload is reproduced here.


## Successor: actual377fe Preview header and tenant rehearsal

The earlier “new Preview pending” state above is historical. Root-verified READY377fe Preview now passes fresh A/Bsign-ins, preflight with zero header failures, the actual two-owner save/revision/reload/isolation/same-ID namespace lifecycle with all3 unique tuples cleanup verified, and a separate68-byte transient upload with metadata-only/no-shell-retention checks. [The tenant ledger](upgrade-2026-staging-tenant-workspace-work.md) preserves exact counts, receipts and limits. Historical80bc nine header failures remain intact; no cache disclosure, DB row-count/provider durability,25MB/forensic/session-UI/final-artifact or release qualification is asserted.
