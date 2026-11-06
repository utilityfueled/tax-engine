# Shared-method inventory reconciliation

This package corrects implementation traceability only. It starts from
`dbe9bb0beeb6721a1cb99e1a864f7034e888f5b2` and preserves all 45 existing
explicit associations. The inventory generator otherwise looks for a file with
the specification's name, which misses methods implemented in shared federal,
schedule and form modules.

The manifest adds 76 explicit associations. Each names an existing engine file
and regression references already present in that method's own specification.
Where an existing historical review mapper is linked, its own specification's
output tests are also retained. Runtime code, specifications, test assertions,
coverage exclusions, thresholds, rule versions and readiness gates are unchanged.

The preliminary audit inspected import paths, then checked the named test bodies
and their local setup/helpers. This found several first references that tested
only a constant or another helper. The final links use the actual calculation
references: for example, the sales-tax receipts calculation instead of the Texas
rate assertion, and actual 2026 Schedule A groups instead of an unrelated legacy
gambling case. These are traceability checks, not tax-law verification.

Exactly 76 existing inventory entries gain their previously unrecognized engine
path. The inventory contains the same 525 specifications; their jurisdiction,
year, authority, specification, test-presence and e-file/business-rule flags are
unchanged. No entry becomes fully supported. Interface, transport, model/data
and control specifications without a relevant engine implementation remain
unmapped by this narrowly scoped engine/packet manifest. Remaining scenario
exclusions retain their own gates; a path association is not additional scenario
support, a qualified final form or independent human review.

The initial private base 2bd4fdd passed 528 tests in four files, all 5,536
specification references and deterministic inventory generation/checking. Its
first test attempt stopped before execution because the isolated archive lacked
the pypdf path; the retained prerequisite failure was resolved by selecting the
existing pinned Python environment, without changing a test or source file.
Final rebased checks and separate review are recorded below before delivery.

Local evidence is under `.local/upgrade-evidence/inventory-reconciliation-*`:
the original and selected associations, source hashes, exact commands, retained
prerequisite failure and invariant comparisons. No live provider, staging,
filing or publication qualification is claimed.

## Rebased verification

On the exact dbe9bb0 base, deterministic generation and its independent check
pass with 525 entries and 5,545 specification references. The manifest,
inventory, specification-reference and rule-pack suites pass 529 tests in four
files. The invariant comparison preserves all 45 prior associations and changes
exactly the 76 intended rows. It confirms no changed source authority/year,
new test-presence flag, business-rule/e-file flag or fully-supported status.
The two generated files and this ledger are the entire package. Separate agent
review and committed-tree comparison remain pending.

## Independent review correction

The separate reviewer found one false packet-generation association in V1:
`federal/nonitemized-charitable-election` selected the historical Form 1040
mapper, but the named PDF test exercises its rejection guard. V2 removes that
packet path and preserves the missing-generation gap. The valid engine link and
both own-spec calculation/rejection references remain. No runtime, assertion,
coverage or readiness behavior changes. The original three-path V1 tree
`be163ca045c62396a07d4b0844521dca966e2126` is retained unchanged. The other
engine and historical output associations remain subject to the completed
separate review, and exact V2 checks are retained independently.

The independent V1 review traced all 76 engine links and the selected output
calls, with 121 selected tests in 91 files (521 intentionally excluded by the
name filter), plus 529 manifest/inventory/reference/rule checks in four files.
An unchanged unavailable-output regression passes; the independent expectation
that its inventory flag remain false reproduces the single V1 finding. The
review is `facts-inventory-reconciliation-review.json`, SHA256
`e22be2e8aa4a835680e661937c6da9d80608923a39f446215793be62224bacec`.
V2 again passes 529 checks, all 5,545 references, and deterministic inventory
generation/checking. Its exact logs use the separate
`inventory-reconciliation-v2-*` paths. V1 command receipts remain historical;
the parent's mutable V1 final log paths were overwritten during V2 execution,
so those old receipts are not presented as retained exact-output files. The
independent V1 source, reviewer logs and original failing probe remain retained.
