# Ordinary nonterminal asset disposal

The finite MACRS disposal path now requires actual original convention, full
service/disposal dates, basis, ownership/use and reconciled prior-year records.
It applies the original half-year, disposal-quarter or mid-month fraction to
exact annual depreciation, limits it to opening adjusted basis and rounds once.
The [Publication 946 disposal examples](https://www.irs.gov/publications/p946)
produce $513 and $757.50 → $758; the independent $960.4992 example rounds to
$960, preserving the distinction from rounding annual depreciation first.

Support is limited to whole-asset ordinary sales, full-calendar GDS plain
purchases, constant 100% ownership/business use and explicit zero section
179/bonus/other adjustments. Supported classes are 3/5/7/10-year 200DB with
half-year/mid-quarter conventions and 27.5/39-year straight-line mid-month
property, from recovery year two through the penultimate table year. Claimed
and allowed depreciation must match contiguous actual historical records and
the explicitly supplied whole-dollar historical method.

Independent review reproduced two defects before adoption: listed aggregation
could skip a malformed nonlisted source packet, and the 39-year source method
could admit a 1990 building. Both are fixed and their failures remain intact.
Every supplied packet is validated before exclusion. New 39-year packets before
1994 are denied because they lack actual contract/construction transition facts
required by Publication 946's GDS footnote 4. That conservative boundary does
not assert that every 1993 building legally has a 31.5-year period.

Actual main spec-first tests reproduce 27 failures and four passes before
adoption. The merged checkout then passes 240 tests across 13 files, including
the prior passenger correction and native asset source/recovery controls.
Distinct review passes 249 focused checks. Root/contracts/web types, all 8,355
spec references, inventory generation/check and repository lint pass. Changed
production/new tests pass strict lint; the old fixture retains 76 inherited
warnings. All 874 prior inventory entries remain identical, with one new
unsupported entry. No coverage threshold, assertion or readiness gate is lowered.

The narrow merge preserves the native collector fields and passenger cap
correction. Form 4562 requires an explicit owner/input year for asserted
disposals, and its audit excludes documentary identities and references.
The former prior-year `YYYY-MM` halving approximation now requires actual
source facts. Metadata-absent known same-year exclusion remains only a legacy
no-depreciation result, with malformed supplied packets rejected first.

The distinct disposal status is `documented_ordinary_nonterminal`; aggregate
basis status remains `legacy_unqualified`. Parent Schedule C/E linkage,
proceeds/gain/Form 4797, native prior-year capture, first/terminal/listed/ADS or
changed-use histories, official forms, qualified human review and filing/release
remain unqualified. Current full integration is separate required work.

Private verified evidence:

- V1 source: `7dfa1d9e553505d77483c5226690141c92865344f39fcd708c2924d787f8e301` (79 members; failed version retained).
- V2 source: `ca16fec81683b1df63795704de49b078988eed48cd2978f976104b3b78e37f67` (50 members).
- V2 independent: `e572021be88dcf0147645612fa983163e611500a069da2170660a14114806f33` (15 members).
- Actual checkout: `9cbda55aafdcfcd3c59126c1f41524017f6af60be2847022d593232df6b322b8` (36 members).
