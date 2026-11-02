# Original two-state digital-asset withholding

November1,2026. This package preserves the two physical state information rows of an original Form1099-DA rather than rejecting every multiple-state statement. It records withholding facts; it does not apportion capital income or establish state residency or qualification.

The [2026 IRS instructions, Boxes14–16](https://www.irs.gov/instructions/i1099da), , [official2026 form](https://www.irs.gov/pub/irs-pdf/f1099da.pdf), and [historical2025 form](https://www.irs.gov/pub/irs-prior/f1099da--2025.pdf) allow up to two separate state rows. Each row retains state, filerstateID (including an explicitly blank original), and actual Box16withholding. The initial admitted pair is Pennsylvania/Ohio because those are the existing dedicated digital-source views. Other pairs still reject by name and remain engineering work.

One original statement produces one capital disposition set and one federal Box4 withholding credit. A selected Pennsylvania/Ohio view uses only its matching original state row. All existing Pennsylvania basis, ownership and for-profit source conditions remain required. No amount is allocated by a guessed ratio, and no synthetic extra sale is created.

Actual multiple-state originals require exactly two distinct supported states, known finite nonnegative amounts and each actual ID or explicit blank. An optional legacy scalar total must reconcile; a scalar state conflicts. None/single reporting with retained rows rejects. Legacy statements without an actual-state contract preserve their established path; unknown actual state withholding remains unknown and rejects before preview/export. Changing a guide row invalidates the statement confirmation, and duplicate manual withholding for either source state is rejected.

The spec preceded four failing tests on unchanged948d6b95 (two files,1.26sec), retained at `.local/upgrade-evidence/nov01-next-method/red.log`. Scoped checks pass 36 tests in seven files (4.45seconds), root typecheck and web typecheck. This includes the existing source/state/guide regressions, new exact large-cents and 2026 source controls, actual two-row collector edits, and reopening an actual Ohio reference PDF to confirm only its6.78row is printed and neither private state ID leaks. The first green attempt retained35passes and one new DOM matcher failure: the collector kept exact original0.10 while the matcher expected normalized0.1. Only that matcher changed; all amounts and product code were unchanged between these attempts. Independent review, full integrated checks and runtime rehearsal remain pending. This package does not establish final2026 form mapping, complete-data filing export, selected-state qualification, staging readiness or human approval.


Parent source review found two gaps in the first candidate: the new state-row field did not activate original-source validation on a legacy2025shape, and Pennsylvania nonresident/partyear paths could silently ignore the newly admitted sources. Separate spec-linked regressions failed before correction (four passes, two failures). New state rows or scalar state ID now require actual-source validation. The unsupported Pennsylvania residency composition stops by name before calculation. Actual scalar state ID is preserved where supplied and conflicts with multiple-row representation reject. Corrected checks pass38tests/seven files (4.96seconds), root types and web types. Full source review, lint/spec/inventory/integrated verification and runtime evidence remain pending.


Parent review identified one additional source contradiction: a retained nonblank scalar Box 15 identifier could accompany a no-state answer and disappear. The engine now rejects that contradiction before calculation. The guided adapter retains an existing scalar identifier for the same check; explicitly blank and whitespace-only values remain blank, and missing remains unknown. Spec-first direct and guided regressions failed against the original candidate (two failures, seven passes). The corrected package passes 40 tests in seven files (4.18 seconds), root typecheck and web typecheck. The original frozen receipt and logs remain retained separately; the revised receipt covers this small correction. No state gain allocation, final form qualification, readiness gate or support claim changed.


A retained single-state identifier is now visible in the collector in single-state mode or whenever saved. Switching to two states preserves it. After checking the actual row sources, the user can explicitly remove only the obsolete scalar identifier, including a retained blank. Both original state-row IDs and amounts and every transaction remain intact; the edit clears source confirmation. Two interaction cases failed before this control existed and pass after correction. Final scoped checks pass 42 tests in seven files (4.02 seconds), root typecheck and web typecheck. The v3 receipt preserves both earlier freezes and identifies this UI-only delta.


Parent review verifies the final12-path receipt
`40b4f2a7173955e10f474ae61e66ec73003f3d3df36f07bf5d42320c0233d4cd`.
Private parent checks pass18tests/fivefiles including three unchanged independent
amount/source controls. Main integration passes66tests/ninefiles, root/contract/web
types,6,414spec references, inventory freshness (606entries), scoped lint with
zeroerrors and engine build. The shared schema is checked to retain the reviewed
foreign-expense addition exactly alongside the DA changes. Ruleversions advance
to2025.215/2026.213-law-integration-draft. Main check receipt SHA256:
`c6ed28625c5cfa742a244297fe1e1a6683234274c1a2b210df9f9c24d6fa9d35`.
Actual final-code production browser/download review follows separately; previous
collector evidence is scoped to its frozen source. No human or filing
qualification, launch-state selection or staging evidence is inferred.
