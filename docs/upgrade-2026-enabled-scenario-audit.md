# Public capability and entry-path audit

Assessed 2026-10-25 against committed application `4aef633`. This is a source and
software-gate audit. It does not establish independent tax review, final-form
qualification, staging security or readiness for release. The remaining source
packages in the execution checklist still need final integration.

| Entry path | Actual behavior | Evidence and remaining limits |
| --- | --- | --- |
| Public support matrix and README | 2025 calculations and review PDFs are experimental. All jurisdictions disclose unavailable filing; 2026 full calculations and PDFs are unavailable. | `tax-year-support.ts`, `/support`, README and frozen rule/map packs agree. Dedicated state components and reference summaries are distinguished from official complete packets. Launch-state selection remains unanswered. |
| Guided facts and saved workspaces | Actual year is retained; missing or conflicting original years block calculation. Changing facts clears a previous preview. Required source and household checks run before conversion into engine input. | `guided-interview-bridge.ts`, `workspace-guided-state.ts` and the guided year/source tests. The guide cannot infer a supported year from a template or substitute 2025 for 2026. DA intake is committed in `a66b5de` and capital-origin intake in `9d71c5f`; charitable-history and cancelled-debt collectors require their separate integration evidence. |
| Guided preview | Validated input reaches the canonical federal engine before any state preview. PA/OH use their dedicated adapters; other state previews remain expressly experimental. | `guided-preview-compute.ts`. Actual Decimal sums preserve source cents. Audit identified omitted DA withholding in the generic state aggregate; `a66b5de` corrects it with exact `.40 + .10 + .20 = .70` retained-state sources and excludes another state's `.30`. |
| Workspace review download | The year gate runs before calculation. Original identity participates in calculation and source matching; renderer copies are redacted. Readiness findings are printed in the cover sheet. | `workspace-filled-return.ts`, `fill-return.ts`, `return-readiness.ts`. Original DA-only returns require transaction detail even with zero net gain. Partial/reference packets never become filing-qualified. |
| Complete-data filing export | A separate renderer requires a compiled scenario, exact rule version, full source facts, final form hashes and review/approval records. The scenario allowlist is empty. | `filing-return.ts` and `filing-registry.ts`; there is no request, AI or environment bypass. Synthetic registry tests are not a qualified scenario. |
| Self-host recovery | Encrypted local backup preserves browser-only answers and document bytes; review bundles and server database backups cannot substitute for it. | Recovery tests and `self-hosting.md`. Browser/container rehearsal must name the exact tested commit and image. |
| Hosted persistence | The production route creates the configured PostgreSQL metadata-shell store. It applies the privacy allowlist independently of the browser. | `hosted-workspace-route.ts`, `hosted-postgres-workspace-store.ts`. Corrected stale self-host instructions that implied manual factory/blob-store registration was required for this built-in path. Real staging auth, isolation, outages and recovery remain unverified. |

The focused immutable run passes 64 tests in seven files with zero failures or
skips: public support, guided year retention, both review-bundle paths, filing
registry gates, packet readiness, original document years and unsupported-route
messages. Evidence is `.local/upgrade-evidence/enabled-scenario-gates-4aef633.log`.
The same committed application passes all 17,754 coverage tests in 918 files,
86.98% branches against the unchanged 85% threshold, all three type checks,
4,634 spec references, inventory freshness, both builds and lint with zero
errors. The browser run records340passes/5hosted skips/2PDF-reader prerequisite
failures, with both failures passing on a focused pinned-reader rerun. The
browser prerequisite repair is committed in `b31b5df`. The arm64 runtime passes
smoke and six-phase recovery; scan/advisory evidence is
recorded in `upgrade-2026-runtime-4aef633.json`. Final code still needs a full
integrated run.

A subsequent three-probe source audit reproduced2025 current-gift defects:
explicitly unqualified cash/property gifts and an out-of-year gift were accepted.
The actual charity-source package owns the correction; no completion or release
claim is made while these remain.

No completeness claim is made for every tax method in the federal-method ledger.
Deliberately unsupported source histories remain internal implementation
boundaries. They are distinct from the missing external reviews, provider
evaluation, staging evidence and final 2026 forms. The final release assessment
must reconcile all subsequent packages with this audit and the execution brief.
