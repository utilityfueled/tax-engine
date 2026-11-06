# Native controls after navigation resizing

The sticky navigation now preserves the visible content's offset when its
rendered height changes. An immediate native scroll can precede delivery of a
resize event: the original browser diagnostic recorded an 87px header growing
to 117px while the control remained at its old 95px inset. Updating CSS padding
alone did not move that already scrolled control.

The correction measures the actual header and adjusts an already scrolled
viewport by the height difference. Initial measurement, unchanged height and
page top do not scroll. Cleanup disconnects the observer, removes the listener,
restores the previous custom property when still owned, and denies queued
callbacks after unmount. A later owner's property remains intact.

Spec-first DOM tests retain the genuine 95-versus-125 position failure and a
separate queued-cleanup failure before their respective fixes. Final focused
`pnpm test` passes eight tests; web typecheck, strict scoped lint, spec validation
and inventory check pass. Both unchanged production-browser cases pass with
zero retries, two workers, original deadlines and no source drift. They test
both resize directions, keyboard focus, pointer actions, saved-state equality
and absence of outbound private facts. The final run took 29.104 seconds.

The earlier full-browser result remains 560 passed, seven failed and five
hosted skips. Six failures were real HTTP 429 responses in the shared download
window; the seventh was this resize defect. Their original artifacts remain
intact. Current full-suite, naturally spaced download batches, hosted/self-host,
final-form and human qualification remain separate required work. No browser
assertion, timeout, rate limit, privacy guard, tax fact or readiness gate changed.

Private root evidence: `nov05-navigation-resize-correction`, 46 verified members,
manifest `7f1be9760d89c6ca90d095a78b487ab6409431376addc7f08b41ad845bb28211`.
Distinct engineering review passes 12 actual DOM controls, including observer-first delivery, fractional heights, StrictMode cleanup and page-top transitions. Its seven-member manifest is `7e0a333ce0ae2baa1cc2f54a29574a198ff73b3fc1e122a3d0a3871a145a81cd`; report `dcbf26900e235160b73acde6ab19e92c6a5a796775a87bd9fb340c6435df9f25`. Root verified all evidence members and read both reports before adoption.
