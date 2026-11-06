# Educator expenses and actual in-kind education benefits

This package uses verified excluded earnings from a fully qualified prepaid
529 tuition benefit when calculating the actual recipient's educator expense
reduction. It does not subtract the gross benefit, returned basis or valid
transfer earnings. The other owner's earnings do not reduce this educator's
expenses. No taxpayer-entered exclusion replaces the verified source result.

## Sources and interpretation

Refreshed October 25, 2026:

- [IRC62(d)(2)](https://uscode.house.gov/us/usc/119-118/t26/s62/) reduces educator
  expenses by the relevant sections135,529 and530 exclusions without imposing
  a cash-only distribution condition.
- [IRC529(c)(3)(A), (B)(i) and (iv)](https://uscode.house.gov/us/usc/119-118/t26/s529/)
  treats the provided tuition benefit as a distribution and excludes its
  otherwise includible earnings when qualified.
- [Final2025 Schedule1 line11 instructions](https://www.irs.gov/instructions/i1040gi)
  describe the education earnings/distribution reduction. The educator paragraph
  in [Publication529, December2020](https://www.irs.gov/publications/p529) is
  historical corroboration for earnings-only treatment, not a2026 parameter source.

The combination is a bounded statutory/instruction interpretation, independently
read by a separate agent. It is not a published IRS numerical example or human
qualification. Partial or credit-reduced in-kind benefit allocation, unknown
medium/qualification and mixed-owner partially excluded bonds remain separate
methods. Existing year, filing and readiness gates are unchanged.

## Literal controls and review

Actual prepaid tuition4000, earnings800 and basis3200 with1000 educator costs
produce a200 adjustment and49800 AGI on50000 wages in both supported test years.
The actual benefit ledger, source/recipient/year and exact Box1 reconciliation
remain mandatory. Declared reductions0,3200 and4000 reject. Earnings800.49/800.50
round to800/801 as the source calculation requires; zero earnings retain zero
reduction. Missing records, unknown medium/qualification, wrong year and a
one-cent source mismatch reject; original input remains unchanged.

Spec entries preceded three failing tests at the old cash-only guard. After the
narrow medium change,23 focused and96 adjacent cases in11 files pass, with root
types,4763 spec references and scoped lint (zero errors/warnings). One old negative
test still rejects its inconsistent declared zero, now at the correct reconciliation
guard; no assertion or source/readiness control is removed.

The separate federal agent passed14 cases in four files, including two private
controls: actual primary/spouse in-kind earnings800/200 reduce respective1000/450
costs to200/250 (450 total,49550 AGI), while zero earnings with4000 basis retain
the300 statutory deduction. Partial benefit sources still reject. Review found
one stale cash-only specification sentence, corrected without a calculation
change; no actionable calculation finding remained. Agent review is not tax
professional approval.

The frozen source manifest is `.local/upgrade-evidence/educator-in-kind-snapshot.json`;
its initial isolated base is998d55a. Final integration tree `3235047599ee06c2eea9d1ccc5a5ee747f4a10e1` is based on
`6f2b577`, after the reviewed Marketplace and adoption PDF packages. Coordinated
rule revisions are2025.83/2026.79; all qualification gates remain unchanged.

Evidence SHA256 under `.local/upgrade-evidence/`:

- `educator-in-kind-before.log`: `c9b4b038b60203751752e9d011192a605b8d7235ffb22fc94e1ace4e7162ee0d`
- `educator-in-kind-focused.log`: `7b1affefa1ff981247d8282ec596398e6e25bb5ff8c3a0cb04f04426590c5ecc`
- `educator-in-kind-tests.log`: `1cd227f65b2c3d9ea7578c78d517c64bc798aeb551a60210c1c17c11aa6eec6e`
- `educator-in-kind-types.log`: `f21d250a4648eb4ee2932b98d9b512f777087469e523531da5db57dcc123eb96`
- `educator-in-kind-spec.log`: `02c42b01ea24089959e0b911a147f0fda4ca341aeb35956cbd8c89a2f90342c8`
- `educator-in-kind-lint.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `federal-review-educator-inkind.log`: `457401c2a0d68909da0e99a66bb362e694b579c4af022abb2a620dd881d95208`

Final integration passes43 cases in five source/canonical files and the separate
38-case metadata/strict-spec/educator-limit run across four files recorded below. Root types,4784 spec
references and scoped lint pass. The first focused command included three
nonexistent filter names; only its actual43 cases are counted. The intended
metadata and educator-limit files were then located and run separately.
No product change followed independent review; only the stale spec wording and
the new spec title (excluded earnings, not earned income),
rule provenance and evidence were updated.

- `educator-in-kind-final-tests.log`: `ab5fcc1a963390cf3b1eadb9827642c4161ba52472383e0a16374423e13cb600`
- `educator-in-kind-final-metadata.log`: `2a8912afd1bf9c8c08731d31cbbdaa8a083dd258f95a6f9bfa8a53cda816eb23`
- `educator-in-kind-final-types.log`: `778a6005e132fbe97fbb32d5fdb193a25ae03c3ca829a6b64f7edca82b552dee`
- `educator-in-kind-final-spec.log`: `d56db8125c9636db8ae1d73b73c0a65f160d002280666fbfa5d35096d1fc3ff9`
- `educator-in-kind-final-lint.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
