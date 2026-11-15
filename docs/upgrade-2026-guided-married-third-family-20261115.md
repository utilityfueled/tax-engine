# Guided Worksheet E three-family originals — November 15, 2026

This source package adds visible originals for the existing finite Pub974 Worksheet E method. It changes no canonical schema, tax formula, allocation rule, or filing gate. The baseline is a137b172b328684c04bac3a770ff20d63ea96334; the package was built privately while the parent checkout continued its separately owned work.

The supported cohort is one original policy shared by two married spouses filing separate returns without a PTC exception and one additional actual tax family. Primary and spouse have explicitly no claimed dependents. The third family’s complete claimed members, all actual covered people and months, both coverage-family benchmark sources, and each spouse’s actual agreement with the third taxpayer are required. Family identities, years, filing statuses, references and completeness confirmations remain original facts. Unknown dependents differ from an explicit empty list; known zero amounts and shares differ from blanks. Other allocation methods, exceptions, missing originals and conflicting records remain rejected.

The controlling formula is already implemented and specified in `spec/federal/form-8962-married-third-family.yaml`, using final2025 [Publication974 Worksheet E and the Pat/Jamie/Andy example](https://www.irs.gov/publications/p974). The published .67 agreement gives (1−.67)/2=.165, printed .17, then original APTC200×.17=34 per actual month. The full twelve-month original gives408. The dedicated UI journey uses actual one-month January originals, including first/last month1 for every original covered person and the matching frozen policy copy, so it gives34. It calculates no other family’s return. The synthetic current W2 fixture’s5000 withholding less1475 federal tax and34 reconciliation gives the visible3491 refund. These are engineering assertions, not a qualified human review.

The intake has no monetary calculation. Exact source amounts pass through the existing Decimal currency parser and canonical allocator. The guide preserves source identity and explicit facts; only untouched legacy placeholders are omitted for this explicitly selected method, whose actual no-other-allocation confirmation is required. Any entered competing fraction, agreement or benchmark rejects, including a known zero. The existing source path keeps its prior array and MFS behavior when the new method is absent.

An explicit confirmation captures a private clone of the current household, selected year/status, actual original policies, shared packet, finite source facts and entered Worksheet E originals. Conversion rejects changed context independently of UI flags. The narrowly scoped Marketplace parent and flow hooks distinguish this confirmation metadata and derived monthly rows from substantive source edits. Household and original edits revoke nested confirmation; unrelated old methods retain their default invalidation behavior. Extra original keys remain visible to the strict canonical schema rather than being silently discarded. Returned canonical records own their nested objects.

Actual tests exercise the full mounted Marketplace parent, source omission/conflicts, known zero/full shares and cents, immutable input/output boundaries, real guided workspace synchronization and hosted/provider/verified-explanation projections. The physical test saves and reopens the two-page historical Form8962, checking allocation column g=.17, columns e/f blank, lines25/27=34 and private identifiers absent. Source builders can still collect fully bound isolated2026 originals; full2026 calculations and PDF exports remain closed.

The dedicated browser source has two cases at1280/390, original30-second body limits, two configured workers, no retries and zero protected request budgets. It seeds only unrelated personal/W2 scaffolding. All Marketplace, policy, family, member, month, benchmark and agreement originals are visibly entered; the cases check the visible estimate, reload, unknown versus explicit none, false/stale sources, mobile geometry, privacy and2026 export gates. Collection is source evidence only. No browser server, hosted run or live account was invoked by this author; actual qualification remains parent-owned.

The private author and independent-review receipts record exact source hashes, retained baseline failures and final checks. Human review, external entitlement, security risk acceptance, final2026 forms and release readiness remain separate gates.

Root integration on `282f75a0` passes 972 focused tests in six files, including
strict spec references and the existing canonical allocation tests. The metadata
checks pass 1,033 tests in four files; all 9,367 spec lines have valid references,
web types pass, and scoped lint retains twelve existing warnings with zero
errors. These sets overlap and are not an independent combined test count.
The independent source review passes its 971 replay tests and 52 separate
controls. Its review digest is
`7807a44cd14f7d73ce4d194446013f36b00d23dd21c9e3321e2a6fb8c0a8e07f`.

The collected browser inventory grows from647 to649 only through the two new
Worksheet E cases. All prior case identities, policies and172 request-budget
rows remain unchanged; each new protected endpoint budget is zero. The finite
source closure has1,988 inputs, the fourteen diagnostic targets remain intact,
and the generated spec inventory adds only this guide entry. This metadata does
not establish actual browser or final combined-source qualification.
