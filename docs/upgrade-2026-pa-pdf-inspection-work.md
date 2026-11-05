# PA saved-PDF privacy inspection

The complete saved PDF text was lowercased again for each private marker. The
inspector now normalizes that same complete text once per invocation and checks
every marker against it. The original trailer, indexed and embedded objects,
decoded streams, page text, watermarks, active-content checks and privacy
assertions remain intact. No mapper or tax calculation changed.

Profiling the retained 18 PDFs and 60 markers confirmed 60 complete-text
normalizations before the change and one afterward. Profile timing is diagnostic,
not a general performance guarantee. The original five-second deadline and two
workers remain unchanged. Earlier actual timeout failures are retained.

The author passed all 21 focused tests. ROOT repeated the public `pnpm test`
command on the two existing PDF suites: 21 passed, including the complete
18-PDF/36-page case in 2,096 milliseconds on this host. Spec validation,
inventory checks and scoped ESLint also passed. Baseline and candidate inspectors
produced byte-identical JSON for all 50 retained PDFs/98 pages. Both denied the
same hidden private strings, decoded streams, metadata, widgets, JavaScript and
compressed private objects; a benign orphan remained accepted.

Current full unit, coverage, remote CI and distribution qualification remain
separate checks. No deadline, coverage threshold, privacy rule or readiness gate
was relaxed. Human review, final 2026 forms and filing qualification remain open.

The distinct engineering review verified the full candidate and retained corpus,
then passed 22 actual inspector replays covering compressed and orphan objects,
active content, Unicode, marker variants and cross-document privacy checks.
Author manifest: `5892006cd50c5820cfd1573cc098fdc5f4ec3622e00eff5787f4e425f417f1a1`.
Distinct manifest: `88395f39e7bc3e17d9ee4d1c005374d7ce77183d4746e8252bceefabe2e83daf`.
