# Actual W2 state/local consumer integration

Scope: one federal economic original, every actual reported withholding once, PA Box16 selected by state, and reciprocal PA withholding with a truthful multirow attestation. No local jurisdiction or other-state credit follows from printed locality names.

Sources: IRS 2025 Schedule A instructions line5a https://www.irs.gov/instructions/i1040sca and 2025 General Instructions Forms W2/W3 Boxes15–20 https://www.irs.gov/pub/irs-prior/iw2w3--2025.pdf . Existing qualified PA residency/reciprocity source contracts remain controlling for actual payroll and legal exceptions.

Spec written first. This package was reconstructed after temporary-source loss; previous consumer test bodies were unavailable and no previous behavior-red execution is asserted. New originals and four behavior tests precede existing product edits. Execution receipts are private under .local/upgrade-evidence/nov02-w2-state-local-consumers.

Readiness remains gated by canonical schema/bridge/guided integration and independent review, owned separately. This author package does not qualify a state return or authorize filing.

Before green, corrected the new spec taxYear metadata from2025 to2026; all four unchanged behavior tests already exercise both years. No expected amount or product behavior changed.

First green attempt:36/37 passed; the remaining control attempted complete2026 federal calculation and correctly hit the existing incomplete-rule-pack gate. Corrected test scope to assert that gate remains closed, while retaining2025 full federal50000/5000 controls and both-year source/SALT/PA controls. Both-year stale packets must fail original validation before that law gate. No product, readiness gate, or monetary expectation changed for this correction.

Final author checks:37 tests/7 files passed (actual consumer4, immutable new source7, existing SALT/PA26), root/web/contracts types passed, spec6647/6647 references passed, scoped lint0 errors and8 existing federal non-null warnings. The newly introduced test non-null warning was removed; final focused checks and lint repeated. All10 prerequisite hashes and4157 unowned tracked Git blobs remain exact. Full8 source copies, patch and hashes are retained durably. Independent review and shared admission/wiring remain pending; no complete2026 return readiness is asserted.
