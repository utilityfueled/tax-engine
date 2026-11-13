# Original nontaxable combat pay on Schedule 8812

`c699bfde` carries original W-2 Box 12 Code Q amounts into line 18a of the
2025 and 2026 ACTC calculation and records the total separately on line 18b.
Section 24(d)(1) includes section 112 combat pay for this purpose. The W-2
collector asks for the original amount and preserves an unanswered box. A
positive amount requires the actual owner and matching W-2 year. When combat
pay is reported, every W-2 needs its amount or confirmed zero. Previously
saved positive ACTC amounts require reconciliation or correction. A saved
zero cannot override positive original amounts. The federal EIC calculation
uses a [separate per-filer election](upgrade-2026-eic-combat-pay-work.md). [26 USC §24](https://uscode.house.gov/us/usc/t26/s24/) ·
[2025 Schedule 8812 instructions](https://www.irs.gov/instructions/i1040s8) ·
[2026 final Schedule 8812](https://www.irs.gov/pub/irs-prior/f1040s8--2026.pdf) ·
[2026 draft instructions](https://www.irs.gov/pub/irs-dft/i1040s8--dft.pdf) ·
[2026 W-2 and W-3 instructions](https://www.irs.gov/pub/irs-prior/iw2w3--2026.pdf).

The synthetic $2,000 wages and $2,250.50 combat pay produce exact worksheet
income $4,250.50, excess $1,750.50 and $263 rounded ACTC. AGI stays $2,000.
A joint control adds $1,200.10 and $1,050.40 exactly once. The saved 2025 PDF
rounds $27,250.50 and $2,250.50 to $27,251 and $2,251 in separate fields.
An unknown original leaves line 18b blank. A subsequent bounded
[2026 wage-only physical specimen](upgrade-2026-schedule-8812-wage-projection-work.md)
passed separate readback. Full qualification and human review remain pending.

The corrected baseline has eight genuine federal failures and the separate
guided baseline has one. All 597 targeted tests passed after correction, along
with all three type checks, the engine build, model registry, 8,862 spec
references and inventory. Scoped lint reported 30 existing warnings and zero
errors. The first added PDF test expected an empty string for a missing widget
value. The PDF reader returns `undefined` for a blank, and the corrected
assertion and complete targeted rerun passed.

Private evidence is under `.local/upgrade-evidence/nov13-ctc-combat-pay`.
The SHA-256 of `green-final-source.log` is
`bb87165dbf5a0e7a83ba41f3ae8f45f06866836ebbbf82446933e631a854b386`.
