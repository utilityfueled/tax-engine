# Actual tuition coordination across prepaid benefits, assistance, credit and ESA

Sources refreshed October25,2026: [IRC529(c)(3)(B)(v)/(vi)](https://uscode.house.gov/us/usc/119-118/t26/s529/),
[IRC530(d)(2)](https://uscode.house.gov/us/usc/119-118/t26/s530/), and
[Pub970 chapters6/7](https://www.irs.gov/publications/p970).
The statute expressly includes in-kind benefits in QTP/ESA expense coordination.
Pub970 chapter6 permits a reasonable allocation method rather than requiring
its illustrative proportional allocation. The software retains the taxpayer's
confirmed allocation and does not select an election. These expected values are
derived source controls, not a published in-kind example or human qualification.

A single actual tuition benefit can now reconcile both actual assistance and
credit expense. Original4000,earnings800,assistance1000,credit1000 andQTP2000
produce400excluded,400taxable,200credit exception and20additional tax. A separate
scholarship exception still needs its own eligibility and distinct-from-credit
confirmation. Source cents straddle the whole-dollar earnings boundary.

The ESA extension requires one ordinary in-kind QTP benefit, one ordinary ESA
statement/account and one actual qualifying tuition expense for the same student
and recipient. The expense and credit allocations must conserve the respective
actual source amounts and stay within each distribution. Refunds/other-benefit
reductions must be known zero. Original ESA basis and year-end source history
remain required; no current exclusion or calculated earnings replace them.
Distinct actual students remain separate, and aliases cannot split the boundary.

With tuition8000,QTP4000/earnings800,ESA6000/earnings1200,assistance1000 and
credit1000, the actual QTP1000+credit1000 andESA5000 allocations produce
1200excluded,800taxable,200credit exception and60additional tax. Alternative
source elections with different actual earnings ratios produce different income;
no automatic redistribution overrides those choices. Outside-recipient income
remains outside this return's totals.

The shared source validator verifies original amounts and ownership without
calculating tax. The review mapping verifies those original amounts against the
calculation audit and the existing private original-source context. Balanced
allocation or assistance changes cannot reuse the original PDF calculation.
The guide uses its existing actual-source controls without new defaults.
No2026 calculation, final-form, filing or model-promotion gate is changed.

Spec-first evidence: four new core/canonical cases failed on the prior unsupported
assistance/partial-allocation guards while the invalid-source case passed. After
implementation all five passed. The saved-review case then failed on the prior
PDF conservation guard while the actual guide case passed. With the review
mapping updated, seven cases in four files passed. The immutable checks and independent review below cover this bounded package;
these results do not qualify release.

Other partial categories, cash-QTP/multiple-expense assistance and unsupported
ESA source groups remain distinct methods. The K12 cash-only annual-cap source
correction is separately queued. Mixed-owner reduced bond and broader code6
interpretations remain in the education method decision ledger.

Immutable review tree `896e727d8d933bdab21067c7a11ad89cac58d88b` on
`b2f3796434dc9c5a3843236905b792aa8818a181` passes433 tests in38 files,
root/web types,4927/4927 spec references, scoped lint with zero warnings,
and root/web production builds. Rule versions become2025.98 and
2026.94-law-integration-draft without changing any readiness gate.

Independent agent review refreshed the statutes and Pub970, inspected the
source and PDF paths, and passed the seven owned cases plus four private
probes (36 total cases/eight files including25 runner prerequisites). An unequal
earnings-ratio control independently yields1550excluded,1250taxable,450credit
exception and80additional tax; canonical2025AGI is51250. Full assistance plus
credit, actual separate students, normalized aliases, stale basis/audit, and
PDF source privacy were checked. No actionable issue was found in this scope.
This is separate software/source review, not qualified human tax review.

All three reference pages and three physical2025Form5329 pages were rendered
with Poppler and inspected. The source summary retains the8000tuition,1000aid,
1000credit and separate1000/5000allocations; Form5329lines5/6/7/8 show
800/200/600/60. Every page contains the review-only notice; no original tax ID,
account label or source reference is printed. The generation wrote nine valid
PDFs; an initial diagnostic print incorrectly treated the returned artifact
object as an array after writing the files. A subsequent artifact/object and
PDF check passed; that diagnostic error was not a product or test success.

Local evidence hashes:
- `in-kind-coordination-core-red.log`: `16fc83aef21000c6ed2b5e9b7b8538bc1fdfbf824391874e5fb10bbcc036d88f`
- `in-kind-coordination-review-red.log`: `cd050d4ea35c21df5b96d4f3c9d4ac5e5730d477597445a5968511771b67f841`
- `in-kind-coordination-final-tests.log`: `b4703511e25c8efecfa9cac44ba4f2575e0b44a34f6f952ee14821583f81f10d`
- `in-kind-coordination-final-types.log`: `57b62575408303272f53a35bb91521c93a12f3bb9290ece8c5e4752b0a7ad2fe`
- `in-kind-coordination-final-web-types.log`: `241265109987d4ba0a293371366a7f7356294fa9f1f23e6c8616c91839e0f6ad`
- `in-kind-coordination-final-spec.log`: `4e907e62444674f43495395a94a20f6c5f57af6cd97a9e21c0a706b09014cf47`
- `in-kind-coordination-final-lint.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `in-kind-coordination-final-root-build.log`: `8c0dcf86b1275eb9c56f8404fd17a9efc28ee3ceb8441cd4311bf7a873231648`
- `in-kind-coordination-final-build.log`: `1f15645e0d28f81dd4b7ee8ca191aefd83fbde37ace690ae622419818aa7d18b`
- `ai-in-kind-coordination-review.log`: `fb1ba8a96686d9c77ac45f10fc50fdd2a8484201dadc7b262235a346ee842cff`

After the ledger-only final freeze,27 readiness/rule-pack/export cases in3 files pass. `in-kind-coordination-final-readiness.log`: `29927c99b9c9fa7a69398ee7c751acb9c82765cf9a1a88a09606a806e1a2e8f0`. Product/spec/test blobs are unchanged from the reviewed tree.
