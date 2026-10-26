# Actual in-kind room-and-board category limit

The new method preserves original Form 1099-Q Boxes 1/2/3 and the actual provided
benefit. It limits the qualified part using actual school allowance, actual
school-owned housing charge and half-time enrollment. Source facts are never
replaced by the calculated eligible amount.

Sources refreshed October 25, 2026: [IRC 529(c)(3) and (e)(3)(B)](https://uscode.house.gov/us/usc/119-118/t26/s529/),
[Publication 970 chapter 7](https://www.irs.gov/publications/p970), and the
[April 2025 Form 1099-Q instructions](https://www.irs.gov/instructions/i1099q).
Applying the ordinary earnings fraction to this limited provided benefit is a
documented statutory/instruction interpretation. The numerical in-kind controls
are derived; they are not published IRS examples or independent human review.
The K12 definition expressly refers to cash distributions; this package does
not assume that a prepaid K12 benefit uses the same partial method.

The partial method requires one actual distribution and one room-and-board
expense/allocation for that beneficiary, with known zero refunds, assistance,
credit and other-benefit reductions. It preserves separate beneficiaries and
existing full exclusions. Mixed cash/ESA sources, shared category allocations
and assistance/credit interactions retain their separate method boundaries.
Those guards do not complete the remaining education requirement.

Derived controls: benefit 4,000, earnings 800 and basis 3,200, with allowance
3,000 and housing zero, produce qualified cost 3,000, excluded earnings 600,
taxable earnings 200 and additional tax 20. Housing 3,500 changes those last
three amounts to 700/100/10. An unrelated unallocated expense balance does not
dilute the eligible allocation. Known zero costs or false half-time status
exclude zero; unknown values reject. Allowances 2,997.50/2,997.49 straddle the
600/599 whole-dollar exclusion boundary. Exact source values above the safe
integer limit remain Decimal throughout. Original benefit and entered allocation
remain 4,000 even when only 3,000 qualifies.

Canonical controls route income and additional tax to the actual recipient,
retain outside-recipient separation and reject a false outside-owner label.
Guided collection preserves the actual school facts and blocks missing values.
Review output binds every school amount and enrollment value to its audit,
including changed housing that leaves the same maximum; it displays both original
cost and eligible cost. Saved PDFs are reopened with the pinned independent PDF
reader; every page retains its review notice and omits private source identifiers.
General 2026 and filing readiness gates remain closed.

Spec-first evidence: four source/canonical tests and the saved-reference test
failed on the original unsupported partial-benefit guard. The implementation
passes all five, then 135 adjacent cases/20 files, and 167 cases/22 files with
strict spec validation and guided school-fact preservation. Root types pass;
scoped lint and full spec references are recorded in the local evidence logs.
The previous room-and-board rejection assertion now verifies the actual result;
a separate unsupported K12 partial case retains its guard assertion. No monetary
assertions, coverage thresholds or privacy/readiness controls were removed.

The initial independent agent review reproduced a duplicate-student alias: two
opaque beneficiary IDs could carry the same actual normalized student identifier
and bypass the one-source partial boundary. The correction checks distinct actual
identities before calculation. A private, nonserializable context recomputes the
original return and binds the original/redacted source copies and education result;
no identity or identity digest appears in the PDF or audit. The actual workspace
prepares this context before redaction. Packet validation precedes template access
and writes, so stale sources/results and fabricated contexts leave no partial PDF.

The alias regression failed before its fix. A separate packet regression reproduced
template access before stale-context validation, then passed with early validation.
The corrected source/PDF/workspace cohort passes 196 cases in 26 files; root and web
types, strict spec references and scoped lint pass. A workspace assertion initially
used the wrong word, "Allowed", in the expected PDF label; it now asserts the actual
"Qualified" label while retaining both exact school amounts and owner tax amounts.
No product behavior or timeout was changed to satisfy that wording correction.
The earlier two-page saved reference was rendered and both pages visually inspected:
original 4,000, eligible 3,000, excluded 600, taxable 200 and additional tax 20 are
readable, with the review notice on every page and no private identifiers.

The first corrected tree `e65bd2aa` passed 199 cases in 27 files, root/web
types, strict specification validation and scoped lint on fresh base `b18e8e9`.
Independent rereview passed the unchanged duplicate-student probe and 70 cases,
then reproduced a second issue: the context did not bind the taxpayer whose
identity determined recipient eligibility. Both packet and direct Form5329 could
reach template I/O after that taxpayer changed. A failing persistent regression
now covers original and redacted copies. The private context additionally binds
original or exactly redacted taxpayer facts. Direct Form5329 without a context
recomputes from original input, so omitting a context cannot bypass that check.
The two unchanged reviewer probes remain available for the final rereview.

Final tree `456ba28bf91143d18e5e59bc7fd5835b56f3562f`, based on `cb8c139`,
passes 200 tests in 27 files, root/web types, all 4,860 spec references, scoped
lint and the production web build. Independent agent rereview passes 73 cases
in 12 files, including all five unchanged private probes from the two findings.
The reviewer verified original/exact-redacted source and taxpayer binding,
forged/stale evidence rejection, and direct Form5329 preparation when its token
is omitted. No further actionable issue was found within the bounded method.
Agent review does not supply human tax qualification.

All 18 reviewed non-ledger blobs are identical in delivery; only this final
evidence paragraph and its log hashes were added. Rule versions are 2025.92 and
2026.88-law-integration-draft. The final exact manifest is
`.local/upgrade-evidence/in-kind-room-board-owner-review-snapshot.json`.


- `in-kind-room-board-red.log`: `6adb23d71fda3729760df2a6af6add6d5f2c9f69ef19153d6e9377e94d00f8bb`
- `in-kind-room-board-alias-red.log`: `156b570bd7640cc96d35541d99cb61ded80510e0b09a607bbf44f1c9ff6951e7`
- `in-kind-room-board-context-io-red.log`: `8c712a847cbde2c1fe4dbe15ef1ea39a9779efc2103ac42a48e0aa3ec830ebd1`
- `in-kind-room-board-owner-binding-red.log`: `65e616464c4cc5cdc7651d5aa04941e9ffd0904353114d7e8772f5ff248d2964`
- `in-kind-room-board-direct-owner-red.log`: `8dede09ab82525036d74054ba5dc7804d687d95b4eb4703a22f3aef3def3e1db`
- `in-kind-room-board-final-owner-tests.log`: `329d49c7395d55259e0531d6fa7ba1dc121a5d50ca0e421383d37d63343dd7e2`
- `in-kind-room-board-final-owner-checks.json`: `61de439e70e532654f3fb99fbe213c9e1e3ccd1ed0aae1de71229095abb506ad`
- `in-kind-room-board-final-owner-build.log`: `bf9775f905aa60adf0eb78ab99a76362914e989849057b8e5849826bc9e366ee`
- `ai-room-board-owner-rereview.log`: `5190e5f8005994e781ce9c4fe2190b1eabbf1be7eea1c34aca7eb50d9968e92f`
