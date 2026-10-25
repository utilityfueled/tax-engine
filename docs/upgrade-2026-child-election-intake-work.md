# Actual child election intake

This package collects actual Form8814 child identity, election/return/payment,
parent-selection, student and AMT sources. The canonical eligibility checks in
`b3f0362` remain authoritative, including the computed parent-income comparison.
No filing or year-readiness gate changes.

Sources: [Form8814 instructions](https://www.irs.gov/instructions/i8814),
refreshed2026-10-25, and the source ledger in
[the core package](upgrade-2026-child-election-work.md).

Blank values remain unknown, zero and false remain explicit, and all money
uses Decimal. Actual child SSNs stay in local source facts and full-fidelity
recovery; review copies redact them. Child source edits and relevant household,
income or deduction changes revoke confirmation. Editing a parent investment
source preserves the saved child records. Confirmation-only updates do not
create a cycle. Unsupported Alaska/special-capital/foreign-account sources
remain saved and visibly require their separate method; those methods remain
internal work and are not attributed to missing external approvals.

Spec-linked missing-helper and missing-control tests preceded implementation.
Working integration:705tests in60files, including broader guided source,
passive-source and health-review regressions, pass; web types pass. Independent
agent review reran4focused source/control cases without actionable findings.
This is software review, not independent human tax qualification.

## Isolated validation, 2026-10-25

Base `b1fab71`, isolated tree `594b2d20ccebf893bbc2c68b4ce7e705eb51a4ee`.
696 tests in58files pass; root/web types pass; all4,126 spec references resolve;
scoped lint has zero errors and six non-null warnings (source/test assertions).
Webpack production build passes. Production Chromium checks pass at1280x900
and390x844, with source edits, confirmation invalidation, persisted reopen,
parent-source retention, no horizontal overflow and no childSSN/source reference
in request bodies. Both screenshots were visually inspected. These are synthetic
local production-build checks, not hosted staging or human qualification.

Evidence retained locally with SHA-256:

- `child-election-ui-unit.log`: `131a281538d0afdb17265dfb46da0b568ca2bdefd2a1e42715061d15a3f96c5a`
- `child-election-ui-types.log`: `ee07b7a675d3385cca9beaf85141b8a147625ddf6d25fb6a55f0d8a76df1e8c0`
- `child-election-ui-spec-lint.log`: `c50cc75e88c11a1112bd113c98bb04ffca0251300ea88e9d39fb6b578469b94b`
- `child-election-ui-build.log`: `45f80fc16303d341eea4cb6588c024a6b99071f0e3f309412d4eb857cdd195e9`
- `child-election-ui-browser.log`: `ea61b9954048d79c97142234d6f3737d41535599e3f53881c69fe761c8ea0203`
- `child-election-ui-1280.png`: `892d07c87a7c0c589a408d3549b5ba4731b547fbbf23a7589bd828872a1782a9`
- `child-election-ui-390.png`: `20aaf058158c9be0371a78aca059fcb75692b7e6d7785ffd8da7d616ac58fde6`
- `ai-child-election-intake-review.log`: `060dfdff530c78c82d811a41d02a510f63a9e781a9aa6b2b1e04149d64266546`
