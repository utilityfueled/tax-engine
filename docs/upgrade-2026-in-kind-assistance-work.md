# Actual assistance against an in-kind tuition benefit

Sources refreshed October 25, 2026: [IRC 529(c)(3)(B)(v)(I)](https://uscode.house.gov/us/usc/119-118/t26/s529/),
[IRC 25A(g)(2)](https://uscode.house.gov/us/usc/119-118/t26/s25A/), and
[Publication 970 chapter 7](https://www.irs.gov/publications/p970).
The current statute applies the actual tax-free assistance reduction to qualified
tuition costs. This bounded in-kind application of the ordinary earnings fraction
is a derived interpretation, not a published numerical example or human review.

The method requires one actual tuition benefit, expense and allocation per actual
student. The original benefit must equal the original tuition cost; allocation
plus actual assistance must conserve it. Refunds, credits and other-benefit
reductions must be known zero. Shared cash/ESA sources, multiple expenses and
unexplained reductions retain their separate method boundaries. Actual distinct
students retain separate groups; opaque student aliases cannot split the boundary.

Original benefit 4,000, earnings 800, basis 3,200 and assistance 1,000 produce
qualified cost 3,000, excluded earnings 600, taxable earnings 200 and additional
tax 20. Assistance 1,002.50/1,002.51 straddles the 600/599 whole-dollar earnings
exclusion boundary. A separately supplied and confirmed scholarship exception
can remove the additional tax; assistance alone never creates that exception.
Known false exception eligibility retains the tax, and missing eligibility fails.

The source audit binds original tuition, provided benefit, assistance, all other
reductions and the allocation. The original source records remain unchanged.
Canonical income and additional tax use the actual recipient. An outside-owner
label conflicting with the actual student identity rejects. Guided collection
preserves separate source amounts and unknown values rather than accepting an
entered current exclusion.

The private education review context now prepares every actual in-kind source
before identifier redaction. It binds original or exactly redacted sources,
calculation and taxpayer without exposing identifiers or hashes. Packet and
direct Form 5329 validation run before template/file I/O. Review references also
check assistance against the original source audit, including balanced expense
and assistance edits that leave calculated earnings unchanged. Saved reference
and full packet tests reopen exact amounts, keep the review notice on each page,
and verify that original identifiers do not appear. General 2026, physical-form
qualification, filing and model-promotion gates remain closed.

Spec-first evidence: four source/canonical cases failed on the original
unsupported partial-allocation guard; separately, the new guided and saved-PDF
cases failed at the same guard while eight existing guided cases passed.
The first canonical test draft accidentally targeted a nonexistent mock export;
that harness was corrected before the recorded four-failure source run and before
implementation. The four focused files then passed 14 cases. An initial adjacent
cohort passed 425 cases in 34 files, root/web types and 4,866 spec references before the
additional actual-workspace test. Final immutable checks and independent review
are recorded below when complete; these earlier runs do not substitute for them.

Remaining education methods are separate: shared assistance/ESA allocations,
other partial categories and qualified interpretation of the mixed-owner bond
interaction. These source guards do not complete those methods or human tax
qualification.

The immutable source tree `171915021e027fa2e4609ffee49948755ff290d4`, based on
`c89c81c`, passes 426 cases in 34 files, root/web types, all 4,890 spec references,
scoped lint with zero errors, and the production web build. The saved two-page
reference was rendered and visually inspected: original 4,000, assistance 1,000,
allocation 3,000, excluded 600, taxable 200 and additional tax 20 are readable,
with the review notice on every page and no original identifiers.

Separate agent review passes nine cases in four files, including four new
private probes for full assistance, separately sourced partial exception,
source cents, independent outside-recipient groups, order invariance, unknown
facts and original/redacted context binding. The reviewer corrected an initial
private-probe assumption about standalone summary-token requirements; full
redacted packet validation is the applicable identity boundary. Product code
was unchanged. No actionable issue was found within this bounded method.
This is agent source/software review, not independent human tax qualification.

The final patch removes one new test-only non-null assertion by retaining the
already-validated result in a constant. It also adds provenance and increments
rule versions to 2025.95 / 2026.91-law-integration-draft, preserving all readiness
gates. These final edits are verified on a fresh immutable tree before delivery.

- `in-kind-assistance-source-red.log`: `b1b12a48576ddc2ed12392f2dffe601d980f940838d972d21db22989612cad70`
- `in-kind-assistance-review-red.log`: `c0900f0da4a91096a83b4c6848e80bdb6f00c7f6d956183902022bc475238efb`
- `in-kind-assistance-exact-checks.json`: `d2cc418f41a9a0a6bf19dffbd9b13880751d766bc5b8aec29e379b48a09d40d4`
- `in-kind-assistance-exact-tests.log`: `923e809801f14e82acaa957d897370b67de35c3b6b9abe35ae304426f25b11a0`
- `in-kind-assistance-exact-build.log`: `d81417dfbad9758f8d6025c2bd1341593d171222ed6d102c693fff596fd349ae`
- `federal-review-in-kind-assistance-final.log`: `3962bcb57069ea5f343a7e9238babb27aad21515980f44d7721275cc519edbf0`


Final immutable tree `67589aba76764984b15723ee53bc95e5873144d6`, based on
`f6fd7b9`, passes the unchanged 426-case/34-file adjacent cohort, another 26
readiness/rule-pack cases in three files, root/web types, all 4,898 specification
references, scoped lint with zero errors and only six pre-existing warnings,
and both production builds. The independent reviewer also checked the final
metadata/test-only delta and confirmed unchanged calculation and readiness
boundaries. All 15 non-ledger blobs are identical to that tested final tree;
only this final evidence paragraph is added for delivery.

- `in-kind-assistance-final-checks.json`: `ded2de75610f3ed8fa6ab03fd8dfefed8b75e49cb2295096f5d6adf1774a973b`
- `in-kind-assistance-final-tests.log`: `db6d8a4519e2c7b28f5409a9a45f658d9899fed41fb7bfda5808854019469cb4`
- `in-kind-assistance-final-gates.log`: `5c6ba991869a385c72339d3f39c5e4ac5f9d8d910dd6f81e1fe79506b854f329`
- `in-kind-assistance-final-build.log`: `8ef4fe2d2a9542a52129afeb7b4bd663ebed745ab86694872ff9f07a4ab86aa7`
