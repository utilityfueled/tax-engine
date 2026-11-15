# Ohio blank-status mobile diagnostic correction

The exact `bf3e613a` full browser run completed all 641 cases: 635 passed,
one failed and the same five hosted tests skipped, with zero retries. All eight
windows completed and its owned server closed normally. The sole failure was
the school-district mobile geometry test's expected full validation message.

The actual schema now discriminates the remaining-payment object by status.
Unknown blank status rejects at that discriminator. Every valid status still
requires the source reference and explicit true confirmation. The old assertion
expected two child-field issues before a status had been selected. The repair
removes precisely those two expected paths, preserves the entire remaining exact
message, and adds an exact check that the saved blank status/reference/confirmation
remain empty/empty/null. It changes no product schema, source requirement,
geometry, timeout, retry, privacy or readiness behavior.

The spec note was updated first. Separate review verifies the exact guided
confirmation error and twenty missing/blank/false/null mutations across all four
valid payment statuses; every incomplete source still rejects. The 390-pixel
viewport, all before/error/cleared element-rectangle and alert-scroll assertions,
unknown-year check, saved-state equality and absent-review checks remain intact.

Private failure evidence: `nov15-main-parallel-bf3e613a/browser`; correction:
`nov15-oh-school-blank-status-geometry`; separate review:
`nov15-oh-blank-status-farmland-review`, receipt
`d1425312a3a33aeb55b51973263dc560ccded7a1be09e8067087b53a067d3093`.
An isolated production build of exact `8ab7ff49` plus the two explicit test/spec
overlays passes the actual corrected 390-pixel case in 2.1 seconds, using the
unchanged 30-second timeout, zero retries and two-worker configuration. All
three geometry phases have no out-of-bounds nodes or overflowing alerts; the
owned server closes normally. Actual saved-artifact review
`d0e1ddd26b7ba37ca9b5e85c32b4eae306102e898e63b7e9f942679c47b8dc53`
is in `nov15-oh-school-geometry-diagnostic-browser`. Root reverified result and
screenshot hashes and viewed the retained mobile screenshot. Corrected-source
aggregate and final runtime checks remain required. This is
engineering validation; filing/model promotion remain disabled and human
qualification remains pending.
