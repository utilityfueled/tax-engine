# November 5 official tax-source refresh

Twenty official IRS, SSA, Pennsylvania and Ohio URLs were checked on November 5,
2026 UTC. No new law or final-form change was demonstrated by this bounded set.
The [source record](upgrade-2026-tax-source-refresh-20261105.json) preserves exact
URLs, retrieval windows, response hashes, observed revisions and limitations.

All 11 downloaded PDFs match their pinned earlier bytes. Five IRS legal and
instruction pages have the same normalized visible text as their October 28
captures; the Pennsylvania PIT index matches November 4. Changed HTML bytes alone
do not establish a legal change.

The current [Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf), instructions
and tables still identify 2025. Separately available 2026 Schedules C and R and
the explicit draft 1040/3-A do not establish a complete final 2026 packet.
The [Pennsylvania PIT index](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax)
still links 2025 PA-40; the tested 2026 annual-form candidate returns 404.
The tested Ohio forms index also returns 404; the pinned 2025 booklet is unchanged.
These observations do not prove that every possible final-form source is absent.

Direct retrieval returns 17 HTTP 200 responses, one SSA 403 and two 404s. Initial
sandbox network failures are retained separately. An alternate read of the
official [SSA wage-base table](https://www.ssa.gov/OACT/COLA/cbb.html) confirms the
unchanged 2026 value of $184,500. That tool supplied no HTTP status or raw response;
its saved observation hash is not described as a response-body hash.

The existing Python 3.14.6/pypdf 6.10.0 environment strictly reads the first two
pages and metadata of all downloaded public PDFs. This is source inspection,
without PDF authoring, mapping, rendering, taxpayer documents or human review.
A local comparison harness error is preserved and corrected without changing
the retrieved documents. No calculation, spec, constant, map or readiness gate
changes. Qualified tax review and final-form qualification remain required.

ROOT reads the report and verifies all 55 frozen members under
`.local/upgrade-evidence/nov05-tax-primary-refresh/`. Manifest SHA-256:
`6f6ec1954f2e5340e1b9859b5abe9f21e916b096a575f973661e2eb028c477b7`;
report: `9730b803e65d4e058ed81bc67f9314bc8bd3eb9e6c47dbd868ccd1bc3c411cdb`.
