# 2026 Form 8606 ordinary IRA source projection

Commit `e4189ec734117d9728eaeb10c2c455155cc725c9`, tree
`c30cdf0b9c2c37cc75f840b43c3c974702c4b330`, projects ordinary code 7 IRA
distributions separately for each verified owner. It reuses the existing
original-statement binding and current Form 8606 engine. The scope requires
actual 2026 values for all traditional, SEP and SIMPLE accounts, current
linked 1099-Rs, a positive original prior line 14 and an explicit zero
repayment adjustment. Conversions, inherited basis, repayments, unrelated
retirement forms and unsupported distributions stay held.
[Final 2026 Form 8606](https://www.irs.gov/pub/irs-prior/f8606--2026.pdf) ·
[2025 final instructions](https://www.irs.gov/instructions/i8606) ·
[Draft 2026 instructions](https://www.irs.gov/pub/irs-dft/i8606--dft.pdf).

For the primary owner, $1,000 prior basis and rounded $2,002 balance plus
$1,001 distribution produce a 0.333 ratio, $667 remaining basis and $668
taxable. For the spouse, $2,000 prior basis and $8,000 balance plus $2,000
distribution produce a 0.200 ratio, $1,600 remaining basis and $1,600
taxable. A separate control exercises 1.000 and zero taxable. The candidate
holds cases where a three-place ratio would allocate more basis than exists.
That narrower scope does not change the historical calculation or establish
a ruling for other ratios.

The spec-linked projection and obsolete-signature checks failed before their
respective fixes. All 109 focused tests in four files passed. The three
type checks, engine build, lint, inventory and 8,855 spec references passed.
No browser request limit, coverage threshold or output gate changed.

The strict pypdf readback independently reproduced the money with Decimal,
verified 18 values and 47 widget positions per specimen, and found no
written identifiers, preparer entries or obsolete Reader signature in the
saved copies. Poppler rendered four pages, including the two ratio widgets
on both page-one images and all four review notices. Saved PDF hashes are
`0c18799cba213edf116090954b82904b7cbc34b63202036e694a7da482febeef` and
`f46510f1a9214feca14c3e6f7e7af963fc667dc075d5e40a5d3a5fc51cbac2d4`.
The separate readback receipt hash is
`fd7f92f4788185805ac1be3401dee9b80f228a1f450346068663f91681f2686c`.
Private evidence is under `.local/upgrade-evidence/nov13-form8606-ordinary/`.

Final 2026 instructions, special methods, the Form 1040 transfer,
qualified tax review and public review and filing remain pending.
