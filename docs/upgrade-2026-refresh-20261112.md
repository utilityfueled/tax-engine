# November 12 official source refresh

The checks below were made November 12, 2026 Eastern time against the
repository after PR #13 merged. They establish public document availability
and published rates. Existing filing and model qualification gates remain
closed.

## Federal forms and rules

- The IRS final Schedule 8812 is now for 2026. The download index records
  its November 9 posting. The form prints $2,200 per qualifying child, $500
  per other dependent and the $1,700 refundable ceiling per qualifying
  child. It references Form 1040 line 11b for AGI and updated Schedule 2
  line numbers for the payroll calculation. The main instructions endpoint
  still serves 2025, and the 2026 instructions carry a draft warning. Use
  the final form for physical mapping work and qualify dependencies when
  the IRS publishes the final instructions and related forms.
  [IRS file index](https://www.irs.gov/downloads/irs-pdf?order=field_pup_posted&sort=asc),
  [final Schedule 8812](https://www.irs.gov/pub/irs-pdf/f1040s8.pdf),
  [current instructions](https://www.irs.gov/instructions/i1040s8),
  [draft 2026 instructions](https://www.irs.gov/pub/irs-dft/i1040s8--dft.pdf).
- The final Form 1040, Tax and Earned Income Credit Tables, Schedule 1-A and
  Schedule A endpoints still serve 2025. The IRS 2026 Form 1040 and Schedule
  1-A are drafts. The final 2026 C, R and SE endpoints remain available and
  have disabled physical candidates in the repository.
  [Final 1040 endpoint](https://www.irs.gov/pub/irs-pdf/f1040.pdf),
  [tax tables](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf),
  [Schedule 1-A](https://www.irs.gov/pub/irs-pdf/f1040s1a.pdf),
  [Schedule A](https://www.irs.gov/pub/irs-pdf/f1040sa.pdf),
  [draft 1040](https://www.irs.gov/pub/irs-dft/f1040--dft.pdf),
  [draft Schedule 1-A](https://www.irs.gov/pub/irs-dft/f1040s1a--dft.pdf),
  [Schedule C](https://www.irs.gov/pub/irs-pdf/f1040sc.pdf),
  [Schedule R](https://www.irs.gov/pub/irs-pdf/f1040sr.pdf),
  [Schedule SE](https://www.irs.gov/pub/irs-pdf/f1040sse.pdf).
- The Schedule 3-A search returned the proposed rule and the hearing
  cancellation. No final rule was located in this bounded search. The Form
  172 instructions remain December 2024. They still exclude section 1202
  exclusions from line 2 and do not resolve the disputed example in the
  [review handoff](upgrade-2026-external-actions.md).
  [Proposed rule](https://www.govinfo.gov/content/pkg/FR-2026-08-20/html/2026-16985.htm),
  [hearing notice](https://www.govinfo.gov/content/pkg/FR-2026-10-09/html/2026-20790.htm),
  [Form 172 instructions](https://www.irs.gov/instructions/i172).
- SSA still lists the 2026 wage base as $184,500. The indexed adjustments
  remain in Rev. Proc. 2025-32, the estimated-tax publication is for 2026,
  and the AFTR outline is for 2026 returns. Publication 4557 remains the May
  2024 safeguarding guidance.
  [SSA wage base](https://www.ssa.gov/OACT/COLA/cbb.html),
  [Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB),
  [Publication 505](https://www.irs.gov/publications/p505),
  [AFTR outline](https://www.irs.gov/pub/irs-pdf/p6079.pdf),
  [Publication 4557](https://www.irs.gov/pub/irs-pdf/p4557.pdf).

## Pennsylvania and Ohio

Pennsylvania's personal income tax page links the 2025 annual PA-40 and
offers separate 2026 estimated-payment forms. Ohio's current individual
form index lists 2025 IT 1040 and SD 100 with 2026 estimated payment coupons.
The bounded checks did not locate final 2026 annual forms for the selected
states. The existing resident, part-year and nonresident scope remains.
[Pennsylvania personal income tax](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax),
[Pennsylvania forms](https://www.pa.gov/agencies/revenue/forms-and-publications),
[Ohio individual forms](https://tax.ohio.gov/individual/get-a-form).

## Provider catalog and pricing

OpenAI continues to document GPT-6 Luna and GPT-6.1 Sol. The short-context
standard input/output/cached-input rates per million tokens are
$0.10/$0.50/$0.01 and $2.00/$10.00/$0.10 respectively. Google continues to
list Gemini 3.8 Flash as stable, with standard text prices of
$0.75/$3.75/$0.075 through December 31 and $1.50/$7.50/$0.15 starting
January 1. Output pricing includes thinking tokens. Cache storage is
$0.50 then $1.00 per million token-hours. The model eval catalog check
passes. No new authenticated request or charge was needed for this refresh.
The existing OpenAI reserve, held-out review and Google account-access gaps
remain in the [external-action handoff](upgrade-2026-external-actions.md).
[OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Google pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-flash),
[Gemini 3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash).
