# November 1 source, provider and advisory refresh

Checked against local `948d6b95f37859484d2a6d2d36f77d67111100ff` on November 1,
2026 in America/New_York; retrieval timestamps are November 2 UTC. This is public
source and local dependency evidence. It does not qualify a form, provider account,
runtime image, human review or release. The [execution brief](upgrade-2026-execution-brief.md)
retains all completion criteria.

## Newly available final forms

Compared with the actual October 28 source bytes, two final annual PDFs changed:

| Official endpoint | Printed year | SHA-256 | Physical differences requiring new maps |
| --- | --- | --- | --- |
| [Schedule C](https://www.irs.gov/pub/irs-pdf/f1040sc.pdf) | 2026 | `cc44e7d1150e54d991835814c1191f60a32617730ca9e50e6f532b51293a86b4` | Two pages; 116 canonical fields and 109 page widgets, versus 124 canonical fields in 2025. Names differ. Address boxes are split; line 16b is vehicle-loan interest and line 16c is other interest. |
| [Schedule R](https://www.irs.gov/pub/irs-pdf/f1040sr.pdf) | 2026 | `945275e6be3cc7353a3faf165ddd7ccb79e3c8a43abe6678d4c47f8207594cb5` | Two pages; 32 canonical fields and 27 widgets. Names and selected field properties match 2025, but line 14 now points to Form 1040 line 11b, rather than 11a. |

All four actual blank pages were rendered and visually inspected. Independent
pypdf field/widget and pdfplumber word/geometry inventories, text differences and
source hashes are retained. The existing 2025 Schedule C mapping cannot be reused:
its line 16b means other interest. Actual business vehicle-loan interest must be
separated from other interest before a 2026 map can populate those two lines.
This source discovery does not establish complete taxpayer facts, calculation
support, populated-map correctness, final instruction review or human signoff.
The new forms remain unavailable for filing pending those checks.

Of 55 PDFs requested in the previous refresh, 53 are byte-identical and these two
changed. The final [Form 1040 endpoint](https://www.irs.gov/pub/irs-pdf/f1040.pdf)
still identifies 2025. The additional [Tax Table endpoint](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf)
still identifies 2025, SHA-256
`8ae019bd3b28b07b37e46e18597d8e899222a2224ce7482c015b130033403532`.
Its printer metadata contains “Draft Ok to Print”; that is not a do-not-file
watermark. Draft 1040 and Schedule 3-A bytes are unchanged. No year or filing gate
was changed. This bounded endpoint refresh does not establish exhaustive absence
of every other final 2026 form.

## Official sources and access limits

The refresh made 148 public requests: 79 previous endpoints, 68 registered Debian
advisories and the Tax Table. There were 144 HTTP 200 responses. Both SSA pages
returned 403, and both Ohio forms-index URLs returned 404. These are failed
retrievals, not proof that the underlying facts or forms are unavailable. The
successfully fetched historical PA/OH PDFs are unchanged. No demand-based state
selection has been supplied.

Extracted text from Rev. Proc. 2025-32, Schedule A and 8812 instructions,
Publication 505, the Schedule 1-A announcement, the proposed refundable-credit
rule and hearing cancellation is unchanged. Neither source retrieval nor an
unchanged proposal establishes a final effective rule.

## Providers and exact-cost scope

[OpenAI pricing](https://developers.openai.com/api/docs/pricing) still documents
Luna at 0.10/0.50/0.01 and Sol at 2/10/0.10 USD per million input/output/cached-input
tokens. Their existing cache-write prices, long-context multipliers and eligible
regional 10% uplift remain documented. The page now explicitly dates the FedRAMP
10% uplift to November 1, 2026. The repository evaluation dispatcher uses the public
OpenAI endpoint; this refresh provides no FedRAMP execution or billing evidence.
An endpoint change requires explicit priced usage treatment before dispatch.

[Google pricing](https://ai.google.dev/gemini-api/docs/pricing) retains the Gemini
3.8 Flash standard rates 0.75/3.75/0.075 through December 31 and
1.50/7.50/0.15 from January 1, with cache storage 0.50 then 1 USD per million
token-hours. Thinking tokens remain charged output. The preview baseline remains
0.50/3/0.05. Google added grounding quota and per-query clarifications; grounding,
contributor tiers and nonstandard service modes are outside the approved text
route and must not be treated as these standard rates.

The actual [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and
[Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
pages continue to document the selected reasoning efforts and structured output.
[OpenAI deprecations](https://developers.openai.com/api/docs/deprecations) retains
December 11, 2026 retirement for GPT-5 Mini, so it cannot be assumed available for
January evaluation. No new model, promotion or fallback was selected.

Presence-only checks found no configured OpenAI, Google/Gemini, Stripe, database
or Redis credentials in this process, and no conventional `.env`, `.env.local` or
`apps/web/.env.local` files. Other stores were not inspected. No secret values,
authenticated provider calls, paid requests or account capability results were
created. Live availability, approved budget, independently reviewed cases and
qualification remain pending.

## Dependencies and OS advisories

Fresh `pnpm audit --prod --json` and `pnpm audit --json` both exit successfully:
zero reported vulnerabilities across 426 production and 522 total dependencies.
No dependency or lockfile was modified. Initial sandbox network retrieval failed;
the authorized network retry completed both audits.

All 68 registered official Debian advisory pages were fetched. Each still lists
a vulnerable trixie source-package row; no fixed trixie row was observed.
[CVE-2026-84243](https://security-tracker.debian.org/tracker/CVE-2026-84243)
continues to list glibc as unfixed. Existing exposure notes do not constitute owner
acceptance. This is a source-page refresh, not a new runtime scan or SBOM, and
retains the November 7 review deadline and pending owner status.

## Retained evidence

Local evidence is under `.local/upgrade-evidence/nov01-refresh/`:

- `receipt.json` binds all major receipts; `retrieval-manifest.json` SHA-256
  `f7617bb5f96a0f15e31541ca2b47ba3729110933c84d31989c2600baafe542bc`.
- `new-form-comparison.json` SHA-256
  `154922d44726d8ba2208e97c1bdd2e734b6ea5b8d947834e53cd10e7d6860e93`;
  complete canonical field, page/widget rectangles and independent word geometry
  are in `f1040sc.pdf.inventory.json` and `f1040sr.pdf.inventory.json`.
- Production audit SHA-256 `e9cae4590babf78b982f74a1e3636a81d566e5b8ecfa70633c19f69b677dbdb4`;
  full audit `5a53e55cf00fe12cf2baa62be93e62a01b390225c1294be768cb4472b14a3b2a`.
- `os-trixie-status.json` SHA-256
  `4a1b6eebc43d2c0acf1590df0c214d051c7c84cab8435ee8ecced05ad6fc6739`.
- `reader-repair-notes.json` retains a script-name import failure before any PDF
  reading and the corrected distinction between a keyword match and a watermark.

Disabled physical candidates for Schedules C and R are now committed in
`6ea8907b`. The [candidate ledger](upgrade-2026-final-schedule-c-r-candidates-work.md)
records author and parent field, saved-value, appearance and visual checks.
Schedule C final 2026 instructions, complete scenario data and required human
qualification remain separate; neither candidate is registered for exports.
