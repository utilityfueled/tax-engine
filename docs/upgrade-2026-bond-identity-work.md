# Savings-bond return identity reconciliation

Parent review of the new Form8815 intake found that independently entered bond
birth dates and beneficiary relationships could contradict the actual household.
The corrected boundary validates the registered taxpayer/spouse birth date
against the return, requires an explicit actual age-test owner for joint
registration, and binds expense beneficiaries by actual tax ID plus name to the
taxpayer, spouse or one unique claimed dependent. It never selects an older
household member automatically. Known other/unclaimed beneficiaries remain
ineligible. Error messages do not echo identifiers.

Sources refreshed October25,2026: [IRC135](https://uscode.house.gov/us/usc/119-118/t26/s135/),
[current Form8815](https://www.irs.gov/pub/irs-pdf/f8815.pdf), and
[Treasury31CFRPart321 Appendix, paragraph24](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-II/subchapter-A/part-321/appendix-Appendix%20to%20Part%20321).
The current form is2025. Section135(c)(1) requires issuance to an individual who
has attained24; paragraph24(b)(2) describes taxpayer/spouse registration and
assigned issue-month age testing. Section135(c)(2) identifies eligible household
education beneficiaries. This identity linkage implements those existing rules;
it supplies no new human qualification or discretionary mixed-owner allocation.

The new pure helper accepts actual year/status, minimal primary/spouse/dependent
identities, original redemptions and Form8815 facts. Actual sources and2026
require reconciliation; historical2025 aggregate-only preview stays unverified.
The two optional source fields preserve absence: bond ageTestOwner and expense
beneficiaryTaxId. Joint source calculation separately requires the explicit role.
No fiscal thresholds or monetary formulas changed.

Spec preceded four new tests and the helper. Initial run failed because the helper
was absent (`bond-identity-red.log`). The four cases then pass, covering wrong or
missing owner DOB, spouse and joint role mismatch, a younger named joint owner
without substituting the older primary, absent/duplicate/wrong beneficiary
identity, known ineligible recipients, and historical source boundaries. Root
types pass. Adjacent core/PDF checks and exact staged verification follow.

Parent bounded read-only review reports the owner/recipient findings resolved;
its independent rerun is separate evidence. Federal orchestration will call this
helper before calculating Form8815. The guided collector will use the same helper
against actual PersonalInfo, and the review-export privacy path will remove the
new beneficiary IDs only after calculation while retaining them in the encrypted
full-fidelity backup. Those dependent wiring steps remain explicitly pending
until their own checks and commits. Existing readiness gates remain unchanged.

Final core verification:90 tests across five files, root types and scoped lint
pass. The exact staged code snapshot `681724c` independently passes those90
checks, root types and all3849 spec references. Evidence logs are
`bond-identity-{adjacent,types,lint}.log` and
`bond-identity-staged-{tests,types,spec}.log`. Only seven owned files are staged;
the Form4137 model work, guided intake and hosting work remain separate.
