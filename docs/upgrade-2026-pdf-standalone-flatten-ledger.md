# Standalone flattened PDF reference repair

This is a structural review-export successor. It does not qualify tax law, final
TY2026 forms, cryptographic signatures, filing, staging, or public readiness.

- Baseline: main `dbd325ed333019f8710cef1bc0dc84d9ad515a07` current tracked working
  source (including reviewed pending PA business work), 4,358 complete entries.
- Product ownership: `src/pdf/pdf-utils.ts` only. Dedicated specification,
  standalone regression tests, this ledger, and one necessary existing test
  assertion migration are the only proposed other changes.
- Existing evidence stays intact under
  `.local/upgrade-evidence/nov02-pa-ordinary-business-sources/`: bad original
  PA40 components and direct merges, exact annotation inventory, temporary-merge
  configuration correction, and final author artifact addendum. Each original
  standalone diagnostic PA40 has 23 missing annotation references. Earlier
  temporary-merge qualification did not repair the ordinary standalone route.

## Sources and boundary

The primary API reference was refreshed on 2026-11-03 UTC:
https://pdf-lib.js.org/docs/api/classes/pdfform#flatten . The pinned dependency is
`pdf-lib@1.17.1`, whose `PDFForm.flatten` paints widget appearances into pages and
calls `removeField`. The installed `PDFForm.ts` lines 581-609 attempt page annotation
removal using the appearance reference, then delete child widget objects. Those
deleted widget refs can remain on page `/Annots`. A successful save or render is
therefore insufficient proof of a well-formed standalone output.

The proposed repair snapshots resolved page Widget refs immediately before the
existing explicit flatten operation. It removes only snapshot entries whose
objects no longer resolve after that operation. Resolved annotations, orphan
Widgets absent from catalog Fields, and preexisting unresolved refs remain. This
does not insert a broad cleanup pass into default `savePdf` and does not force
ordinary callers through temporary page copying. Appearance generation, catalog
semantics, metadata, links, redaction, signature handling and export gates retain
their existing contracts.

The unchanged-product actual `fillReturn` control also found 592 stale `/OBJR`
references in eight federal tagged forms. Read-only comparison proves each target
was an original template page Widget. Adobe's primary PDF reference describes
`/K` object-reference children and `StructParent`/`ParentTree` relationships:
https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.4.pdf
(section 9.6, tables 9.12-9.13 and example 9.11). The repair prunes only `/K`
children targeting those same proven deleted widgets. It preserves all other
tags, MCR/MCIDs, parent identities, IDTree and ParentTree mappings. Unreferenced
indirect pruned OBJR objects are deleted only after checking for remaining
references. Ambiguous still-referenced objects stay visible to validation.

Former-widget ParentTree keys may remain unused but point to preserved, resolved
parents. This repair does not tag the painted appearances or establish PDF/UA
accessibility. It introduces no decision to flatten signed documents.

The existing temporary-merge regression deliberately includes one synthetic
preexisting missing reference. Its ordinary-output unresolved count changes from
three to one because the two widgets invalidated by this flatten are now repaired.
The remaining preexisting invalid-ref oracle and temporary-output zero remain.
The original test is retained verbatim as evidence before this migration.

## Durable checklist

- [x] Full baseline and product hash captured before authoring.
- [x] Dedicated spec written before dedicated tests; source-first copies frozen.
- [x] Tests cover actual PA40 compressed/uncompressed standalone serialization,
  actual ordinary resident business `fillReturn` without the temporary option,
  shared-field/multi-page annotations, preserved missing ref and orphan ambiguity,
  valid links/notes, canonical interactive values/appearances and unsigned
  signature structure. No cryptographic validity claim.
- [x] Run genuine unchanged-product red with explicit scheduler grant: six controls,
  five genuine failures and one passing interactive/signature-structure control.
  Exactly 16 generated diagnostic PDFs and exact logs retained. The skill marker
  ran exactly once immediately before authoring, expected/actual output count 16.
- [x] Implement bounded repair only after retaining red evidence. A source-first
  seventh mixed-tag control was frozen before the added OBJR repair; the original
  actual `fillReturn` failure established that defect before implementation.
- [x] First green attempt retained: all seven new controls and ten original
  controls passed; the original add-annotation-after-flatten case exposed cached
  pdf-lib normalization when the new cleanup deleted an empty Annots array.
  Source-first addendum records the regression. The bounded correction leaves
  that empty array intact; all test bodies and missing-ref assertions remain.
- [x] Run dedicated and original relevant regression tests, types, strict lint,
  spec validation, build and inventory consistency as scheduled.
- [x] Reopen saved PDFs through a different reader, recursively resolve every
  reachable and saved xref/object-stream object,
  verify fields/widgets/values/notices and privacy, and render final pages.
- [x] Freeze complete author candidate, exact owned diff, test evidence and
  remaining limitations for distinct parent/peer review before adoption.
- [ ] Distinct reviewer approval and parent main integration checks/commit/push.

Final author checks: corrected product 18 tests/3 files passes; root, web and
contracts types pass. Strict lint initially found two non-null fixture assertions;
only explicit fixture guards changed. Form-enabled visual inspection then found
the new synthetic checkbox had been checked before adding its widget: canonical
V was Yes but AS was Off. The dedicated fixture now checks after adding the widget,
and a stronger independent-reader assertion requires AS=V and a matching AP/N
state. Product and old test bodies are unchanged by this fixture correction.
The exact previous synthetic artifact/raster and source remain retained.

The final seven focused controls pass. Strict lint has zero warnings; full spec
validation, generated coverage inventory and consistency check, root build and
web build pass. Coverage inventory is the sixth owned, derived file; no manual
readiness/status changes were made. No monetary or original tax fixture values
changed. The earlier 5/6 failures, 17/18 cached-array regression and strict-lint
warning logs remain intact.

Final author artifacts: 17 PDFs/30 pages. Fourteen clean explicit-flatten outputs
have zero fields/widgets/unresolved refs. Interactive output retains three fields
and four widgets; mixed-tag ambiguity intentionally retains one orphan widget;
invalid-original negative retains one orphan and its one preexisting missing ref.
Every saved xref/object-stream object resolves except that deliberate negative.
All notices occur once per page; all eleven actual full-return components pass
identifier literal/digit-pattern checks. Thirty pages were rendered with forms
initialized and seen on two contact sheets, plus five full-size pages. Twenty-seven
pages are pixel-exact versus unchanged-product red; one fixture-only checkbox
appearance correction is confined to that checkbox, and two new mixed-tag pages
were inspected. This verifies no introduced visual change; it does not qualify
existing physical template/footer design, PDF/UA or cryptographic signatures.

Evidence and manifests live under
`.local/upgrade-evidence/nov02-pdf-standalone-flatten/`; unchanged-product runtime
logs live under `.local/upgrade-evidence/nov02-pdf-standalone-flatten-red/`.

## Independent findings and corrected author candidate

The first distinct review withheld approval with eight passing and three failing
immutable controls. Findings receipt
`.local/upgrade-evidence/nov02-pdf-standalone-independent/independent-review-findings.json`
has SHA256 `a25176c0affe94ff439fcada3d289c82c483dc1f2bce8cdfc61102bf86e16ae1`.
The actual failures were indirect Widget Subtype classification, indirect OBJR
Type classification, and liveness references in PDFStream dictionaries. Their
original logs, malformed PDFs and absent eleventh-artifact explanation remain.

Before product edits, the author spec addendum, exact independent spec/test/reader
copies and before-product hash were frozen in `review-correction/source-first-before-product/`.
The correction dereferences the two name-valued entries and visits PDFStream.dict
in the existing reference scan. No other product behavior changed; all original
author test bodies and all eleven independent controls remain byte-exact. Adobe
PDF Reference sections 3.2.7 and 3.2.9 were refreshed to check those representations.

Corrected author verification: all 29 tests/4 files pass, root/web/contracts types
pass, owned strict lint has zero warnings, spec 6914 and generated inventory/check
pass, and both builds pass. This author rerun does not confer independent approval.

Corrected artifacts are separate from all earlier evidence: 17 author PDFs/30
pages pass the prior strict saved-object and privacy checks and are pixel-exact
against the previous frozen author outputs. Eleven immutable-review outputs/22
pages pass every expected saved-object assertion: seven clean flattened positives,
one interactive preservation output, and three deliberate negative ambiguity
outputs each retain exactly one known unresolved reference. The stream-dictionary
negative now exists because its original-object identity assertion succeeds; its
earlier failure occurred before save. Ten existing review outputs/20 pages are
pixel-exact against their original artifacts; the two new stream-negative pages
were inspected separately. All 52 pages were seen on four contact sheets, with
the two new pages also seen full-size. Extra artifact-audit script initially
mistook interactive field values for painted extractable page text; its retained
diagnostic was corrected to canonical interactive values and form-enabled render.
No product/test oracle was changed by that audit-script correction.

The exact corrected full source is frozen in
`review-correction/frozen-author-corrected/`. Distinct rerun/approval and parent
main integration, commit and push remain pending. All prior limitations apply.

## Main adoption after workspace export integration

Exact productSHA256 `64e72959df002721cdedae0681f1c4f066bdc69d3ea70285656d2df43511d481`
is unchanged from the corrected independent approval
`8871e57e103eaf3fbb529122f6fafe761d5d11bd9c284a95e48a636dc6710be9`.
The eight explicitly reviewed paths needed no merges; the stale generated
inventory was excluded and regenerated on current main. Main before-product
independent controls produce10 genuine failures/one pass, retaining actual
malformed files and original missing references.

After the product edit,29/four controls pass, root/web/contracts types pass,
strict owned lint has zero warnings, spec7008/7008 and generated inventory/check
pass, and both builds/diff pass. Twenty-eight actual retained PDFs/52pages are
separately available for the main-artifact review. Original invalid references
remain deliberate negative evidence, never filtered into a false clean result.

Main also reproduced a test-harness failure when the independent retained-output
variable was absent. The `saved` helper now uses a temporary directory and
cleans it in `finally` in that case, preserving explicit retained-output mode.
All eleven existing test bodies/assertions and the Python reader are unchanged.
The normal suite without that private variable passes11/11. The failed first
run and exact helper-only delta remain in `nov02-parent-pdf-standalone-main*`;
this is harness portability, not a product or negative-oracle relaxation.

Independent ROOT integration review approves the minimal portable harness and
all28 actual retained PDFs/52pages. All canonical fields/widgets/annotations,
unsigned signature/tag structure, text and full-page pixels exactly match the
approved corrected outputs; four deliberate original missing references remain,
zero unexpected references occur, and private identifiers are absent. Receipt
`b83a0fc79f83988f9ad680648c1d5dd86eded140ab2c25c82d1251c8268ca796`.
No fresh human or PDF/UA qualification is claimed.
