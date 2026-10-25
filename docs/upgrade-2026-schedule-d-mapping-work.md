# Schedule D actual subtotals and physical routing

The final2025 ScheduleD, created2025-10-06, was refreshed2026-10-25 from
https://www.irs.gov/pub/irs-pdf/f1040sd.pdf and its instructions at
https://www.irs.gov/instructions/i1040sd. This remains a historical review map,
not a qualified filing export or a2026physical form.

Spec and four failing saved-PDF regressions preceded implementation. Actual
Form8949A/B/D/E categories now reach1b/2/8b/9, including their adjustments. All
current8949transactions are reported on8949, so optional direct rows1a/8a remain
blank. ScheduleDrecords separate4/5/6/11/12/14subtotals; final estate/trust
capital-loss carryovers join prior carryovers on6/14 and print inside the
existing parentheses. This changes audit/PDF representation, not tax totals.

The header is the QOF-investment disposition question. Its previous assumed
Yes is removed; missing source facts leave both answers blank. Net losses and
zero skip17-20. Both-gain paths stop at20; other paths answer22from actual1040
qualified dividends. Missing18/19worksheet results remain unknown, including
the related20answer unless actual4952establishesNo. Complete special worksheets
and the actualQOF collector remain separate internal implementation work.

Independent agent review rechecked the physical form and passed147cases across
four files, with no actionable scoped finding. Initial parent checks pass148
cases including child distributions. Review logs live under
`.local/upgrade-evidence/{agent-schedule-d-mapping-review,schedule-d-subtotals-green}.log`.
Exact tree52b0b201 on8bbeef2 passes1320tests across124PDF/form/edge files, root
types, all4217spec references and scopedlint (zeroerrors,17existingwarnings).
The earlier0a6c6c3b run was stopped after a Python stdin-EOF wait was confirmed
by process stack samples. Separate commit8bbeef2 reopens the saved Marketplace
PDF with a bounded subprocess; every assertion remains. The full retry above
passes in144.07seconds. Logs are
`.local/upgrade-evidence/schedule-d-mapping-retry-{green,types,spec,lint}.log`.

Two saved two-page reference PDFs were independently reopened with pypdf.
Expected canonical field values agree with widget values and nonempty appearance
streams. All four rendered pages were visually inspected; review notices remain
on each page. Loss example6=10000,13=3800,16=(6200),21=3000; the category example
retains all four actual8949columns and300/1250/1550net totals.
Artifacts under`.local/upgrade-evidence/schedule-d-mapping-render/`:

- `loss.pdf` SHA2569b3403293ea0d1b550302118c344b221d6ce9c3558b06f3470fefddf40a500f3.
- `categories.pdf` SHA256bf81ac7a6e9fd3364648a5e8b01dc8eea87d48b58a0dd2f852cf42c98376d0d4.

Other unsupported8949categories, home-sale/QSBS attachment details and final
human/form qualification remain explicit gaps; filing stays disabled.
