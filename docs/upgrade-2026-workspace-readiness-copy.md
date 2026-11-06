# Workspace advisory wording and year gates

The prior-property visual review found that the optional follow-up panel said
“Your return bundle is ready” beside “Unsupported year” for a saved 2026 return.
The existing calculation and PDF gates were closed, but the sentence overstated
readiness. The panel now asks the user to review advisory follow-ups and documents
that need attention. It makes no readiness claim.

The existing unknown-year and unsupported-2026 browser cases now assert that
this ready sentence is absent. All existing restored-2025, private review PDF,
unknown-year, 2026 and privacy assertions remain. The change is limited to the
paragraph and one browser assertion; it changes no calculation or output gate.

Scoped lint and the production webpack build pass. Four browser cases pass
with one worker and zero retries at 1280 and 390 pixels: two year-restoration
cases and the two integrated prior-property cases. The parent personally viewed
the new 2026 desktop capture and confirmed the corrected text beside the
unsupported status. The server stopped and localhost port 3493 closed.

The first server attempt was blocked by sandbox `EPERM` before browser assertions.
The successful unchanged webpack build was reused for the permitted local run;
that failed setup and its logs remain retained.

Evidence under `.local/upgrade-evidence/`:

- `parent-workspace-readiness-copy/checks.json` (build/lint and first setup):
  `99a34b3a79cfc67afe13d770c423fe6638c493345d31c64bfcf61547615feab0`.
- `parent-workspace-readiness-copy-attempt2/checks.json` (four browser cases):
  `1c66ec2465bfca32bdf446c81affe4056c68763f9ccd443ecfe43d0a18f3d320`.
- `parent-workspace-readiness-copy-attempt2/visual-review.json` (observed correction):
  `6c0e78a8698eb68a1ae73b7d87b0ac19fe385d6d5f91a8861c6a0620e3247c2e`.

The tested source consists of the separately reviewed prior-property package,
its metadata/inventory update, and these two copy/regression files on `0c65b82f`.
The tax package is committed separately as `6fc4312d`. This evidence is local and
synthetic; it establishes no hosted staging, human review or filing approval.
