# Workspace JSON request limits

The workspace JSON save path previously allowed5MiB, above Vercel's documented
4.5MB ingress limit. Its browser transport parsed every response as JSON, exposing
JSON syntax errors for plain platform413 responses and reflecting server413 text.
This path is separate from document multipart uploads.

On Vercel (`VERCEL=1`), the existing streaming JSON parser now enforces4MiB over
the whole encoded request. Other environments retain5MiB. Rate limits, owner
authentication, entitlement checks, schema validation, private response headers
and storage/reconciliation order are unchanged. The client handles workspace
POST413 before reading its response body, with fixed guidance to export a full
backup. It does not truncate facts or claim a successful cloud save.

## Source and spec-first evidence

- Official source retrieved2026-11-04:
  [Vercel request-body limits](https://vercel.com/docs/functions/limitations#request-body-size).
- Exact baseline `b227d0e455a3a2761af55de5f02be341f0377515`; new operational YAML
  precedes the11 source controls and both product changes.
- Source-first receipt `22d4ead79ccd5572967c72771bd8b847cb32199cbe2b56c38b351466210faa5c`.
- Actual unchanged-product run:6genuine failures/5passes, log
  `0ca8546d39b8131bfe7246f4c66f48fd492b639e87d6727f057b56355a37f637`.
  Two measured oversized requests were incorrectly accepted; a declared
  oversized request reached payload validation instead of the size guard;
  three platform413 bodies produced unsafe or unhelpful errors.
- After the two-file correction, the same11 controls pass, log
  `d62bec0310a2262e9e7c931578c1f3e93ea2ee13aca6890e384ec6003175f1fd`.
- All89 unchanged adjacent workspace route, persistence, cache-policy and body
  lifecycle controls pass, log
  `52bdb0db5f6c1c41a0cafaf370117fc80cc96d61d909f57f3b4f9db013a68790`.
- Root/contracts/web types,7940 spec references,754 AST controls, inventory821
  generation/check and both builds pass. The first strict lint command stopped
  on five non-null assertion warnings in the new test. Explicit actual-stream
  and creation-event guards replace those assertions; all11 controls pass again
  (`bb9973ff…`) and strict lint then passes with zero warnings. No suppression,
  product change or weaker expected result was introduced for that correction.
  Distinct exact inverse review `319176dc…` confirms the original test hash.
- Current-main replay passes all100 affected controls, log
  `87e995b83a98657bd0274aaf4a79c4d2d7d20201fd5c7f6855e4f6e40123ee10`.
- Distinct static product review approves with no findings, receipt
  `34381cb11c18c9908d31cc5d5d1b77023e6766ccdf4bad957c863200f87ec858`;
  distinct verification of ROOT execution logs is `11900961…`, not a second run.

Checks use pinned Node24.22.1/pnpm10.34.8, one worker and unchanged deadlines.
Brief non-PDF transport tests ran alongside the isolated Node26 full suite;
no shared dependency, database or product files were changed by those runs.

## Evidence limits

The controls cover exact byte boundaries, multibyte text, declared length,
no-write rejection, unread plain/HTML/JSON413 bodies, input immutability and a
large local snapshot using Map-backed Storage. The latter establishes local
serialization behavior, not real browser quota, full document backup/import or
recovery qualification. Existing recovery checks remain separately required.

There is no new actual Preview deployment or ingress observation here. Requests
over the platform's own limit can still be rejected before the app; the client
now handles that status safely. Current full unit/coverage, both runtime
distributions, staging, independent human and release criteria remain open.


## Actual READY322 Preview JSON ingress, November 4

Exact source `322f0221a0dccee006029ee7291e47c0dade8451`, deployment
`dpl_67B2jpGa56JfuCUEqxJe8awpvfQu`, was READY before this bounded rehearsal.
One fresh sign-in/session read as the existing authorized staging A account
passes. Its private23-hour Preview link and session remain outside Git/output;
this test does not use or modify the Stripe automation token.

Three synthetic POSTs prove the deployed ingress boundaries:4194304 bytes
returns200 with the exact small sanitized workspace shell;4194305 bytes returns
413 with the exact application JSON error and private/no-store;5242880 bytes
returns413 with Vercel FUNCTION_PAYLOAD_TOO_LARGE. Fresh-session readback after
each request preserves the accepted shell. Scoped DELETE200, null readback and
exact unrelated A baseline pass, with zero app private/no-store failures.

Actual receipt SHA
`245fcb7820f126f53146e56a8173c09f00032b63c78450d0243cd4e8289685cb`
and executed script SHA
`b4fcc2cf6b852fa9ab27c0aaf590850b4b051a3990a4f0534dbbbd07b468fed1`
are retained under `.local/upgrade-evidence/nov04-staging-322-json-limits/`.
The pre-execution reviewer found the initial cleanup intent was memory-only.
Before any probe POST, a narrow correction persisted0600 exact-tuple/source/
deployment/baseline intent with flush/fsync; corrected-script review `feaa1430`
approves. Original script/proposal/finding remain retained. Successful actual
cleanup resolves the private write-ahead record against the receipt. Distinct
execution/source consistency review `68f6535064baecfda9d00ddd8e8e712a45f645608a67feb43034296c49314a7c`
approves this bounded receipt; the reviewer did not replay network requests.

Padding exercises transport bytes; it is not a4MiB taxpayer-data or document
backup. This proves bounded actual server ingress, small-shell persistence and
cleanup, not browser client413 rendering, browser quota/full-fidelity recovery,
forensic erasure, outages, final Node26 artifact or whole hosted qualification.
No account creation/reset, email, billing, provider or other-owner data actions
are performed by the probe.
