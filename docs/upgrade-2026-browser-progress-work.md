# Saved guided progress and final-review exit

The five failures in remote Web run40210512815 (61d396f) exposed two real
workflow regressions and one stale fixture. Saved interview progress acquired a
completed-interview review summary, and the final-review exit synced without
recording that final visit. A seeded one-skipped fixture omitted final-review.

The fix derives completed review metadata only after the completed phase.
Pending counts, missing/conflicting years, source review, stale-preview
invalidation and draft-download gates still apply during the interview. The
explicit final-review action advances, saves and syncs the same final state;
switching to advanced mode from an earlier section preserves that progress.
The fixture explicitly visits final-review: six complete and one skipped.

Evidence on2026-10-25:

- Reproduced the five browser failures on fixed bd83a40. The initial W2 attempt
  lacked the sample-document prerequisite; after linking the existing samples,
  that case reproduced the same missing ready-to-review status as remote CI.
- Spec first, then a failing saved-progress regression, then implementation.
- Immutable tree cf15c75b7ef1fb2839fbf03a793511f3de656f0f on2cfe47c:
  246 unit cases in4files; web types; production web build;4,229spec references;
  lint0errors/26existingwarnings. Both affected browser suites pass38cases,
  including all five regressions, mobile display, missing facts and review-only
  output. No browser assertion was relaxed to accept the regression.
- Independent agent review found no actionable issue in the bounded delta and
  passed210adjacent tests in3files. This is agent review, not human security or
  tax qualification.
- Local evidence files are `.local/upgrade-evidence/browser-status-{snapshot.json,
  red.log,exact-green.log,exact-types.log,exact-spec.log,exact-lint.log,
  fixed-build.log,fixed-playwright.log}` and`agent-browser-status-review.log`.

These are local synthetic checks. Full current-tree CI, coverage and release
rehearsal remain separate required gates; no filing or production gate changed.
