# Combat pay on ordinary Pennsylvania and Ohio wage paths

`6e7b046b` requires a separate military compensation method when a current
W-2 reports a positive Box 12 Code Q amount. Code Q identifies nontaxable
combat pay reported by a military employer. The ordinary employee methods
cannot establish duty location, military pay exclusions or the tax treatment
of other wages from that box. The source guard covers both states’ three
residencies and the applicable ordinary employee, reciprocal, resident-credit,
married and Ohio school district entry points. An absent legacy box or an
explicit zero continues through the existing ordinary admission rules.
[2026 W-2 instructions](https://www.irs.gov/instructions/iw2w3) ·
[Pennsylvania military pay](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax/military-pay) ·
[Ohio military income tax](https://tax.ohio.gov/individual/military).

All nine new regressions reached the positive-cent assertion and failed on
the baseline. The rebound zero originals passed in each test. After correction,
all 7,348 tests across 282 state and Ohio PDF files passed. Engine types and
build, scoped lint, inventory and all 8,872 spec references passed. The browser
source hashes were refreshed with the same cases and limits. No annual form,
release or filing gate changed. Full military computation and review are open.

Private logs under `.local/upgrade-evidence/nov13-state-military-source-boundary`.
Baseline SHA-256 `723674d7e3dcdf456e70a16a54c6774c5df58da6b6ecfa59025e53aa8a07434f`.
Passing SHA-256 `c278da5d1a678217368a4e5b91bfdcf0916d406b9655cd1f07a1e19569752991`.
