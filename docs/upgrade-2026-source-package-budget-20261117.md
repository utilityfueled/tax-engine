# Complete paired source-package window

The previous SQLite run spent about 76 minutes on the baseline before its
full-suite failure. Both baseline and candidate builds/full suites, five paired
regression cases and sanitizer checks share one package command. Its former
120-minute limit could not reasonably cover that work.

The manual source workflow now allows 315 minutes. Its live controller deadline
is 300 minutes, including the unchanged 15-minute cleanup reserve. The package
command has 240 minutes and is admitted only when ordinary time remaining covers
that entire window, a five-minute export allowance and two seconds of margin.
The five minutes is an admission allowance under the same deadline. The nominal
15 minutes outside the controller covers checkout/setup and upload/post-job
steps together. None of these allowances guarantees completion.

The planning model uses two baseline-paced variants (152 minutes), 30 minutes
for unmeasured paired/sanitizer work and 58 minutes of variation. Unknown costs
remain unknown. Every package, full-suite, fuzz, paired regression and sanitizer
gate remains. Shared controller limits, diagnostic deadlines, resource limits,
read-only permissions, owned cleanup and three-day retention remain unchanged.

Relevant checks pass: 15 source/derived-controller Vitest tests, 58 SQLite Node
controls, root typecheck, spec/inventory checks, scoped lint and actionlint.
New retained controls exercise the real build path with only preparation/daemon
boundaries mocked: insufficient remaining time submits no package command;
sufficient time submits the complete 14,400-second command.

The controller is one of the GPG harness's 37 source-closure members. Exactly
that member changed; the other 36 remain identical. A fresh candidate authority
passes the existing closure verifier, SHA256
`d5b0b54c281d4d895b6a8ff4bf461eb26db1ce462491ae2e85a0b42028084b46`.
It must be sealed against this package's actual commit; the earlier authority
does not cover these changed bytes. This establishes no native GPG result.

Private proposal authority: `nov18-sqlite-full-budget-proposal/MANIFEST.json`,
SHA256 `c70e61481c7ab936b9f61cb2536354e0569d98415503d215afc79df42a62b767`.
Independent review manifest: `nov18-sqlite-full-budget-independent-review/`,
SHA256 `dafa27386782bbf525f442db040d9d41d7ac5ce8adc1148d29d8369aa6e67917`.
Root evidence: `.local/upgrade-evidence/nov18-source-budget-root-adoption/`.
Actual Linux qualification remains pending.
