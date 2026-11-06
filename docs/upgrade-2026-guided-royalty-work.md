# Actual guided direct royalty sources

This metadata-free intake package follows the separately owned direct-property calculation. It adds an explicit royalty income route, original MISC statements, per-property gross allocations, classification and actual expense receipts. It does not supply a net-income override or infer any zero, expense completeness or nonbusiness classification. Existing saved records remain unchanged unless edited.

## Source basis and supported facts

Refreshed on 2026-10-26: [final Schedule E instructions](https://www.irs.gov/instructions/i1040se), Part I line 4 and expense instructions; [MISC instructions](https://www.irs.gov/instructions/i1099mec), Box 2 and original statement boxes. The current December 2026 instructions are not used to relabel a 2025 original. The collector retains the actual applicable revision and requires the independent 2026 compensation facts when that year is selected.

The source calculator validates the exact original year, owner, statement identity and Box 2 amount, complete property allocations, current cash-paid receipts and classification. Unknown and known zero remain distinct, including an absent expense ledger versus an explicitly recorded empty ledger. Existing mortgage-recovery-only MISC sources retain their original indexes; direct royalty originals append once. A positive unrelated box cannot be routed through a royalty label or duplicated as a recovery original.

The panel exposes statement and property confirmations. Source edits revoke them without replacing a copied original snapshot. Reconfirmation alone cannot repair changed original amounts. Household edits and interview-year changes also revoke confirmations. Source identity and receipt records remain local workspace data.

## Independent literal controls and evidence

The derived control is original gross 12,000.25 less legal 49.25 and management 950.50: property income 11,000.50. With wages 200,000, AGI is 211,000.50 and NIIT is 418. Original federal withholding remains 100.10. Adding an independent recovery original adds 600 income and 60.01 withholding once; its old index stays 0 while the royalty link becomes index 1.

The selected-state withholding control combines actual MISC 0.40 and recovery 0.10 to 0.50 while excluding another state's 0.30. It uses the combined canonical originals once. The parent Pennsylvania guard is preserved: this packet cannot establish PA property classification, ownership or expense treatment. The panel states that state method boundary, and federal preview remains separate from the unavailable PA result.

Private red evidence `guided-royalty-source-red.log` reproduces both the dropped original MISC source and the selected royalty route silently calculating without a packet. `guided-royalty-dom-red.log` records the missing new collector before implementation. The initial source/recovery/DOM cohort passes 11 tests across three files. Final frozen checks, browser persistence/privacy evidence and independent review are appended after they complete; no completion or qualification claim is made here for pending checks.

The first source freeze `6b13c49a73973d46497d93b46b41674529c06332` used the parent's immutable dependency tree `415359a0c1167046eefbd7cdbecce933547a9de5`, overlaid only for verification. Those twelve parent paths are excluded from this collector's owned patch. The parent subsequently committed the dependency as `848e1fc66881a8d820adf4954677d3d0cb708fdf`; the final collector is rebased on that committed source contract.

## Frozen verification and independent review

The exact source freeze passed 1,324 tests across 115 files, root and web typechecks, all 5,216 spec references, and the production build. Scoped lint reported no errors and the two existing bridge warnings. A separate replay of the old generic-state preview without the combined MISC loop reproduced the missing 0.50 withholding, then restored the source unchanged. This is retained as a regression replay, not claimed as an initial preimplementation run.

Independent agent review verified all 13 owned and 12 dependency hashes and passed 12 tests across three files: seven owned cases and five private controls. These cover reordered original statement indexes, exact additional cents, missing copied facts, unrelated original boxes/state/owner contradictions, normalized duplicate accounts, and receipt-edit reconfirmation. The review found no actionable issue within this source/UI slice; its probes remain outside the delivered source.

The first production browser run stopped at a test-only rounding expectation: 211,000.50 correctly displays 211,001, while the assertion expected 211,000. The first display assertion was corrected; monetary calculation, source amounts, other assertions, timeouts and retries were unchanged. Both desktop (1280px) and mobile (390px) cases then passed with zero retries against the unchanged frozen production build. They verify source cents and copied originals, stale confirmation blocking, live calculation after actual reconfirmation, local save/reload of false/zero/unknown, no source identifiers in request bodies, and no horizontal overflow. Both saved screenshots were visually inspected.

Evidence is retained in the private release-prerequisite evidence folder: `guided-royalty-exact-tests.log`, `guided-royalty-exact-roottypes.log`, `guided-royalty-exact-webtypes.log`, `guided-royalty-exact-specrefs.log`, `guided-royalty-exact-build.log`, `guided-royalty-state-withholding-red-replay.log`, the original and corrected browser logs, and the frozen manifests. Independent review is recorded in `.local/upgrade-evidence/federal-guided-royalty-review.log` and its snapshot manifest.

The final source candidate `ca7d645ba9fd515498348b77fa728fe0e51217c6`, rebased on the committed royalty contract, passed 472 focused tests across seven files, including the strict spec-reference suite, both typechecks and scoped lint with no errors. Independent re-review confirmed all eleven product/spec/source-test files were unchanged; only the accurate initial browser display assertion and evidence ledger differed. Its reviewed thirteen-path patch applies to the later health integration `4fcff15bef739ad721acb71a1ae7f9805ebe677f` without conflicts, and all thirteen candidate hashes were verified before adding this integration evidence. The parent granted a scoped metadata-free integration lease; unrelated PDF/state/source work remains separate.

The final integration on that health commit passed 473 focused tests across seven files, root/web typechecks and all 5,234 spec references, with no diff whitespace errors. All twelve non-ledger files still match the reviewed final candidate; only this evidence append differs. The production server used for the browser checks was stopped after verification.

This is agent source/software evidence, not independent human tax qualification or authorization to file. Existing 2026 and filing-readiness gates stay closed.
