These JSON rows are transcribed from the official final IRS PDFs listed in
`spec/federal/tax-table.yaml`, refreshed October25,2026. Each row is:

`[atLeast, lessThan, single, marriedJointly, marriedSeparately, headOfHousehold]`

Each year has2,062 contiguous rows through100,000. The published QSS instruction
uses the married-jointly column. SourcePDF SHA-256 hashes are in the spec.
Extraction used pypdf layout text, accepted contiguous numeric groups of six,
and checked interval continuity and the official printed example. No calculation
implementation generated these expected tax values. Tests compare every cell
against both integer endpoints and compare QSS with the published joint column.

2025 source is Publication1040(2025), whose first12pages are the table;
2022–2024 source is the respective Tax and EIC Tables, table pages3–14.
The source archive is local `.local/upgrade-evidence/<year>-tax-tables.pdf`.
There is deliberately no2026 fixture: the final table is not available.
