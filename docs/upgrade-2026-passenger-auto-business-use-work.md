# Passenger automobile annual business-use maximum

The regular-depreciation helper now reduces the passenger automobile maximum
by actual annual business use. [Publication 946's maximum-deduction caution and
passenger worksheet lines 7–9](https://www.irs.gov/publications/p946) require this
adjustment. The existing Decimal nearest-dollar policy applies to the adjusted
maximum; original placement year and recovery year still select the table.

The only product change multiplies the table maximum by the existing business-use
ratio before rounding and comparing it with tentative regular depreciation.
For the old $80,000/60% fixture, tentative depreciation is $9,600 but the adjusted
2025 maximum is $12,200 × 60% = $7,320. That one incorrect expectation and its
stale comment are corrected; all 127 assertions and 64 declarations remain.

Spec-first checkout tests reproduce two numeric failures before implementation.
The actual checkout then passes 203 tests across nine distinct files, root
typecheck, all 8,348 spec references, inventory generation/check and repository
lint. Product and new test also pass strict lint. All 873 old inventory entries
remain identical; the new entry remains unsupported. Distinct review passes 18
additional API controls and independently recomputes Decimal oracles, including
half-dollar boundaries, recovery years, zero/100% use and input preservation.
An earlier private 297-case run accidentally collected 94 cases twice; it is
retained and excluded from the distinct count.

This correction preserves `legacy_unqualified`. It does not establish annual
use, eligibility, short-year treatment, combined section 179/bonus/regular
allocation, historical basis, remaining recovery or filing readiness. Full
current integration and wider release/human qualification remain required.

Private verified evidence:

- Author, 33 members: `cfa70c51cd5fb5be64297594f485ffe48051cc7d9c4d1e154da33d433d0fe352`.
- Independent, 16 members: `e2a7ec7840bafea6f93dee748860ce4a200555b91ceef6d34f331f0bc58c02d8`.
- Actual checkout, 27 members: `a2c8646c2dd8f6170161272f20272b45c4ab1ac732f43e42b5e6158119456c69`.
