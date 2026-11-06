# Coverage worker allocation

Remote CI40197402617 at c9e057c passed17,119 ordinary unit tests but the
instrumented suite failed12 cases: eleven exceeded the existing five-second
per-test deadline in PDF/AST work; one later Ohio packet assertion observed an
undefined overlay. The latter followed a timeout in the same suite; causation
has not been established. The run is a failure, not accepted coverage evidence.

CI now runs `pnpm test:coverage --maxWorkers=1` so instrumented PDF and AST work
does not contend between workers on the small runner. Test selection, the
five-second deadline, assertions and coverage thresholds are unchanged.
The separate ordinary unit command still exercises the default worker setting.

The existing exact single-write PDF tree77675b7 passed17,100 tests with one
coverage worker and86.59 percent branch coverage. That is prior local evidence,
not proof of this or the final integrated CI head. A fresh remote result and
regenerated inventory remain mandatory. The workflow diff and YAML structure
were reviewed; all coverage and prerequisite steps remain present.
