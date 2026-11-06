# Native official-sample size correction

The November 5 HTTPS refresh of the exact tracked official sample registry
retrieved 15 PDFs totaling 39,785,215 bytes. [IRS Publication 4491](https://www.irs.gov/pub/irs-pdf/p4491.pdf)
was 27,347,185 bytes, larger than the native inspector's old 16 MiB per-file
limit. The initial bounded retrieval failure remains retained; two subsequent
bounded GETs completed the saved collection. No native operation ran.

The spec-first correction admits these fixed registry samples through 32 MiB
per file. Aggregate 64 MiB, 32 files, registry/API 1 MiB, sidecar 8 MiB, exact
IDs/origins/lengths/hashes and before/after file custody all remain unchanged.
Application uploads and taxpayer-document limits are unchanged. This adds no
filing, model, hosting or release qualification.

The author records genuine 105-pass/one-failure RED, then 106 passes. Distinct
review passes 109 tests, including all 15 actual saved public PDFs through the
candidate inspector with synthetic tree/runtime observations, late-byte drift
and aggregate-limit rejection. The same saved collection genuinely fails the
old 16 MiB inspector. The reviewer verifies saved receipts and bytes without
claiming an independent repeat of the HTTP exchange.

Current-main focused provenance/orchestrator/timeout checks pass 140 tests in
three files. TypeScript, contract/web types, spec validation, inventory freshness, build and
lint pass; lint retains the existing 11,863 warnings with zero errors. The current
native controller must bind the later adopted source; the saved `6393455d`
source export and historical runtime results cannot be relabeled current.

Private evidence under `.local/upgrade-evidence`:

- `nov05-native-large-official-sample-private`: 26-member manifest
  `98e62a637d7a1b7760b44972e62dfdd323f2ab0bf4e26f30c0bcbbe2d371f058`.
- `nov05-native-large-official-sample-independent`: 23-member manifest
  `a4e4beeec0bcfe39b124c77ea486059e8832b9667d0b96689e1e82167cfe24bf`.
- `nov05-native-current-source-preparation-large-samples-v2`: 34-member
  manifest `3cafe91a15660207ef9e08c69845b0ba025c029a12593cc1e04b9adf9df9bbe8`.
- `nov05-native-current-source-preparation`: 17-member initial-HOLD manifest
  `c01929bc689e92c3cc569ad743f268a857d122c047c0119831950f7f9eedf6ea`.
- `nov05-native-large-official-sample-main`: current-main checks.
