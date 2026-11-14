# Form2555 mixed domestic and foreign capital-material services

This package admits a complete original-source method for a location-separated
service-fee business in which capital is material. It keeps actual domestic
profit in QBI and applies the existing business-wide earned-income cap to the
sum of actual foreign and domestic reasonable service allowances. It does not
allocate an exceeded cap or infer geographic receipts or expenses.

The method requires the actual business year, owner, name/EIN, matching original
income-document reference and complete confirmed service-location, expense and
allowance records. Actual foreign and domestic gross reconcile to ScheduleC;
actual foreign and domestic expenses reconcile to the completed canonical
calculation. The allowed cohort has no inventory/other gross income,
unallocated expenses, prior service receipts, domestic or foreign losses,
foreign-ECI/recharacterization method, or wage/property allocation. Actual
original W2 wages and UBIA must each be explicitly zero and reconcile to the
business. Canonical default zero alone supplies no original fact.

The existing all-foreign and mixed noncapital methods remain separate.
Eligibility, election, ownership, prior-history and loss gates remain. The
source validator accepts the actual2026 source year, while the incomplete2026
full calculation and annual export gates remain closed. No guided intake,
physical mapping, model promotion or qualified human acceptance is established.

The controlling source distinctions are:

- [IRC911(b)(1)(A), (d)(2)(B), official2024 Code edition](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapN-partIII-subpartB-sec911.htm)
  and [Reg1.911-3(a),(b)(2)](https://www.govinfo.gov/content/pkg/CFR-2025-title26-vol12/pdf/CFR-2025-title26-vol12-sec1-911-3.pdf)
  separate actual foreign services, reasonable compensation and the total
  trade/business30% net-profit limit.
- [Final2026 Form2555 instructions, line20](https://www.irs.gov/instructions/i2555)
  subtract the employer-equivalent SE deduction before that cap. This final
  annual source was already documented; it is not a new publication delta.
  [Publication54(12/2025), Example3](https://www.irs.gov/publications/p54)
  instead uses30% of54147 without that deduction. The existing stricter
  instruction-based gate and the qualified-review question are preserved.
- [Reg1.861-4(b)(2)(i)](https://www.govinfo.gov/content/pkg/CFR-2025-title26-vol11/pdf/CFR-2025-title26-vol11-sec1-861-4.pdf)
  requires actual source facts. This method requires separately documented
  service locations and amounts; it calculates no receipt/time allocation.
  [Reg1.911-6(a),(d), Example2](https://www.govinfo.gov/content/pkg/CFR-2025-title26-vol12/pdf/CFR-2025-title26-vol12-sec1-911-6.pdf)
  and Pub54 Example3 support actual expense attribution and the foreign-gross
  denominator used by the existing line44 method.
- [Reg1.199A-3(b)(2)(i)(A)](https://www.govinfo.gov/content/pkg/CFR-2025-title26-vol4/pdf/CFR-2025-title26-vol4-sec1-199A-3.pdf)
  and [IRC864(c)(3),(4), official2024 Code edition](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapN-partI-sec864.htm)
  distinguish domestic QBI and foreign income. The finite service-only contract
  retains the original classifications and excludes separate foreign-ECI methods.

All eight official public bodies were retrieved successfully on November14.
Their exact bytes, revision boundaries and digests are in the private research
receipt. The older Code edition is identified explicitly rather than described
as a newly consolidated2026 statute.

The independently derivable fictional case has gross200000, foreign120000 and
domestic80000; actual expenses70000 and30000; and service allowances10000 in
each place. Both allowances sum to20000 for the cap. The current2025 ScheduleSE
rounds Social Security11451.40 and Medicare2678.15 separately to14129 total,
then the half deduction to7065. Foreign net profit50000 leaves QBI; domestic
net profit50000 remains. Foreign expense attribution5833.333… plus the actual
foreign SE-deduction share3532.5 produces line44=9366, net exclusion634,
AGI92301 and domestic QBI deduction9294. Aggregate allowance27880.50 passes
the existing cap;27880.51 rejects. These are synthetic cases, not IRS examples.

Spec-first tests reproduced the actual former mixed-business guard: four
positive failures and one passing negative matrix. A separate actual mutation
showed an edited business document reference admitted before its binding fix.
Independent review then identified positive canonical wages/UBIA admitted at
zero foreign net profit; both admissions were reproduced before the narrow
explicit-original-zero correction. Final author checks on an isolated exact
`6bacf7629bfc0e09680a8ef9d8ae5ec1b5daed12` archive plus only this package
passed9files/1069tests, including928 strict specification checks. Eight new
tests cover manual amounts, exact cap endpoints, zero/missing facts,
incomplete/contradictory originals, actual verified-AI and hosted/provider
privacy projections, immutability and closed2026 gates. Project TypeScript,
owned lint and all7 scoped specification references passed.

Private evidence is retained under
`.local/upgrade-evidence/nov14-fei-mixed-capital-source-research/`:

| Receipt | SHA256 |
| --- | --- |
| Research and official-source inventory | `556da210ac1769b372ec800a348f0abe3d7f0c94ef1b11f46347570dbd0e2cf1` |
| Final eight-file target source freeze, v2 | `e9d3fd123f15480d01e42db2b85b19cb59d5f0243f1a6c0d94c4134bc060f2d4` |
| Final author verification, v2 | `3cf282aa8fc8481215caa68d5de41f312868ec769e06bf2d27f4ec3d3e7e1624` |
| Independent v2 source review | `2be85e98c48ffbe9f75650d6e40f3ace58e5433d61b3277cb0331956c9e5b6f9` |

The source freeze distinguishes exact reconstructed shared-file seams from
other agents' concurrent farming work. Prior source versions and failed
expectations remain retained: the initial SE oracle incorrectly rounded a
combined tax rate, an initial2026 test incorrectly expected the closed rule
pack to calculate, and a source-reference test initially hit a schema
prerequisite. Corrected meaningful failures and passing runs are recorded
separately. A sandbox-only `tsx` IPC failure was followed by the normal
`node --import tsx` specification check. None is reported as a tax-engine fix
or as passing evidence.

Independent v2 source review verified all eight isolated target blobs, six live
owned files, eight official source bodies and eight preserved v1 blobs. Its
four additional behavioral cases and eight author tests passed (12 tests in
two files), including rejection of the originally reproduced zero-foreign-profit
wage/UBIA cases. The review is retained in
`.local/upgrade-evidence/nov14-fei-mixed-capital-independent-review/REVIEW.json`.
Qualified tax review, broader business source/expense methods and annual release
gates remain pending; this ledger accepts no missing taxpayer fact or human
decision.
