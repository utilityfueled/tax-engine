# Shared tuition and actual account groups

Implementation from `c6df682`, frozen with the later charitable source delivery
on `405d914`. Source, browser, saved PDF and separate agent review pass for the
bounded method. This is not release or human tax qualification evidence.

Official Pub970 chapter6 Worksheet6-3 completes beneficiary PartI once and
account PartII separately. IRC530(d)(2)(C) and529(c)(3)(B)(v)/(vi) require actual
expense coordination; Notice2016-13 retains separate QTP earnings ratios.
Sources refreshed October26,2026; see the spec for exact references.

The source validator now accepts distinct ordinary ESA accounts and several
original QTP benefits against one actual tuition expense. Every linked QTP and
every ESA needs an explicit expense and credit allocation, including zero.
Each original gross and benefit, actual expense, credit and account history is
conserved with Decimal. The existing Coverdell worksheet remains unchanged.

Independent literals: QTP2500/1500 with earnings500/600; ESA4000/2000 with basis
3200/800 and earnings800/1200. Tuition8000 less assistance1000 and credit1000
leaves6000; actual QTPexpense1000/500 and ESApool4500 produce1200taxable/90tax.
Moving500fromESAtofirstQTP leavesESA4000/6000: whole-dollar account expenses
2667/1333 and earnings exclusions533/800, total1267taxable/97tax. Reallocating
within ESA payment rows alone preserves the common ratio. Actual W2withholding
is retained; browser refunds use its explicit725Medicarewithholding.

Spec and failing cases preceded the validator change: first run3failed/1passed
across2files; source-only correction then4passed/2files. Follow-through retains
all original records, saved confirmation and unknown basis, private validation,
physical5329 and reference outputs.2026 remains unavailable through public
calculation and form gates. Other education interpretations remain in the
existing method ledger and are not inferred by this source extension.

## Verified source and delivery

Immutable source tree`11e7d00d5fc055f2454f4d13cf055df622d86732` passes898tests in74files,
root/web types,5417spec references, both production builds and scoped lint with
zero errors/99warnings, primarily synthetic-fixture non-null assertions. All11
owned hashes stayed unchanged. The original3failed/1passed source regression
and subsequent7new passing cases are retained. Exact commands and hashes are
in `.local/upgrade-evidence/tuition-account-group-exact-checks.json`; test log
SHA256`f2b65f81de5e79f56e306aa0a0285bb25bc58ec614af18e82d0f830b23ceae33`.

Two production browser cases pass at1280px/390px with zero retries. Requested
worker limit2, actual single-file worker1. Both inspected screenshots retain
usable controls; settled refunds16091/16078 use the actual browser725Medicare
withholding. The source-fixture1232.50Medicare withholding remains separate.
The initial sandbox localhost denial is retained; the unchanged runner passed
with permitted local access. Task port3344 closed. Browser log
SHA256`bd8ea0fcb40d1205d41bf97350ddd3b62822bd8e6235fa2aa72530ee1f0d4dce`.

Nineteen saved PDFs,67pages and eight literal5329fields were reopened with pypdf.
Every artifact hash matches, private identifiers are absent and each page has
one review notice. Both author and separate reviewer inspected all page contacts,
all footer strips and readable source-account and physical5329pages. No amount,
clipping or overlap finding remains. Evidence is under `tuition-account-group-artifacts`.

Separate agent review passes12tests/6files, including five private controls:
three ESAs with retained year-end bases yield5401excluded/1699taxable/140tax;
actual pooled credit reassignment gives367exception/83tax; explicit zero versus
unknown, split benefit receipts, identity/year conflicts and stale records before
PDF I/O are checked. All11 source hashes remain unchanged. A first reviewer
regex expected missing instead of the actual required message; the valid source
rejection was retained and only that test assertion corrected. Review log
SHA256`ae4bac0b3f23cd521afe57a66e1e078e74d4952628fa464fab594c78cab9a18b`.
Reports are `ai-tuition-account-group-review.json` and its PDF review companion.
This review is agent software/source evidence, not independent human qualification.

Final integration on`9eafb457` adds2025.140/2026.137-law-integration-draft source
provenance and regenerated spec inventory. Calculation, privacy, filing and model
gates are unchanged. Final checks, commit and verified remote destination are
recorded in `tuition-account-group-delivery.json` and the central durable checklist.
