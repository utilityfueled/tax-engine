# Public API G-L fixture migration

Only the public API fixture and this spec/ledger change. The original positive NJ example omitted income classification and now correctly hits the existing reciprocal employee refund/source guard. Its complete original file is retained in local evidence, and the identical input is now a dedicated rejection control.

The broad exported calculator test uses explicit fictional NY ordinary compensation, same-income10000, final income tax paid500, and PA307cap. It preserves every original public-surface assertion and adds explicit per-state10000/500/307 checks. These are arithmetic preconditions, not qualified actual taxpayer sources. No reciprocal exception or live source result is inferred.

Official sources refreshed2026-11-02: PA PIT Guide, Deductions and Credits, resident-credit and reciprocal-compensation sections; continuous MOD03-24 PA Schedule G-L pp1,3-4. Ordinary PA residents cannot claim resident credit for NJ employee compensation; erroneous withholding requires the applicable refund process. Actual eligibility/returns/payment proof remain the source-bound successor's responsibility.

Original unchanged baseline failure: `.local/upgrade-evidence/nov02-next-1644-refresh/baseline-public-api.log`,9tests8pass1fail, original line505. Source SHA and actual package checks are retained in the local migration evidence; final check results pending explicit runtime grant.

Verification at isolated base `42919e82d6862387139624eaaee69959949b3a15`: unchanged public API9 controls reproduce8pass/1reciprocal-guard failure; migrated public API10 plus existing core G-L controls pass42 tests across2 files. Root TypeScript, full spec validation and strict public API test lint pass. All4300 unrelated tracked baseline source files remain exact. No production, schema, dependency, privacy or readiness changes. Main integration and commit are owned by the parent agent.

Parent main6a88c9b5 independently reproduces the exact8pass/one failure before adoption. Spec-first exact3 adoption passes42/two, root types, spec, inventory generation/check, strictlint0 and diff. No product changes. Main evidence `nov02-parent-public-api-gl-main-{red,green}/checks.json`. Root reviewed the complete diff; all preexisting monetary and public-export assertions remain and the original NJ input is retained.
