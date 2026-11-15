# Head-of-household evidence layout

The original household evidence section now spans the guided form's grid row.
Previously, its length stretched an adjacent medical confirmation select to
1,124.67 pixels on desktop. The select is now 46 pixels high at both 1,280- and
390-pixel widths. This changes one section's layout; facts, calculations,
confirmation requirements, privacy controls and annual readiness gates are unchanged.

The specification note preceded a real production-browser regression: the
desktop case failed and the mobile case passed. After the correction, both
existing cases pass, including the added full-width, control-height and keyboard
Tab checks. Their original assertions remain. The deadline remains 30 seconds,
with no retries, unchanged request budgets and normal owned-server cleanup.
Both screenshots and the actual reports received separate engineering review.

Source preparation used `19a6134b`. The frozen three-file candidate is
`2e00695efa8ddef33e7f11b19ca55a04032ce1d87f58323c471ebc8958bafde1`;
the separate root review is
`72c665a08cd2a1e6a150d0e906474c102db10a7e2fbd33b439f122116336d26a`.
The retained evidence is in ignored local folder
`.local/upgrade-evidence/nov15-hoh-grid-layout/`.

Main verification includes nine affected model/engine tests, 941 guided/spec
reference checks, web types, lint and the unchanged inventory. The browser
metadata updates only the two changed source hashes and the dependent diagnostic
audit hash; case selection, request bounds, skips and timeout policies are
preserved. The full combined checks and hosted/native successors remain separate
work. No final 2026, human tax or release qualification is inferred.
