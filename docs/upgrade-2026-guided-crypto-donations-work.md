# Actual digital-asset donation interview

The existing source calculation had no guided collector. The spec-first red
reproduced three failures: the bridge dropped the gift, blank basis passed
validation, and edits retained confirmation. The new facts-only collector keeps
original quantity, dates, FMV, basis, recipient and explicit qualification and
appraisal answers. It calls the existing calculateCryptoDonations validator;
no AGI or computed deduction is entered. No calculation or readiness gate changes.

Sources refreshed October 26, 2026:

- IRS [digital-asset FAQ78-79](https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-digital-asset-transactions) distinguishes original basis, holding period, contribution-date value and appraisal requirements; transfer costs are excluded from the gift value.
- [Publication526](https://www.irs.gov/publications/p526) provides recipient and contribution rules.
- [Publication561](https://www.irs.gov/publications/p561) requires appraisal review across similar property given during the year, including different recipients. The interview asks for that actual determination, not an exemption inferred from one row.

## Initial evidence

- Spec: `spec/federal/guided-crypto-donations.yaml`.
- Initial three failing cases: `.local/upgrade-evidence/guided-crypto-donations-spec-first-red.log`, SHA256 `8f757471fcaaccabf74c823abb02bd037cfac87bed99f4f1535afcab12dffbb8`.
- Initial corrected guide/DOM cohort: four passing tests in two files.
- Initial saved workspace packet: one passing case; independent pypdf locates the original blank's three ScheduleA amount rectangles and reads20000 each, with privacy and one review notice on every page.
- The original initial checkpoint preceded wider frozen-source checks, production browser, saved visual review and separate agent review; their subsequent results are recorded below.

Known false, unknown and explicit zero remain distinct. A small donation still
requires the actual similar-property appraisal determination. Changes to the
gift group or household revoke confirmations. Required missing facts block both
preview and review export; unqualified2026 and filing exports remain unavailable.
Legacy other-qualified recipient data remains visible and requires clarification.

## Verified collector and integration

The initial helper red reproduced three omitted-source/confirmation defects.
The later similar-property source regression reproduced one additional failure
before the existing core appraisal validator was applied to the combined gift
list. The separate core correction is committed in `c078ce0`; this collector
uses that validated method without changing its calculation.

Frozen V3 tree `ef07be0e4a7b46ca5e72cba772716f297c676b4b` passes 733 tests in
53 files, root/web types, 5,465 spec references, both builds and scoped lint
(zero errors, two existing warnings). Test log SHA256:
`53f7fab6e035b505bb5a3c1a1368c461a4da55d103085366ed4fd63ca8945375`.
The first browser attempt could not collect tests because a fixture imported a
Vitest-only alias. V4 uses equivalent plain synthetic browser source data; the
application source is unchanged. No assertion, timeout or retry was relaxed.

V4 tree `5089aa9e61e611a2f718953b90f9bf426a0072e5` passes 489 tests in five
files, types/spec/lint and both builds. Desktop1280 and mobile390 production
browser cases both pass with zero retries. Initial sandbox loopback-listen
denial is preserved separately; the unchanged permitted local run passes.
All13 owned hashes remain unchanged, task port3346 is closed, and no private
source facts are posted before the explicit same-origin review download.
Browser log SHA256:
`faa3180b48eae8b7aded93eeeebf314ea7512023f639bd1c01a16cc0cb030286`.

Seven saved PDFs were independently reopened: five source variants and both
browser downloads, 91 pages and 21 literal ScheduleA amount fields. Exact
artifact hashes, flattening, redaction and one review notice per page pass.
All page contacts and footer strips, all five source ScheduleA pages, a readable
browser ScheduleA page and all four source/download screenshots were inspected;
no amount, clipping or overlap finding remains. The initial private inspection
script guessed the notice wording; it was corrected to the existing literal
notice, preserving the exact count. No artifact or application source changed.
Artifact generation is separate from authored regression counts. Evidence:
`guided-crypto-donations-artifacts/manifest.json`,
`guided-crypto-donations-browser-artifacts.json`, and both
`parent-crypto-*-pdf-inspection/checks.json` records under `.local/upgrade-evidence`.

Separate agent review initially found the known same-asset appraisal gap.
Its corrected-source recheck passes13 tests in seven files, including the
unchanged original failure, exact5000 and5000.01 controls, multiple recipients,
unknown versus zero, source changes and year gates. The guide helper is identical
to that reviewed correction. Review log SHA256:
`502e69b6f7e740b5212f0a5aa71c074ec3363286301415e949b8aae60ded7cbc`.
The subsequent V4 fixture/PDF follow-through is recorded in the separate review
report; agent review is not independent human tax qualification.

Integration follows `8d97c0f` and retains its original-source charitable NOL
method. The added source-presence check requires actual independent regular and
AMT charitable histories for digital-asset gifts whenever an NOL packet is
supplied. Missing histories cannot become empty merely because the direct
receipt collection is empty. A new spec-linked regression failed before the
one-line source-presence correction; its log SHA256 is
`47de6c2529e151d2cfc7211a7fc8b9d838d17debe56232bcea7ebb5a6fe888e6`.
The final snapshot adds rule provenance2025.145/2026.142-law-integration-draft
and regenerated517-entry inventory. Final integrated checks, separate delta
review and remote commit evidence are recorded in
`guided-crypto-donations-delivery.json` and the durable checklist. All tax-year,
filing, model-promotion and privacy gates remain unchanged.


Final immutable integration tree `a0e6ec80ecba970d2c773f4e184b2c70ab3c62a2`
passes795 tests in63files, root/contracts/web types, all5486spec references,
517-entry inventory freshness, both builds and scoped lint (zero errors/two
existing bridge warnings). Test log SHA256:
`b849b4168e631712f7a6d06971cf378c5704cc3b8054638fc3b726cabd3f08c2`.
Final desktop/mobile production browser checks pass2/2 with zero retries;
all16frozen hashes stay unchanged and port3346closed. Log SHA256:
`fd3aac90946e9ddccce39cd47e40714443e23e60745e14152ad636e967fc72a4`.

Separate final review passes20tests in9files, including9private controls and
the unchanged original appraisal probes. Actual fixture parity, equal-value
source/audit rejection, separate NOL histories and46000AGI, absent NOL packet,
and all7previously savedPDF/91page/21field checks pass. All13V4 and16final hashes
are verified. A reviewer-only appearance-matrix extraction was corrected to the
existing official widget coordinates, with no source or artifact change.
Report: `.local/upgrade-evidence/facts-crypto-final-review.json`; log SHA256
`04d4c8fb5e7728613d1093cdda12b6dfd0aa25f0b115e726b334f3821d1ecc90`.
Only this ledger adds completed evidence after the reviewed integration tree;
the other15delivery files remain byte-identical to that tested source.
