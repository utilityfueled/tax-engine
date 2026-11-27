# 2026 draft federal Tax and EIC Table reconciliation

On November 13, the IRS draft endpoint served Publication 1040 (2026) dated
August 28, 2026, with a draft cover. Its SHA-256 is
`407bc35ab09aaf034689341d7469b9b082cd2ceaa652e38ca5874c1dd1c3f12e`.
The final endpoint served Publication 1040 (2025). The release decision still
requires final tables and qualified tax review.
[Draft IRS Publication 1040](https://www.irs.gov/pub/irs-dft/p1040--dft.pdf) ·
[Current final IRS Publication 1040](https://www.irs.gov/pub/irs-pdf/p1040.pdf).

| Printed pages | Compared values | Result |
| --- | --- | --- |
| 2–13, Tax Table | 2,062 contiguous intervals, four printed filing-status columns, 8,248 cells | Zero differences with the existing Decimal progressive rates evaluated at the printed interval midpoints. The draft's $25,300 joint example gives $2,543. The surviving-spouse footnote points to the joint column. |
| 14–15, Tax Computation Worksheet | 21 sections of income by filing status, three cases per band | Zero differences across 63 values from $100,000 upward, including each finite band boundary, using the draft's printed multiplier and subtraction. |
| 16–27, EIC Table | 1,405 contiguous intervals, eight printed child/status columns, 11,240 cells and eight partial-interval footnotes | Zero differences using the existing 2025 table method with 2026 indexed maximums, phase-out starts, rates and cutoffs. The printed $2,455 nonjoint, one-child example gives $842. |

The tested source was `addd768897c129390cce693dd380910294d16e6f`. pypdf
layout transcription and a separate PDF.js coordinate extraction agree on
every Tax and EIC Table cell, including the eight EIC footnotes. Both start
from the IRS PDF. The comparison used Decimal and the existing indexed rates.
The statutory ordinary preview differs from the draft in 8,236 of 8,248
cells at each integer endpoint. At the example $25,300, it gives $2,540.
That November 13 comparison left the preview unchanged. On November 26,
`0d564ea03` applied the verified draft ordinary and EIC lookup to the 2026
draft. The final 2025 methods and year gates remain in force. The separate
technical extraction checks do not supply human review.
[Rev. Proc. 2025-32, §§3.01 and 3.06](https://www.irs.gov/irb/2025-45_IRB).

Private evidence is in `.local/upgrade-evidence/nov13-irs-draft-publication-1040/`.

| File | SHA-256 |
| --- | --- |
| Ordinary rows | `1dd1273b181617708f7d9e68eab4d6d0dc740d7b8fce87b9ef64d892cab1c3ee` |
| EIC rows | `770ff5907221cb6d3c609e2527b56694ce284bb9918bf3249af2285af50eee42` |
| Computation worksheet coefficients | `d7fe335a4b285e9a56279e9bf74bcf8ebc97e9aa98d9df92d0b9725ad1a25fed` |
| Decimal comparison | `a61e039300f6dfbb1f949fe28881f95496fd0632bd5e1948a1d5e160678e2bdc` |
| PDF.js comparison | `42b85f655a6e5ae915d794346ec7da03ea48be45cc5e3456cd63f10f9fd0c757` |

When the final release is available, extract its rows independently, compare
all differences against the draft and bind the final-year methods to those
expected values. Confirm the final instructions and worksheet paths, and
rerun full-return threshold, credit and audit controls before enabling 2026.
