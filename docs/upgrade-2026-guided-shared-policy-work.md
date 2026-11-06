# Shared-policy source intake

This package makes the committed Form8962 Situation4 agreement method available
through the guided return. It does not change the allocation arithmetic or open
the2026 return/PDF qualification gates.

The original statement retains its actual year, recipient, every covered person,
coverage periods and exact monthly amounts. An explicit copy action captures
those originals and the actual return household. New agreement percentages,
family assignments and confirmations start unknown. The source calculator binds
that copy to current originals and household, validates the actual agreement,
and derives premiums, SLCSP and advances without a user calculation override.
Independent monthly eligibility answers remain separate. Substantive changes
revoke both source confirmations; confirmation-only edits do not cycle.

The consumed Form8962 allocation input type was narrowed to actual fields the
function reads, so source-only guide validation needs no invented income,
address or other return context. No calculation formula changed.

Sources: final2025 [Form8962 instructions](https://www.irs.gov/instructions/i8962),
Situation4 and PartIV lines30–34, as implemented and reviewed in
`form-8962-shared-policy.yaml`. The supported method requires two families,
positive original APTC, correct original SLCSP, actual agreement fractions at
the printed precision and nonoverlapping policy months. Marriage/divorce,
no-APTC allocation, overlapping policies and7206 coordination remain separate
internal methods. Their actual source answers are retained and rejected here.

Evidence in `.local/upgrade-evidence/`: guided-shared-policy-red.log records the
missing adapter failure; guided-shared-policy-dom-red.log records the missing
full credits control. A further red case demonstrates that normalized month01
must not silently duplicate month1 when refreshing actual eligibility answers.
The literal30000wage/.50 agreement case independently yields4812allowedcredit,
3000advances and1812net. Exact cents, stale identity/originals, actual0/1,
unknown eligibility and saved-source confirmation cases accompany it.

Final immutable checks, independent review and browser evidence are recorded
below before commit. Agent source/software review is not human qualification.

## Final verification

The frozen executable source in tree `dd02ffef2b1cb19b5428492a92c9c4e73a0bd3ac`
(on `f2d0faa`) passed 832 tests in 94 files, root/web/contracts types, all 4,840
spec references, the strict spec structure checks and the production build.
Scoped lint has zero errors and 59 non-null warnings, including the new fixture
assertions. Logs are `guided-shared-policy-exact-{tests,types,spec,lint}.log`,
`guided-shared-policy-{contracts,web-types,build}.log`.

The independent facts reviewer refreshed the current official Situation4
instructions and passed the six owned source/DOM tests plus three private
probes: disjoint policies at25%/75% conserve the final credit/advances; equal-money
identity, coverage and source-index changes reject; actual1000.01 times.33
retains cents and unknown monthly eligibility stays unknown. There was no
actionable finding in this bounded review (`facts-review-guided-shared-policy.log`).
The private review probes are excluded from the product patch.

Production browser tests passed at1280x900 and390x844 with zero retries. They
verify substantive-edit invalidation, confirmation-only stability, an actual
zero agreement share, original/derived amount conservation, known eligibility,
save/reload of zero and unknown values, and no original identities/references
in outbound request bodies. Both screenshots were inspected; neither viewport
has horizontal overflow. The first browser run used a global alert-count
assertion, which also matched Next.js's empty live region. The test now rejects
nonempty alert text while retaining every numeric, source, persistence and
privacy assertion. Product code did not change. Both runs are retained as
`guided-shared-policy-browser.log` and `guided-shared-policy-browser-rerun.log`.

No tax formula, rule-pack version,2026 calculation/export gate or independent
qualification status changes in this intake package.

The final private rebase on central-doc commit `7523384` produced tree
`b1eca17c417bb0f2d69b8019fd1221cb60e46bc0`. All 12 reviewed executable/spec/unit-test
blobs are identical to `dd02ffef`; the browser assertion and this evidence
append are the only owned changes. Its 22 focused integration, source, PDF
and strict-spec cases pass (`guided-shared-policy-final-tests.log`).

The final source rebase on `36cd922` produced verified tree
`bc6c7f1ec50c3e9ea71de9bb76d70f8939bfa6be`. Its 23 focused source, DOM,
canonical, PDF and strict-spec tests pass; root/web/contracts types and all
4,845 references pass. The same 12 independently reviewed product/spec/unit
blobs remain unchanged. The final commit adds only this evidence paragraph
to that verified tree (`guided-shared-policy-rebase-final-tests.log`).
