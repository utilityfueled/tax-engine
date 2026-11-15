# Source-bound HOH own-care medical mileage

The finite 2026 medical-mileage source route now accepts an ordinary unmarried
head of household with actual primary, qualifying-child and home-upkeep originals.
Previously it accepted only a single filer. This package does not qualify a full
2026 return or extend medical costs to the child.

The new strict original record binds exact primary and indexed child names,
complete taxpayer IDs, actual calendar birth dates and the canonical home address.
It requires full-year resident/not-dependent facts; an unmarried biological child
under 19, younger than the primary, actually in the same home more than half the
year; explicit support, citizenship and joint-return facts; and no competing
claimant or special custody, absence, adoption, birth/death or age exception.
Actual eligible annual home costs and primary payments use Decimal. Own-funds
provenance must be explicit; primary payments must exceed half and not exceed
the total. Unknowns, duplicate identities, malformed IDs, home replay and known
contradictory EIC originals reject. These checks apply to this new finite route,
not every historical HOH calculation.

The guide starts original fields blank, preserves known zero, binds the same
household in completion and canonical conversion, and invalidates confirmations
on edits. Hosted/provider projections and public numeric audits omit the private
household references, names, IDs and home address. Existing single-filer arithmetic,
other filing-status restrictions and 2026 calculation/export gates remain.

Sources are [IRC 213](https://uscode.house.gov/us/usc/119-120/t26/s213/),
[IRC 2](https://uscode.house.gov/us/usc/119-120/t26/s2/),
[IRC 152](https://uscode.house.gov/us/usc/119-120/t26/s152/), final 2025
[Publication 501](https://www.irs.gov/publications/p501) and
[Publication 502](https://www.irs.gov/publications/p502), and the existing actual
2026 medical mileage announcements in the spec. Final 2025 publications are not
represented as final 2026 instructions. Rev. Rul. 2003-72 and current IRM
4.19.14.12.8 support birthday-anniversary dependency/CTC treatment; the separate
Form 8814 parent-election January 1 example is not applied to HOH qualification.
The source-specific formula and limits are in
[the spec](../spec/federal/schedule-a-medical-mileage-hoh.yaml).

Seventeen frozen source/test files are adopted on `d9026aea`. The original
16-file author packet is based on `1e98244b`; root applies only its exact import
and optional source field to current inputs.ts, preserving all later Form 2210
original-election fields. A distinct browser test supplies two actual journeys.

Validation and retained evidence:

- Actual spec-first failures cover missing original sources, identity, home,
  funding and eligibility contradictions. Author and independent focused checks
  pass 950 tests, with engine/web types and new-file lint passing.
- Root immutable integrated `pnpm test --maxWorkers=8` passes 28,515 tests in
  2,076 files, without added private root tests. Its owned PostgreSQL 16.16 stops
  normally; private connection/password files are removed; source pins agree.
- Actual production-build desktop/mobile journeys at 1280/390 pixels pass two
  cases with default 30-second timeout, zero retries and zero protected API calls.
  Reload, blank-versus-zero, exact-half edit invalidation, privacy and annual gates
  pass. The owned server closes normally. All 635 original cases/policies and five
  original hosted skips are retained; collection now contains 637 cases.
- Root and separate saved-artifact reviews rehash original source/build/report
  evidence and view both screenshots. Screenshots show the final invalidated
  half-upkeep state, not a completed return or a visible computed tax result.
- Focused arithmetic is 1499.25 + .50 + 10.125*.205 + 20.375*.235 - 1500 =
  6.61375. Actual browser entry uses parking/tolls zero, yielding 6.11375. These
  distinct synthetic Decimal examples are not published IRS examples.
- The initial root staging assertion used an incorrect import quote and stopped
  before install/tests; its distinct corrected stage is retained. Browser attempt
  one stopped on sandbox listen EPERM; attempt two retained two currency-locator
  failures. Only the new browser locators changed for the successful attempt.

Private evidence under `.local/upgrade-evidence/`:

| Artifact | SHA-256 |
| --- | --- |
| `nov14-medical-mileage-hoh/SOURCE-FREEZE.json` | `0e2d2e486c3a3e111429b26b1bcef06384023d4ea95c5c2b455cbc8f18ec61d9` |
| Independent 16-file review | `976c802190b77d2cdc303d219ddffcba575f4368654115c42260668c2ca985e5` |
| Author actual browser receipt | `7fb736c7a96d8c919ab75f5ee09ac91f5ee98812beda7290f7db3e242344761e` |
| Independent actual browser review | `68dcb11653b738a9702c4383221abb8d8dbe22350b1daa6490abb6efbbf84d57` |
| Root integrated actual review | `969e379de460e4b105c5fd0d7bd7fbb4695f48cb70bc12e6aafa45921a2aedc5` |

Combined inventory/browser binding, all twelve current-source checks and final
hosted/native successor evidence remain separate. Qualified human tax review,
final annual forms, all other finite-method boundaries and the production push
hold remain open. This local commit enables no filing or model promotion.
