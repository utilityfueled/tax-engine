# Selected jurisdiction and dedicated state previews

Guided source validation, PA controls, preview and review-packet routing now use
the selected return state. Mailing addresses remain actual mailing addresses.
An explicit federal-only selection stays federal-only even with a PA/OH address.
Resident PA/OH review forms require actual full-year residency; part-year PA
needs its separate nonresident allocation input. Incomplete state packets retain
the existing disclosure and readiness findings.

PA/OH previews use the dedicated engines and their actual source adjustments.
The same payment adapters feed preview and review download: actual OID
withholding is retained when additional Ohio withholding is entered, and PA
additional withholding/dated estimated payments now reach the packet. PA source
aggregation includes1099-B and rejects nonzero withholding without its source
state. Five earlier tests that explicitly assumed an absent state meant PA now
test rejection followed by the same expected credit after an actual PA answer.
No threshold, assertion precision or readiness gate was relaxed.

Sources refreshed2026-10-25:

- [PA residency and filing requirements](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/brief-overview-and-filing-requirements).
- [PA interest treatment](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/interest).
- [Final2025 Ohio booklet, residency and withholding/interest adjustments](https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf).

Specs preceded failing routing, payment-source and residency-export tests.
Independent expected arithmetic:60000PA wages x3.07%=1842;1000direct Treasury
OID remains exempt;2000withheld gives158refund.2000+0.10source+0.20additional
withholding+0.30estimated payments=2000.60payments, and PA's printed158.60net
overpayment rounds to159. Ohio Treasury OID leaves state tax unchanged compared
with the same actual wages alone. UI labels say State Payments because the
existing metric includes estimated payments, not just withholding.

Working-tree checks:917 tests across54PA engine/PDF/workspace/guided files
passed. A separate adjacent run passed877 tests but encountered a concurrently
created HSA test whose implementation did not yet exist; that run is not a global
pass. Exact staged checks are recorded below when complete.

The isolated staged tree8a293b1a4a4bb289bb7889c7626bf2cd9ed7278c passed1,496
tests across88 files, root/web types and3,608 spec references. Scoped lint has
zero errors/warnings. Logs:`.local/upgrade-evidence/guided-state-staged-*`.
The final diff review restored the separate input heading Additional State
Withholding; only the combined result metric is labeled State Payments.

This remains provisional state work. User-demand selection, independent human
qualification, final2026forms, local-tax completeness and release evidence are
not established by these checks. Actual Ohio municipal-interest allocation intake
and remaining dedicated-state source gaps remain internal work; a dedicated
calculation that lacks facts leaves its preview unavailable rather than using a
generic fallback.
