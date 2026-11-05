# Ohio school currency confirmation

November 5 UTC, 2026. This bounded UI repair preserves confirmed actual school
sources when the existing currency control only adds display grouping on blur.
It changes no tax formula, source schema, monetary rounding or filing gate.

The amount callback applies its existing normalizer and compares the result to
the raw stored primitive with exact string equality. An identical value emits
no parent update. A different value still follows the existing edit path and
clears confirmation. Equal cash with different text or changed source provenance
continues to require explicit confirmation. Current packets are revalidated by
the existing builder; a retained flag cannot admit stale or invalid facts.

Spec-first actual ReactDOM tests reproduce four failures among eight controls
before the repair. Unchanged full-year and part-year blur each emitted one false
source edit; actual changes emitted a redundant second edit. All eight pass
after the one-callback repair. The focused set passes 151 tests across seven
files. Tests exercise actual input/focus events, parent state and packet builders,
including unknown, explicit zero, malformed text and changed provenance.

ROOT's full `pnpm test --maxWorkers=2` passes 25,253 tests in 1,855 files with
zero failures or skips, including all 53 real PostgreSQL assertions in six files.
It uses a disposable loopback PostgreSQL 16.14 instance and the pinned local
Python/pypdf environment. All three type checks and spec validation pass
(8,213 references, none missing or broken). Inventory initially reports the new
spec missing; regeneration adds only its explicitly unsupported UI entry, and
the recheck passes. Lint has zero errors and the unchanged 11,715 warnings.

The independent source review passes at component SHA-256
`9b197d6491fbcaf9d0ca3d4a6736673f51f3fcc42e0ac4baf1202c23c50c92d0`,
spec `1ff41127af4dd951f23f09f09587b2986f616d962e0502182d1441df6ea0914f`
and test `d53f5f910685c3642868d9af29cded760892fa662d8ecae1f6ec86582e70404b`.
The author evidence manifest is `816856fa6a8ff33b21aab7c699d236dc302c1d555d6b5e650ee13fee457d8117`;
distinct review manifest is `7615d56499eaaa5e89d90a3051c8faea37cbafc995f9dc8d40f64db060c33cfb`.
Private evidence lives under `.local/upgrade-evidence/nov05-oh-school-currency-noop-*`
and `nov05-school-noop-root-checks/`; full unit log SHA-256 is
`7e1de926dd9fcbd73d865ade2e25562acf134d89f0878224fa6a1c60ca8582d7`.

Coverage is still running at this package checkpoint; builds and actual browser
validation of the changed source remain pending. An unrelated private PA probe
accidentally selected a broader test set during coverage and was stopped; that
receipt is retained separately and supplies no product validation. No performance
or CI-deadline claim follows from this correctness repair. Historical remote
failures, final distributions, staging, qualified human review, final 2026 forms
and the remaining execution-brief gates stay open.
