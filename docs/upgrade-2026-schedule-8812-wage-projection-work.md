# Confirmed wages on final 2026 Schedule 8812

`5c6633e2` projects a redacted 2026 Schedule 8812 specimen for one or two
confirmed qualifying children with W-2 wages. The calculation binds the
actual year and owner of each original, exact wages to Form 1040 line 11b,
and each Code Q amount or confirmed zero. It uses a separately confirmed
Credit Limit Worksheet A line 5. It checks that the Decimal calculation and
the displayed whole-dollar worksheet agree on the phaseout, both credits
and the $2,500 earned-income branch. It preserves the printed stop branches
and leaves line 19 blank below the threshold. Foreign and possession
adjustments, other dependents and Worksheet B remain outside this specimen.

The byte-checked [IRS ATS scenario 14](https://www.irs.gov/pub/irs-efile/ty26-1040-ats-scenario-14.pdf)
shows $2,023 CTC and $2,377 ACTC on pages 6–7. The independently confirmed
Worksheet A limit supports that example. The [final Schedule 8812](https://www.irs.gov/pub/irs-prior/f1040s8--2026.pdf)
and [draft instructions](https://www.irs.gov/pub/irs-dft/i1040s8--dft.pdf)
support the printed transfers and branches. The final parent form, final
companion instructions and qualified human review remain required for full
qualification. The candidate is outside the public export and filing registries.

Four projection tests failed before implementation. All 78 focused tests
passed after implementation, along with engine and contracts types, engine
build, scoped lint, inventory and 8,863 spec references. A separate strict
PDF reader and Decimal check reopened the saved annual specimen and verified
41 widget locations, 26 text values, six checkbox states, nine blank text
fields, two review notices and removal of active content and legacy reader
rights. Both pages rendered and were visually inspected at 115 DPI.

Private evidence is under `.local/upgrade-evidence/nov13-schedule-8812-wage-only`.
The saved PDF SHA-256 is
`86f6a52a80349964fe3fd29869f00e1fc50bf62a2ce50f3fc6a7ae200346acce`.
The focused green log SHA-256 is
`0094289dd0e8380bdada61ace9c68e5dd0e266c755ff49ea87f9bc84f0dab394`.
