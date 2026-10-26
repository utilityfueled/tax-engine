# Annual digital-asset appraisal sources

Independent source review of the new gift collector exposed a central omission:
two known BTC gifts of $4,000 to different charities could each state that an
appraisal was unnecessary. Publication 561 requires similar property to be
combined across recipients during the tax year. The original false answers
contradict the represented $8,000 group.

Sources refreshed 2026-10-26:
- [Publication 561](https://www.irs.gov/publications/p561), December 2025,
  Deductions of More Than $5,000 and Number of Qualified Appraisals.
- [Digital-asset FAQ](https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-digital-asset-transactions), question 78.

The spec preceded three failing regression cases. The engine now checks exact
positive tentative contribution values for the known same asset identifier,
across actual recipients and dates. Source-confirmed 2025 and current 2026
records must retain the required original appraisal answers. It neither guesses
aliases between different asset names nor infers an exemption for originals
outside this ledger. Known unqualified/zero contributions add no claimed value.
Historical unconfirmed sources remain explicitly unverified. No deduction,
appraisal, final form or filing qualification is invented.

Initial checks pass 126 tests in four files, including exact $5,000/$5,000.01,
reversed rows, two years, basis reduction, original false/unknown/zero values,
outside-ledger requirements and unconfirmed historical inputs. The red log hash
is `2214e1fa430d4174805c26692a5c3bc31f9c777c20e0ee6c1fa1e10b91d46ce3`; initial green log hash
is `584c4ecb390e628566ce600ca6f283355f551d76371e88f6d7cb13ba8a2075ba`.

Wider frozen-source checks and independent agent review pass. Rule provenance
advances to 2025.142 / 2026.139-law-integration-draft. Readiness gates remain closed
where their existing evidence is incomplete. This is software source evidence,
not independent human tax review or final Form 8283 qualification.


## Reviewed delivery

Frozen tree `32b9447d253e364033f456f32753fbee6a876337` passes 753 tests
in 53 files, root/web types, all 5,458 spec references, regenerated 514-entry
inventory, lint with no warnings/errors and the engine build. All six owned
hashes remain unchanged. Test log SHA256:
`f22b3150e4d8465f1c8788e8b9a324754a38f50a2eb0accd38128ec14c54cdc9`.

The separate reviewer reran the unchanged original failing aggregate probe in a
private clone and checked the guide's later combined-group validation. Thirteen
tests in seven files pass, including saved false/zero and year-bound records,
$2,499.99 + $2,500.01 = $5,000 exactly and the one-cent increase, source
immutability, missing appraisal and preserved outside-ledger requirements.
Review log SHA256:
`502e69b6f7e740b5212f0a5aa71c074ec3363286301415e949b8aae60ded7cbc`.
The report is `.local/upgrade-evidence/facts-crypto-appraisal-rereview.json`.

This commit contains only the central guard, spec/regressions, provenance,
inventory and this ledger. The new guided collector and its browser/visual
checks are a separate delivery. No human tax or filing qualification is claimed.
