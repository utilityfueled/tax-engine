# Guided acquired-goodwill originals

The finite current-2025 acquired-goodwill source method can now originate in
the guide. The user enters actual purchase allocation, basis, dates, owner,
business identity and a complete inventory, then explicitly confirms the
originals. Unknown amounts remain unknown, zero is preserved, and later edits
invalidate confirmation. The existing engine performs all monetary calculation.
No purchase allocation or missing eligibility fact is inferred.

The method remains one cash business with complete current-start Section 197
originals. Separate depreciation is known zero; other activities, historical
amortization, contingent basis, related parties, anti-churning, foreign use,
leases and dispositions retain their separate source-method guards. PA still
requires independent basis support. All 2026 and filing gates stay closed.

Sources: [final 2025 Form 4562 instructions, Part VI](https://www.irs.gov/pub/irs-prior/i4562--2025.pdf)
and [26 CFR 1.197-2(f)](https://www.ecfr.gov/current/title-26/section-1.197-2),
rechecked November 15. This collector implements the already specified method;
it changes no engine formula. The independent synthetic example has $18,000
basis starting in July: $600 amortization, $1,100 Schedule C other expenses
including an actual $500 remaining ledger, and $37,900 profit from $40,000
receipts with a separate $1,000 interest expense.

The initial visible-control regression fails on the predecessor. A later,
separate same-input predecessor bridge reproduction also fails and is retained;
it is not misrepresented as a chronological preimplementation test. Author
checks pass 1,056 tests in nine files; independent review passes 1,060 in ten,
including four distinct date, ownership, confirmation and isolation controls.
Root adoption passes 989 tests in six files, root/web types, scoped lint and all
four spec references. Optional tests-inclusive typing retains twelve unchanged
legacy imported-fixture errors, with no owned-file diagnostic.

Actual DOM blur, blank/zero, explicit capture and edit controls pass. Canonical
calculation, saved/reopened redacted Schedule C fields and an authenticated
in-process private/no-store API test agree; AI and hosted-shell projections omit
private originals, with no provider transport. Two visible browser source cases
are a separate successor; no browser runtime, current distribution qualification
or human tax approval is claimed here.

Core freeze: `327d0e0ceedfdcf8f458240db9154df524371e56770e7f4a8ce9ccb5b493abf1`.
Independent review: `53b4063989422d8a0b13cfe61b8ab426c8ea66ea6e3ba35cdf52faf4a19e4771`.
Private packets: `nov15-guided-goodwill-amortization`,
`nov15-goodwill-amd64-independent-review` and `nov15-goodwill-root-adoption`.

## Separate visible browser source

Two additional source cases collect at 1280 and 390 pixels. They visibly enter
all goodwill originals, capture and reconcile business confirmation, save and
reload, preserve exact formatted basis through blur, distinguish blank from
zero, invalidate a changed original and keep 2026 export controls closed. They
assert no protected API request or private-source network transfer. They add no
deletion journey. Independent and root collection checks both find two cases
at the unchanged 30-second default, two workers and zero retries; all four
proposed protected-action budgets are zero. Actual browser execution and the
integrated audit-metadata update remain pending.

Browser freeze: `1bc448cf3397db71d9d3df4205ddc24ff6f6929b10ba61a88ceaaa532207cbad`.
Independent review: `6505e175deff87d550ea681d0529a68f7298d96104d024fac7944e3fa785b842`.
Root checks also pass all 947 strict spec-reference tests. Private evidence:
`nov15-guided-goodwill-browser-source`, `nov15-goodwill-browser-amd64-peer` and
`nov15-goodwill-browser-root-adoption`. No browser runtime pass is claimed.
