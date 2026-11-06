# Native PA resident-credit entry and reopening — November 3

This test-only package verifies complete entry through the existing typed controls,
starting without a resident-credit draft. No calculation, collector, coverage
threshold, source confirmation or readiness behavior changes.

The independently stated existing fictional DE sources are wages50,000 for a
resident or20,000 during the PA resident period, withholding800 and posted balance
payment1,200. Actual net payments2,000 cap against PA same-income tax1,535/614.
Three new mounted tests enter every identity, work/payroll, filed-return, payment
and complete-account field. Explicit confirmation must produce the exact original
packet. Both native-produced records are serialized, the original form is
unmounted and a new form mounts those saved records with no change callbacks.
Saved fields and current status remain visible; editing compensation to actual0
clears draft/canonical confirmations and refuses reconciliation without replacing
retained originals.

A separate actual account has balance1,200.20 + withholding800 - refund0.20 =
net paid2,000. The same controls retain a known zero nonpayment-credit line.
Incomplete refund records, duplicate receipts and deleting the refund while
keeping net paid2,000 reject. Explicit record removal retains remaining records.
No prepared claim is inserted into the mounted collector.

Independent static review found that V1's reopening assertion only parsed and
replayed JSON. V2 adds the actual second mount and moves the existing edit/failure
checks onto that reopened form. This is a test-quality correction; the original
V1 source and successful run remain in local evidence. Reviewer V2 receipt:
`89dec925be7ed754ecbe12c98d4d154ca07e3a80b14fe9ee931867cec2cecece53`.

Actual main verification on648dd8a3 plus these tests/spec passes24tests/3files,
all3 typechecks, spec validation, unchanged inventory check, scoped lint with0
warnings and diff check. Strict spec-reference verification passes681cases.
Focused log SHA256:
`eeac6ee074b03613cc0bacb247d95315c0898cffcc790db0ae4853565daa611b`.
Integration receipt SHA256:
`148f325c351061e66395ad79620f83c91679fbf615e8787f96c907a0b4e7a1bb`.
Evidence: `.local/upgrade-evidence/nov03-resident-credit-native-entry-v2/` and
`nov03-resident-credit-native-entry-ast/`. The existing guided-source spec records
these behaviors; no arithmetic or oracle was taken from a candidate output.

These mounted DOM tests are local synthetic2025 evidence. They do not establish
real-browser, complete-journey, human tax, final2026 form or hosted qualification.
Full coverage must be measured again after integrated implementation.
