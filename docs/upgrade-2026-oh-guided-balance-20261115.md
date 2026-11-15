# Guided Ohio school-district original balance entry

The existing finite 2025 school-district interview now collects known credited
amounts, including explicit zero, and distinguishes an unpaid balance, planned
full payment and actual full payment with the original return. Receipt owner,
year, district, date, account and confirmation must reconcile. Editing these
facts invalidates confirmation. Inactive receipt facts require explicit removal;
missing facts are never silently replaced or discarded.

The desktop and mobile example uses $1,000 tax, $600 withholding and no estimated
payments. Line 18 remains $400. An actual $400 original-return remittance settles
the outstanding cash to zero without becoming a second line 12 credit. This
collects the [previously reviewed original-source method](upgrade-2026-oh-school-balance-20261115.md);
it changes no tax formulas or district methods.

The spec preceded implementation and the author retained three genuine failing
tests. Main adoption passes 81 tests in five suites, web types, spec validation
and scoped lint. Separate root review passes ten tests in three suites,
including six independently authored replay, stale-account, contradictory-fact
and missing-original cases. Author desktop and mobile browser cases both pass
with the original 30-second deadline, zero retries and zero allowed external,
provider or filled-return requests. Save/reopen, edit invalidation and the closed
2026 path were exercised. The owned server closed normally.

Seven-file freeze: `f015d835d086fe772d05b7d648f4c330b938234067b0435a381a81516391d08f`.
Actual browser receipt: `26b1aab7bf0a8422fb89151b0259a51db0ecfbed34d0eb67087a2ca174d00578`.
Independent adoption receipt: `82c69af9d163b09fed919d6d462f109d2eabfa0b7a6d62d319a62aaf381bf325`.

Earlier runner setup, readiness and nested-label selection failures are retained
privately; corrections did not weaken application assertions or browser limits.
The earlier a32 aggregate/runtime evidence excludes this package. Final combined
checks, qualified human review, final 2026 forms and filing remain separate gates.
