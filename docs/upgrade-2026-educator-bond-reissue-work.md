# Educator reductions from actual reissued-bond sources

This bounded package consumes the delivered savings-bond reissue ledger for the
educator expense reduction. The original household, purchase funds, prior
reporting, transfer, successor and current statement facts stay independent.
Only actual redeemed interest enters the educator ownership vector. Current
transfer recognition and held successor income do not become an education
exclusion. The existing full-exclusion method retains exact owner ratios; the
existing declared method can reconcile a partial exclusion with one positive
eligible owner. A reduced exclusion with two positive owners remains guarded.

Official sources refreshed October 27, 2026:

- [Pub550, transferred and jointly purchased bonds](https://www.irs.gov/publications/p550)
  distinguishes recognition at transfer from the successor's later redemption.
- [IRC135](https://uscode.house.gov/us/usc/119-118/t26/s135/) supplies the
  redemption exclusion and expense/MAGI limits.
- [IRC62(d)(2)](https://uscode.house.gov/us/usc/119-118/t26/s62/) supplies the
  educator reduction for excluded education income.
- [Final2025 Form8815 instructions](https://www.irs.gov/pub/irs-pdf/f8815.pdf),
  line9 footnote, retain the pre-bond educator deduction for bond MAGI.
- [Final2025 Form1040 rounding](https://www.irs.gov/instructions/i1040gi) keeps
  whole-line reporting separate from the original ownership fractions.

The combined controls are independently derived from fictional originals, not
published IRS combined examples. No reissue formula, form total, source schema,
entered allocation, readiness flag or 2026 qualification gate is changed.

## Retained implementation evidence

Private base: `318127142879f68472ab8440a95f1b9abdc49234`. All work is outside the
shared main checkout. Parent owns final adoption, metadata and inventory.

The spec and six canonical cases preceded implementation. The original run
`educator-reissue-canonical-red.log` failed five cases and passed the source
rejection case, one worker, 2.07 seconds. Four failures were the explicit
changed-ownership rejection. The sole-successor partial case failed because
the unchanged-ownership reader required a prior-interest summary that the
complete reissue ledger correctly replaces. Log SHA256:
`edc47b374e71011e46591c7207e458f1c9b3dfdce61a5b43ef4b441b6cb1d09f`.

The first implementation cohort passed all eight new arithmetic/source cases,
fourteen adjacent source cases, and both original/saved PDF tests. Its two new
guided edit sequences failed because the reused unchanged-bond sequence did
not reconfirm the nested reissue history and actual statement reconciliation.
The next run retained those assertions and added the missing confirmations;
it still failed at the strict bridge because the explicit Form2210 source
packet had also been invalidated. Both 25-pass/2-fail runs are retained as
`educator-reissue-focused-attempt1.log` and `educator-reissue-focused-attempt2.log`.
These are incomplete authored interaction sequences, not waived product guards.
The corrected sequence must reach and reconfirm Payments as well as both actual
educator and bond records before restoring the preview. No runtime navigation
or invalidation rule was changed to make these fixtures pass.

The third run passed 26 cases and reached the actual payment panel; its one
remaining failure used the abbreviated expected heading `Payments` instead
of the actual `Payments & Withholding`. That failed log is retained. The fourth
run kept every substantive source, numeric, invalidation and saved-output
assertion and passed all 27 tests in eight files with one worker (7.25 seconds
in Vitest). Log `educator-reissue-focused-attempt4.log` SHA256:
`1feb97105d331b3bc4183e9ed95d2a5bd8d00d59c45b825c759ecf6cfb3be1bf`.

Root, web and contract typechecks passed. All 6,023 spec references resolved.
Scoped lint passed with zero errors and four existing non-null warnings in the
unrelated federal pipeline lines. The immutable source manifest records each
exact command and log hash. Source review, broader checks, both builds,
production browser and retained-original artifact review remain pending at
this freeze. No pending result is claimed here.

## Bounds

Actual missing or contradictory household/history facts still reject. The
reissue ledger's community-property, nonproportional two-funder split and later
ownership-change methods remain separate. Reduced two-owner exclusion
attribution is not inferred. Original source input remains unmodified; exact
ratios are retained without changing global Decimal precision. Output is a
review packet, with Form8815 represented as a reference and packet completeness
partial. Tax-year, independent human, e-file and release gates remain closed.

## Reviewed source and private final preparation

The immutable reviewed source remains `d4a323b499343e1a04d83253529d60598deb065c`.
The source-only private rebase is based on delivered actual-payment commit
`661977aabb6c9f5467ff5d4b1ef450fc81e3cfb3`. Only the existing federal pipeline
needs a three-way merge; the current actual-paid stage and NOL source handling
are retained. Metadata, implementation links, inventory and shared main/index
remain parent-owned. Final delivery is not frozen by this preparation.

The immutable affected cohort passed 2,207 tests in 223 files with one worker.
Root and production web builds passed. Root, web and contract types, 6,023 spec
references and scoped lint (zero errors, four existing warnings) passed. The
frozen inventory check correctly failed because the new spec is not yet in the
generated inventory; that exact failure remains retained for final integration.

Production desktop and mobile checks passed 2/2 with one worker and zero retries.
This is focused saved-interview edit, nested and outer reconfirmation, reload,
Payments to Final Review and actual download evidence. Completed sections were
seeded and the saved phase remains interview. It is not the separate comprehensive
upload-confirm-calculate-export-reopen-delete release traversal. The initial
localhost permission failure occurred before assertions and remains retained.

The author reader independently derives values with Python Fraction/Decimal
from nine saved fictional originals, without using engine results as an oracle.
All 53 PDFs/217 pages/224 populated fields reopen; 78 physical/flattened values,
429 reference rows and 224 appearance checks pass. All nine contacts covering
131 merged pages, nine footer sheets, 27 readable tax/reference pages, three
full covers and four browser screenshots were personally inspected with no
visible issue. Report `educator-reissue-author-final-evidence.json` SHA256
`e589598b779f42b856cc6dd930aa8d61add9f0cdab3b5da395f6d74e2687a994`.
The original artifact manifest and all 3,695 frozen/producer source hashes remain
unchanged; the generator is not an authored test or independent reviewer.

Parent independent source review passed 35 tests/9 files, one worker, including
eight original-derived private controls. Report
`parent-educator-reissue-source-review.json` SHA256
`29be3c31190319d8a95c2c6574d01b0863f7ce161a7bfb13c5f34fc6a21b395b`.
The original reviewer-only fraction-normalization fixture failure is retained;
the corrected probe uses exact rational cross-product equality. The eight probes
will run unchanged in the final private integration cohort and are not delivered
as package source. Independent original/PDF review and final integration checks
remain pending at this preparation checkpoint.

Dependency attribution is corrected separately without changing the initial
source manifest: its unused unpatched pako store entry was not actual runtime
resolution. Frozen broader/build/browser/producer receipts verify Node's actual
pdf-lib dependency resolves to the reviewed pako 1.0.11 patch, deflate SHA256
`f537b12f55f31f9af74b162d0ad6b3667c78c356875f18c9f56be4db419d6ccc`,
patch SHA256 `d41a50bfb404925c968ae99ca11a824bf057a67692637c9ecb44bdd99eb90e04`.
The correction and separate copied-prose chronology erratum are retained.
Earlier checks without execution-time resolution are not retroactively assigned
provenance. Human tax, year/form, selected-state, production and e-file gates stay
unchanged.

## Independent saved-output closeout and final integration candidate

Parent independent original/PDF review is complete for the immutable source and
saved outputs. Report `parent-educator-reissue-artifact-review.json` SHA256
`c1bed30e24fc7e7283676c61430ce0543f8cc6f97522db51de6472714b0efbaa`
binds 11,287 passing checks, all 53 PDFs/217 pages/224 populated fields and nine
original source cases. The parent personally viewed all eleven page contacts,
eleven selected readable details and four actual browser screenshots. Values
were independently derived from originals; stored engine results were only
hash-verified. Detailed-check receipt SHA256:
`820e0e49f90de1eadee6f6409c7993329e99c259a9d398ba6d6dd995b5c66126`.
There is no remaining finding in this bounded output review. This is independent
agent review, not qualified human tax review or comprehensive release traversal.

The parent adds rule metadata `2025.183` and `2026.180-law-integration-draft`
and one implementation association to the private candidate based on
`661977aabb6c9f5467ff5d4b1ef450fc81e3cfb3`. The final generated inventory,
unchanged eight private controls, adjacent merged-context tests and combined
production builds/browser remain the next integration checks. Existing 2026,
physical-form, selected-state, human tax and e-file readiness flags do not change.

## Final current-source checks and delivery freeze

The combined candidate `e13cdc516ee626b413de1166a68f83953d2c43a4`
on actual-paid base `661977aabb6c9f5467ff5d4b1ef450fc81e3cfb3` passed
51 tests in 13 files with one worker (10.13 seconds in Vitest), including all
eight parent controls unchanged plus current actual-paid 2025/2026, changed NOL
filing-unit and COD canonical adjacency. Log SHA256
`e0f2241f1e7881427d0aaa3c0cfff4ca4630b636297cb23e2b8854ee87c8e042`.
The private independent probe remains outside delivered source.

Root, web and contract typechecks, all 6,064 spec references, generated-inventory
verification, scoped lint (zero errors/four pre-existing federal warnings), root
build and production web build passed. All 3,742 tracked source hashes remained
unchanged after each check. Inventory retains all 570 predecessor entries and
154 associations exactly; it adds the linked coordination spec and discovered
ownership helper, yielding 572 entries and 155 associations. The prior frozen
stale-inventory failure remains separate and is not erased.

Production desktop/mobile checks passed 2/2, one worker, zero retries, 20.21
seconds; localhost3485 was closed. Log SHA256
`7f00e8a34f411704fd854cbcf19a2965d31ac87cfc867d02135494ad295f1262`.
The two complete saved original JSON objects match the independently reviewed
browser originals. All 30 new PDF page texts and whole-page rendered pixel hashes
match those prior outputs exactly; flattening, notices, privacy and partial
Form8815 reference covers remain intact. The author personally viewed both new
contacts, three readable pages and four actual UI screenshots. Final comparison
`educator-reissue-final-browser-comparison/checks.json` SHA256 `f6cc0c89636dc9ae158c2d7ea99c8eb2b18bae6e14531cf91b2f2f86fed9f054`;
visual closeout SHA256 `4393e97661c50c68a310505088675f8c1bafc7081a4f568da22f04f263e97654`. This inherits the independent original-derived
numerical evidence through exact source/output equality; it does not claim a
second independent review or comprehensive interview/release traversal.

The final delivery freeze changes only this evidence ledger from the tested
candidate. Fifteen original reviewed product/spec/test paths are byte-identical;
the sole executable merge in federal.ts adds the same two actual taxpayer and
Form8815 source arguments while retaining all delivered health/NOL stages.
Parent-owned rule provenance/one implementation link and the generated inventory
are included. Main/index remain untouched; adoption, commit and push are the
parent's remaining delivery steps. No readiness or external qualification gate
is promoted.

## Parent delivery checks

Parent verified all 3,742 frozen source hashes and adopted the 20 owned paths
from `6ab98a31` on `661977aa`. Fifteen originally reviewed blobs remain exact;
the only executable merge supplies the same taxpayer and Form 8815 context to
the educator calculation. All 570 preceding inventory rows and 154 explicit
links remain unchanged; the inventory adds two rows and one link. Rule versions
are `2025.183` / `2026.180-law-integration-draft`.

The main checkout passes 43 tests in 12 files, one worker, all three type checks,
6,064 spec references, the 572-entry inventory check and the engine build.
Receipt: `.local/upgrade-evidence/educator-reissue-main-checks.json`, SHA-256
`d15550922a1e887057e5c34627d1ae667c2b65d4f45eb7001a3a5ef4d6690ab4`. The exact adopted runtime already passed
both production builds and desktop/mobile checks in the private final cohort;
only delivery documentation changed afterward.

Parent separately compared the actual final browser originals and downloads
against the independently derived and visually reviewed originals. Both saved
states are byte-identical; all 30 page texts and full-page rendered pixels
match. Comparison: `.local/upgrade-evidence/parent-educator-reissue-final-download-comparison.json`,
SHA-256 `68f101ac7a229d0ca9e52cfe980461149024a4d75e2c527e28069f36460f6919`.
Final delivery record: `.local/upgrade-evidence/parent-educator-reissue-final-delivery.json`,
SHA-256 `787b4040dbe006e0548403de23bcff598a53e5f5f97a49f37e1e4192dc62d40d`.

These are focused synthetic edit/reconfirmation/reload/download checks and
independent agent source/output reviews. They do not establish a fully
traversed release interview, human tax review, final 2026 forms or filing
qualification. No readiness or privacy gate changed.
