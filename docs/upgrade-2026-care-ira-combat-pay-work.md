# November 13 dependent-care and IRA combat pay

The 2025 Form 2441 instructions give each filer a separate full-Code-Q election
for Parts II and III. The 2026 draft uses the same directions. Publication 590-A
includes the full nontaxable combat pay reported in Box 12, Code Q, in IRA
compensation. The EIC election is separate. [2025 Form 2441 instructions](https://www.irs.gov/instructions/i2441) ·
[2026 draft instructions](https://www.irs.gov/pub/irs-dft/i2441--dft.pdf) ·
[Publication 590-A](https://www.irs.gov/publications/p590a).

`6cccc932f9d3322383ea0eda692868d567d8049f` updates the source rules in
the spec and explains both treatments in the guided interview. Changing
actual W-2 entries or self-employment facts invalidates the confirmed Part II
worksheet while preserving its answers. Changing the EIC election alone
leaves the Part II confirmation in effect.

Both new regressions failed before the implementation. Afterward, all 299
tests across nine targeted files passed. Web types, the 966-row inventory,
8,880 spec references and the diff check passed. Repository-wide lint passed
with existing warnings. Full local checks for the new archive are in progress.

| Evidence | SHA-256 |
| --- | --- |
| Original failing test output | `d9209e3ac9b4f422d35a9e1bfa759ab5e9f246bdf9d8a5e4360c063ce7d70ba0` |
| Focused passing output | `cfbd2154621d9bac3dfa6dc2fe37da6f126536a748611d3ae0e5071d80334dd2` |
| Spec validation | `e9fb95752126108aec11059e6620792d9ba0d95ac2897438ae740fa4cbaae3e9` |
| Prior exact `439d4c87` combined checks | `61d7fad352e44777961be89c1cc531873ecbfd7275c4f97edf8d4686306f7b1e` |
| Prior exact `439d4c87` Chromium report | `1403a242ab1457f122cd2cc244c80b84a00abfcf027d2a2d6dbe685550add9ab` |

The prior archive passed all 12 checks. Unit and coverage each passed 27,715
tests in 2,006 files at 87.85% branch coverage. Managed Chromium passed 621
cases with five hosted-only skips. Qualified review and final annual
instructions remain open.
