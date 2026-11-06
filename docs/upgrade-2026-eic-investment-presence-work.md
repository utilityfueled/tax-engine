# Preserve absent EIC investment-income inputs

Opening an EIC fact record previously inserted an investment-income override of
zero. That value replaced the computed investment income even when the taxpayer
had only supplied claimant eligibility facts. With $2,000 wages and $12,000
taxable interest, the credit incorrectly became $155 after opening the record.
The 2025 investment-income ceiling is $11,950, so the correct credit is zero.

The schema now preserves an omitted override as absent through parsing and
JSON save/reopen. The canonical calculation tests presence explicitly. A supplied
legacy zero remains zero; negative and nonfinite totals are invalid. This does
not qualify legacy aggregate overrides as source worksheets, nor complete the
separate investment-income character calculation or enable 2026 filing.

## Sources and verification

[Publication 596 (2025)](https://www.irs.gov/publications/p596), Rule 6 and
Worksheet 1, was refreshed on 2026-10-26. It requires actual investment income
and denies the credit above $11,950. The published EIC table gives $155 at
$2,000 wages; the ceiling case preserves that amount while $12,000 interest
disqualifies. The existing official-table fixture is independently transcribed.

The spec preceded three failing tests. The first attempted test fixture had a
payer object where the input schema requires a string; that setup failure is
retained separately and is not evidence of the defect. After correcting the
fixture, all three tests reproduced the actual defaulting defect. The unchanged
regressions pass after the implementation change. The final adjacent cohort
passes 157 tests in seven files, including the published table and Illinois
integration. Root types, all 5,066 spec references and scoped lint pass. A mistaken
unsupported `--strict` command is recorded separately; the correct validator
command passed without changing its checks.

Local logs are `.local/upgrade-evidence/eic-investment-presence-{fixture-error,red,green,final,static,spec,lint}.log`.
The initial green cohort has 59 tests in four files because one supplied filter
matched no file; the final seven-file run includes the actual table test path.
Independent agent review verified all five frozen source hashes and passes 12
tests in three files, including three new private controls. It checks the exact
$11,950 boundary, one cent above/below, repeated JSON reopening, explicit legacy
zero, invalid values and immutability. Its first private fractional-cent probe
exceeded the existing Decimal context precision; that separate observation is
retained and is not evidence of this presence defect. Final integration uses
metadata `2025.113` / `2026.110-law-integration-draft`. No human tax, final-form,
staging or release qualification is claimed.

Review evidence: `.local/upgrade-evidence/facts-eic-presence-review-summary.json`
and `facts-eic-presence-review-final.log` (SHA256
`6237987a48bf5bdd926cee721da0d789847e6927af8168407ceec68bf0e1a38e`).

Final integration on `085eaa7` passes 160 tests in eight files, root types and
all 5,090 spec references. The four reviewed non-document blobs remain identical
to frozen `eb32f8ee`; only this ledger and rule-pack provenance are added.
Integration logs are `eic-investment-presence-integration.log` and
`eic-investment-presence-integration-static.log`.
