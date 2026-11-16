# Fixture-defined school browser controls — November 16, 2026

The initial school part-year browser entry now uses a reviewed fixture contract
for each control's native kind. The change removes repeated live type queries
while retaining independent exact-label checks and Playwright's strict native
fill/select actions. Missing, duplicate and wrong-kind controls still reject.
Unknown labels and kinds reject before actions. The removed count/type poll had
a five-second wait; native actions now use the existing action/test deadline.
That waiting behavior differs and is explicitly reviewed.

Both fixtures retain all 137 scalar values, 98 fill/Tab pairs, 39 selects and
eleven row additions in the same order. Confirmation, source invalidation,
unknown/zero, privacy, PDF geometry, save/reopen and filing denial assertions are
unchanged. The original school test file is byte-identical after reversing the
two imports and local entry adapters. No tax calculation or product code changes.

Spec-first private execution retains three failing tests before implementation.
Six permanent tests pass, including actual rendered component controls and both
fixture action/value sequences. Eight actual DOM cases pass: two positive cases
with all 372 events preserved per fixture, plus six negative strictness cases.
The original managed production runner passes all four desktop/mobile school
journeys (45.7 seconds total), with normal server cleanup. The selected batch
uses one worker within the unchanged two-worker ceiling, zero retries and the
original strict 30-second policy.

Scoped lint, normal web types, spec validation, inventory and 111 metadata tests
pass. A prior metadata run retains one stale literal-hash failure before source
hash refresh; its test and policy are unchanged. Browser collection remains
655 identities, five original skips, fourteen diagnostic targets and eight rate
windows. The finite dependency closure grows from 1,997 to 1,999 through the two
new helpers. Only required source hashes and generated inventory are refreshed.

Static protocol measurements show reduced helper overhead; they do not establish
application speed or resolve the separate NEW-212/RRTA remote failures. Full
current-source checks and remote/native qualification follow this commit.
Filing, model promotion and release readiness remain closed.

Evidence: independent source review `af7599530b6183b19a914d4355f2098dd00d213c50d8d20312884bf9bf88d325`;
root eight-DOM terminal acknowledgement `cebc7210f7097209caf029554403aed1ce09ff4e9fc30115125253057aeff9fc`;
closed adoption review `9b2359496706fa2e7c86cdd9b47e9a03638457a7cf40dc5839432f409fbc348a`.
