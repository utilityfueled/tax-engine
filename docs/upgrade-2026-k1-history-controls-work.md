# K1 history control coverage

The complete9bcf47b coverage run passed all18,079 tests but failed functions at
89.96% against the unchanged90% threshold. Branches passed at86.97% against85%.
The K1 source collector had uncovered history-editing callbacks. This package
adds three source-contract spec entries and real React DOM workflows; it changes
no calculation, collector behavior, threshold, exclusion, readiness or privacy
control. Monetary assertions use exact source strings without arithmetic.

The workflows exercise:

- Passive history add/edit/remove, exact original and qualified cents, known
  false participation, immutable saved input, and unknown history versus an
  explicitly empty list. The canonical bridge accepts the complete source before
  editing, rejects missing/unconfirmed records and accepts after reconfirmation.
- Independent basis, at-risk and SE source removal/re-entry. Missing values stay
  unknown; zero permits the existing ordinary route. Positive unsupported prior
  basis/SE losses remain saved while preview blocks. Final complete source
  values reach the canonical K1/6198 contract without an entered allowance.
- EBL source selection limited to actual regular EBL origins, deep original
  snapshots, exact qualified history cents, stale-source rejection and source
  re-copy/reconfirmation. Removing a qualified history cannot make an existing
  regular EBL disappear from the required contract.

The spec entries were written before the tests. The first two workflows passed
immediately. The new EBL test accidentally included two original2021 vintages;
the existing one-origin-per-year guard correctly rejected that fixture. The
saved diagnostic identified this test-only error. Its separate ordinary record
now originates in2022 with a2023 history; no product guard was changed.

Final checks pass11 tests/3 files, root types, all4,999 spec references and scoped
lint with zero errors/warnings. A separate agent read the spec and full control
workflows and independently reran11 tests/3 files with no actionable finding.
The final non-null-assertion cleanup uses explicit fixture-presence guards and
was rerun with the same assertions. Exact source SHA256 and evidence hashes are
in `.local/upgrade-evidence/k1-history-controls-final-manifest.json`; logs are
`k1-history-controls-final-tests.log`, `k1-history-controls-final-static.log` and
`ai-k1-history-controls-review.log`.

This is bounded software coverage evidence. It does not establish the global
coverage result: a full current integration rerun remains required after the
remaining law/source packages. It is not human tax qualification, staging or
filing evidence.
