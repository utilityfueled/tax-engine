# Per-filer nontaxable combat pay election for the EIC

Local commit `439d4c87` implements the 2025 and 2026 election in
`spec/federal/eic-combat-pay-election.yaml`. Each filer elects whether to
include all of their original W-2 Box 12 Code Q amounts in EIC earned
income. Joint filers can make different elections. A positive amount needs
an identified owner and a matching W-2 year. Every original must be
confirmed when Code Q is present, including zero for an empty box.
An imported or previously saved incomplete source remains unresolved.
[26 USC §32](https://uscode.house.gov/us/usc/t26/s32/) ·
[Form 1040 instructions](https://www.irs.gov/instructions/i1040gi) ·
[IRS Publication 596](https://www.irs.gov/publications/p596).

The guided interview saves each owner's explicit election and invalidates
the election after its source originals change. The engine preserves
exact cents and records the elected amount separately from taxable wages
and AGI. The saved 2025 review PDF reports the elected amount on Form
1040 line 1i with IRS rounding. Schedule 8812 retains its separate Code Q
rule. The final 2026 Tax and EIC tables, independent expected-result
review and all release gates remain open.

Five new focused checks reproduced the initial gap. A separate red test
caught a malformed ownership group. All 206 focused tests across 22
files passed after the correction. Three type checks, engine build,
8,878 spec references and the 966-row coverage inventory passed. Scoped
lint reported 19 existing warnings and zero errors. The browser diagnostic
audit was refreshed against the same limits.

The first scoped invocation accidentally ran the full suite inside the
network sandbox and retained two loopback TLS failures. The proper
archived run uses private PostgreSQL 16.16, a frozen install and 15
byte-checked public samples. Its unit run passed all 27,715 tests in
2,006 files. Coverage and managed Chromium are tracked in the
[current continuation](upgrade-2026-current-status.md).

Private evidence is under `.local/upgrade-evidence/nov13-eic-combat-pay`.
The focused SHA-256 is
`1ac982c61fbdfb6a6a6ee374868d49fd1c9b447aec2e7bbda65915e4615c8d01`.
