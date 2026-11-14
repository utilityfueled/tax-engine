# EIC history with an actual unassessed Tax Court petition

This finite history method accepts a documented, timely Tax Court petition
against a prior-year statutory notice of deficiency when the complete original
record establishes that the EIC tax has not been assessed. It removes only the
unproven assessment restriction. Actual earned income, qualifying children,
other EIC eligibility, another assessed denial and another filer's final ban
continue through their existing calculations and guards. A pending appeal
boolean alone supplies no missing facts and creates no credit.

[Published 2025 Treasury regulation 1.32-3(b)](https://www.govinfo.gov/content/pkg/CFR-2025-title26-vol1/pdf/CFR-2025-title26-vol1-sec1-32-3.pdf)
defines denial through deficiency procedures by actual assessment. The
[controlling section 6213 text](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section6213&num=0&edition=prelim)
provides the printed-notice last-date rule and the assessment exceptions.
[Final December 2025 Form 8862 instructions](https://www.irs.gov/instructions/i8862)
retain separate rules for contested final bans and mailed claims. Official
sources were refreshed November 14. The published CFR edition is explicit;
a direct eCFR access-gate page is not treated as substantive authority.

The proof binds the same filer, SSN, source year, notice, denial reference,
actual petition filing date and docket. It uses the actual notice's printed
last filing date; no 90/150-day, holiday, foreign-address or jurisdictional
inference is made. Court, filing and account originals must be complete
through the review date, with explicit absence of assessment, finality,
decision, dismissal, settlement, waiver, jeopardy/termination assessment,
bankruptcy or another exception. A filed claim cannot predate its petition.
Assessment after that claim but within the reviewed record still rejects.
Detached proof, duplicate case, unknown records and false appeal status reject.

The exact final tests first produce five genuine failures and one passing
negative control on the predecessor. The final author checks pass 977 tests in
eight files, types, owned lint and six strict spec references. Separate agent
review passes fifteen tests in two files. Root reads all six frozen files and
the two shared diffs, then passes eleven tests, including five additional
controls. An immutable candidate full `pnpm test --maxWorkers=8` passes 28,491
tests in 2,073 files, including those five private controls and the added strict
spec entry. Its separate SCRAM PostgreSQL 16.16 cluster stops normally, source
pins remain unchanged, and temporary credential files are removed.

The existing canonical 2025 fixture still calculates its independently eligible
$649 EIC; this proof neither overrides that calculation nor asserts Form 8862
completion. Original documents remain excluded from hosted/provider/public AI
projections. Source-history validation covers 2025/2026, while full 2026 returns,
filing, final exports and qualified human tax review remain gated. There is no
new guided intake. Current combined inventory, browser binding and runtime
qualification require successor checks; earlier AEA artifacts exclude this
later package. Main remains local under the production push hold.

The root review's original stage metadata is preserved byte-for-byte in
`reviewed-stage.json`. Full-unit orchestration added only a `base` alias equal
to `source`; `STAGE-METADATA-AMENDMENT.json` records both metadata hashes and
verifies all six product hashes unchanged. Author fixture, source-fetch and
harness failures are retained rather than relabeled.

| Private evidence | SHA-256 |
| --- | --- |
| Six-file freeze | d9322f336438c46caf750d1900c2c43b78cf96bb2c2a21379a96bfadfe13b16d |
| Author actual checks | 4b0da02c548fdfd80020695724c6c5e5005d6219d1b6ed742415997ff2b8afb5 |
| Research receipt | b668776b45e667da36ceeac68ac8d0b56693dec09b8fa98037e2a2697bcbb47e |
| Separate engineering review | 8097f1fa51fa14c70587e57582003d4de34be1ac7d1bc865080239defb56271e |
| Root separate source/test review | ac019ae9aea708247a2a817664c54ce5b8dd9ddcf2c91d934cadcbc085433305 |
| Published CFR PDF | 49f74526f5858302fe1d507680049e06fb9a9a4544e1adab4821937d95368d02 |

Private roots under `.local/upgrade-evidence/` are
`nov14-eic-unassessed-petition`, `nov14-eic-petition-root-review`, and
`nov14-eic-unassessed-petition-independent-review`. These are engineering
reviews; no qualified human tax decision is claimed.
