# Official annual form refresh, November 14 afternoon

Twenty unauthenticated official endpoint GETs completed at 18:31:25–18:31:29 UTC. Actual PDF headers, extracted cover text and four rendered cover pages preserve the existing final-2026 annual-form gates. All seven retrieved PDFs match the 03:16 UTC byte digests. No calculation, template, readiness gate or filing setting changed.

The [current IRS Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf), [instructions](https://www.irs.gov/pub/irs-pdf/i1040gi.pdf) and [Tax/EIC tables endpoint](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf) still identify 2025; the tables URL redirects to Publication 1040. The actual [2026 Form 1040 draft](https://www.irs.gov/pub/irs-dft/f1040--dft.pdf) and [2026 Publication 1040 draft](https://www.irs.gov/pub/irs-dft/p1040--dft.pdf) explicitly remain draft/not for filing. The paired 2026 annual form, instructions and two tables paths in `irs-prior` returned 404 HTML. The current catalog’s recent Publication 1321 entry concerns Puerto Rico residents and does not establish a final annual Form 1040.

[Pennsylvania’s PIT page](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) still links the actual [2025 PA-40](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40.pdf). The paired 2026 PA-40, booklet and NRH URLs returned 404 HTML. This check makes no change to separately available 2026 estimated-payment materials.

The [Ohio index](https://tax.ohio.gov/home/forms/tax-forms) and [alerts route](https://tax.ohio.gov/individual/resources/individualincome) returned origin HTTP 404 HTML titled “403 Error Page.” The [2025 IT 1040 control](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/1040-bundle.pdf) remains an actual printed-2025 PDF. Corresponding direct 2026 IT 1040 bundle, booklet and IT NRC endpoints returned empty 404 responses. Those access-error pages do not establish actual draft bytes or final publication.

The private evidence folder is `.local/upgrade-evidence/nov14-official-annual-afternoon-refresh/`. `receipts.json` retains exact requested/final URLs, UTC times, response classifications, sizes and digests; extracted text and rendered covers support the printed-year checks. The first sandbox-limited network attempt is retained separately as unavailable, not treated as official endpoint failure. The endpoint inventory is bounded and does not prove that a future final product cannot exist at another published path. Final annual authority, exact physical qualification and independent review remain required.

| Actual PDF response | SHA-256 |
| --- | --- |
| oh-2025-bundle-unversioned-control | `612775da1fdce580451a4c8b9d0e47c5a1a3ffbf0054a06f000edd9c0b5d343b` |
| pa-2025-pa-40 | `fcd7648601f3ce5a7a258be49c54aa1c604e1c61c1fe9175351451ac6087d8b3` |
| irs-f1040-current | `3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982` |
| irs-f1040-draft | `e044e765ace334c76bda7910bd3193fc813c7789d06340124359b885c98d58d0` |
| irs-i1040gi-current | `482e9c487c608f1bbeaceef35bc3c0933e8b35443cfff447e4279d590468364a` |
| irs-i1040tt-current | `8ae019bd3b28b07b37e46e18597d8e899222a2224ce7482c015b130033403532` |
| irs-p1040-draft | `407bc35ab09aaf034689341d7469b9b082cd2ceaa652e38ca5874c1dd1c3f12e` |
