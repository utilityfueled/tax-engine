# Current Form 172: original main-home insurance

The current-loss source method now consumes the canonical Schedule A reported
mortgage-insurance amount once in regular nonbusiness deductions and separately
in alternative-tax qualified housing costs. Personal SALT remains excluded from
the alternative calculation. This closes the prior blanket rejection of positive
insurance for a finite current-2026 original prepaid FHA/private main-home cohort.
It does not change insurance allocation, tax constants or public readiness gates.

Positive reported insurance requires actual complete mortgage sources and every
insurance-qualified row bound to its actual original policy, parent Form 1098 and
main-home loan. A second-home premium rejects even when current interest is zero.
Manual annual amounts, mismatched sources, unknown original history and mixed
manual-zero insurance rows remain denied. A genuinely uninsured zero-cost second
home does not fabricate an insured row. The canonical allocator validates actual
history even when the original or rounded reported premium is zero.

The spec and literal fixtures preceded the actual first run: two genuine failures
and six passes. The first green harness still resolved the old main helper and
retained those same failures; correcting only private source resolution produced
eight passes. An initial broad scoped compiler run reached an old fixture with
11 diagnostics. Expressing identical parsed fictional facts directly removed that
legacy fixture dependency; the preserved equality test confirms no fact/oracle
change. Final author replay is 149 tests across 20 files. Distinct engineering
review passes 164 across 21, including 15 separately authored controls and
independent Python Decimal expectations. Its initial missing copied equality-fixture
import failure is retained separately from product results.

With actual fictional wages20,000, bank interest20,000 and active business loss
100,000, AGI is -60,000. Main-home interest5,000, property tax20,000 and
original premium9,240 allocated for eight of84months give reported PMI880 and
regular itemized deductions25,880. Regular Form172 line1 is -85,880, line6 is
25,880, line7 is20,000 and excess nonbusiness deductions are5,880: NOL80,000.
The independent alternative calculation excludes20,000 personal taxes, giving
line1 -65,880, line6 5,880, excess0 and ATNOL65,880. Investment-origin loss is0;
closing regular/alternative carries retain their independently computed amounts.

An actual zero premium yields reported0 and ATNOL65,000. An actual5.25 original
allocates to0.5 and reports1, producing ATNOL65,001. Distinct controls cover both
sides of rounding, zero current interest, two separately bound loans and differing
bank income. Current sources remain unchanged; no prior certification or unknown
future rate is guessed. Separate unmocked rule-pack tests still reject2026;
current-origin examples use the existing explicit test-only constants substitution.

Official sources were retrieved November5 at15:57–15:59UTC. [Form172 line6](https://www.irs.gov/instructions/i172)
and [IRC172(d)(4)](https://uscode.house.gov/us/usc/119-121/t26/s172/) establish the
nonbusiness limitation. [IRC163(h)(3)(E),(F)](https://uscode.house.gov/us/usc/119-120/t26/s163/)
contains insurance-as-interest and the provision disapplying its printed
termination; Public Law119-21 section70108(b) supplies the post-2025 effective
rule. [IRC56(b),(d),(e)](https://uscode.house.gov/us/usc/119-121/t26/s56/) supplies
separate AMT housing/NOL modifications. The2016 Form6251 eligible-mortgage
worksheet expressly includes qualified insurance as historical corroboration;
the2021 instructions support separate regular/AMT NOL limits. Neither is a final
2026 form. Three initially constructed USC URLs failed; official versioned routes
succeeded, with all failed/successful receipts preserved. This engineering
interpretation still requires qualified professional and final-form review and
does not resolve the separately held section1202 question.

Root integration on e3751fde passes 153 focused tests across20files and885
metadata tests across4files, all three typechecks, spec8,436/8,436 references,
final inventory, both builds and lint (zero errors,11,863 warnings). All4,673
source pins remain exact. Initial stale inventory failure precedes ordinary
regeneration:894entries, all893prior entries unchanged,68supported unchanged;
the new2026 spec remains unsupported. Browser action metadata is a separate
two-path successor; this tax commit does not silently refresh it. Current full
unit/coverage/browser and distribution qualification remain pending.

Frozen manifests:

- Author62: f3a4a16a4c2da448a0c5a55b40dd423e819736a7bb87d05b03b67e60267112fd.
- Distinct28: 2cbf34090cd24cf5afc35b972c70f49249e3bd31859cacc773d47acd4a5c2d4d.
- Main integration31: c02d1e47b0bf8998a6745c76f4d4dcd5d6bfefa8a8910d8b921eca5e4542e5d8.

Root authored this four-path change. The distinct reviewer authored the earlier
native collector and disclosed that relationship. No independent professional
tax approval, final2026 form qualification, filing or model promotion is claimed.

The separate browser metadata successor reviews exactly the changed pure helper
and the new, previously absent fictional fixture. Actual source audit now accepts
1,786 files; all148 file contracts/580 cases, scopes, quotas, skips and deadlines
remain exact. Distinct15prospective/16adopted-source controls pass, and root58
orchestration/cache tests plus actual public source-audit verification pass.
No new browser runtime or collection is claimed. Distinct manifest
cfc32ca93c8ac8c5a9e57b946b7d4e18cab29246f02681eb5d199d09ed1e00b7;
root metadata manifest ddd01f2df53e800f73c42943a6778faf0ef039b94d8d2121cd04ec3a94ff8148.
