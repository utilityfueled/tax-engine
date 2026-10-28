# Minimum tax credit from the actual source year

Section 108(b)(2)(C) reduces the minimum tax credit available at the beginning
of the following year. The current Form 8801 line 26 does not include the
signed adjustment from the current year's alternative minimum tax. That
adjustment can be negative, including when actual current AMT is zero.

This package exposes the existing Form 8801 Part I and III calculation through
signed line 18 as an explicit source-year mode. It accepts actual 2024, 2025 or
2026 source-period facts. It never reads a later-year regular tax, tentative
tax, credit balance or credit use; it returns no later-year limitation, credit
or carryforward. Source-only audit rows identify a calculation worksheet.
The full 2025/2026 form API retains its prior-year rules, labels and return type.
A full 2027 form call remains unavailable.

The [2025 IRS instructions](https://www.irs.gov/instructions/i8801) identify the
exclusion-only NOL deduction and foreign tax credit as separate worksheets.
They cannot be replaced by the ordinary or alternative-tax amounts without
their actual source calculation. The source-only primitive still requires
those completed worksheet amounts and confirmed complete source facts.
Canonical current-year debt-cancellation intake must derive and bind them;
this primitive alone does not enable that integration or accept a deduction
override in the return.

The 2026 constants come from the immutable indexed pack and
[Rev. Proc. 2025-32 sections 3.03 and 3.10](https://www.irs.gov/irb/2025-45_IRB).
[Section 55(d)(4)(A)(ii)(IV)](https://uscode.house.gov/us/usc/119-124/t26/s55/)
substitutes 50% for 25% throughout paragraph (2), including the MFS additional
amount. Its 2026 starting threshold is $500,000 + $70,100 / 50% = $640,200.
The historical source years retain their own tables and 25% rate. These
authorities were retrieved October 28; the versioned section 55 page states
currency through October 15. A separate versioned section 53 request failed;
no fresh section 53 body retrieval is claimed.

## Spec-first evidence

The private source starts at `183c1bbcb9ed8d53265fb4f36317e291bc8134cc`.
Archive SHA256 is `0724b112f94888751818b25517193806275e18431c43fdb54419ba99eac1e7c2`.
The specification and six tests preceded runtime changes. The first red has
six intended failures in one file; its log SHA256 is
`78abf8124b1b3d239d1c2314fa560bebce6751e4f7855414afdf46171cf66ec7`.
The unchanged baseline runtime hash is
`3c5a9f09eedbfd95922b07436befb595714aee6df877ec461376e7a094111015`.

The initial implementation passes those six tests. The first typecheck exposed
TypeScript's last-overload ReturnType selection changing the canonical full-form
type. Reordering the overload declarations preserves that established type;
the second typecheck and six-case run pass. An initial YAML separator typo was
corrected without changing an expected number; its original spec hash and the
failed typecheck remain in the local evidence. Additional assertions preserve
actual zero AMT with a negative adjustment, source-only audit labels and an
unread future-year getter.

The independently derived controls cover source-year exemptions, positive and
negative adjustments, actual ancillary worksheets, the 2026 phaseout and MFS
cap, cents at the whole-dollar boundary, preferential capital gains and foreign
earned-income stacking. They are synthetic controls, not published IRS examples
or qualified human review. Historical adjacency, independent source review and
final integration evidence follow below when completed.

This package does not qualify a final form revision, enable filing or establish
hosted, provider or human-review readiness.

The exact private package passes 83 tests in eight files, including both historical
full-form cohorts, canonical current credit use, original-source validation and
the existing Form 8801 reference PDF. Root types, all 6,159 spec references,
inventory generation/check, scoped lint with no warnings or errors, and the
engine build pass. Inventory adds one partial entry (581 total) and one explicit
implementation association (162 total); every preceding row is preserved. Rule
versions are 2025.189 / 2026.187-law-integration-draft. At that freeze, independent
source review was pending; its completed result follows. No UI, final PDF or
current COD integration is claimed by this primitive.

Independent source review clears the frozen tree
`0415ca372b19a31088b6e19e56973ec7c6ab7c81`: 63 tests in four files include six
private source-derived controls. Its separate 2026 MFS control retains a signed
−$10,011 adjustment with actual zero AMT. All seven owned files, 3,826 tracked
regular files and six symlinks match before and after review in both source
copies. Report `complete-mtc-source-year-independent-review.json` has SHA256
`66e129985d54c785c8591c315b1dd8d8a6309aa8c6f90b76737f227c3e10799e`. The original
six-case red, first failed typecheck and subsequent passing checks remain
retained. This is independent agent software/source review, not human tax
qualification. Parent adoption preserves the six non-ledger blobs exactly; this
ledger only adds the later review record.

The adopted main-branch package passes the same 83 tests in eight files, all
three typechecks, 6,159 spec references, the inventory freshness check and the
engine build. Logs and SHA256 receipts are retained under
`.local/upgrade-evidence/parent-mtc-source-year-main-*`. The main integration
checks ran on `6f8aa98e` plus these seven reviewed paths. The remaining
source-year-to-current-return binding is tracked separately.
