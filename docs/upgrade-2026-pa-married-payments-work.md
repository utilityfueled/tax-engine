# Pennsylvania separate-account payments

Original 2025 married-separate PA-40 returns can now compose each spouse's own
actual estimates, extension receipt and prior credit from complete individual
account originals. The existing known-none method remains unchanged. Supplied
payment packets must validate; a malformed packet cannot fall back to zero.

Original account name/SSN/year/status, receipt confirmations, retained receipt
inventories and preparation date must agree. Estimates use their actual
published periods; an April 15 extension payment cannot cure missed quarters.
A prior credit requires the same owner's original separate return, election,
unchanged posted credit and timely application/filing evidence. Joint accounts,
transfers, offsets, late/date-specific penalties and positive underpayment
remain unsupported. Opposing spouses' balances are never silently netted.
Raw Decimal sums precede each return line's own rounding and enter the existing
PA-40 and REV-1630 calculations. Source changes invalidate the household
commitment; public audit entries do not expose new private source identifiers.

Official sources refreshed November 5 are the [2025 PA-40 instructions, pages 6
and 21](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf),
[2025 REV-1630](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_rev-1630.pdf)
and [61 Pa. Code 117.2](https://www.pacodeandbulletin.gov/secure/pacode/data/061/chapter117/s117.2.html).
This finite implementation does not establish that every excluded case is
legally ineligible or qualify final 2026 forms.

Spec-first baseline execution retained five genuine failures/33 passes, followed
by a separately retained chronology failure. The final author suite passes
326 tests; a distinct engineer passes those plus 24 new controls (350 total).
Independent Python Decimal worksheets establish taxes 1,535/921, primary
lines 14/15/16 of 51/200/76, refunds 327/80, and 0.25+0.25 rounding once to 1.

Root integrated the exact seven reviewed paths on `d074824e`. Current normal
`pnpm test` passes 326 tests in six files; inventory suites add 66 controls.
Root/contracts/web types, spec, checked inventory, both builds and repository
lint pass (zero errors; existing warnings remain). Author strict lint reports
zero warnings across six owned TypeScript files. Extra fixture compilation
retains the same 12 old diagnostics as its unchanged baseline; it is not clean.

The first inventory check failed and was retained before normal regeneration.
All 878 old rows remain identical, with 68 supported. The new source/test entry
is partial. Root's initial harness wrongly expected unsupported and stopped;
that verification assumption was corrected without product/generator changes,
and static checks resumed. Both failure receipts remain in the 32-member main
packet, manifest `0fd505180b61f98355ca5791d8e4ebb74b1c75af823f435b4c12aaf061680aeb`.
Author manifest `577c5873eb1e8ed8d4a283f52cb80a5dd98cc81663b582dc9d7625c6e69765c6`;
distinct manifest `e7683f9f23ca97696e507102383aea683c326ce32e9f01968a5c225248907bca`.

Native payment collection, separate output admission/privacy review, broader
cohorts, professional human review, current full integration and hosted/self-host
artifact qualification remain required. Filing stays disabled.
