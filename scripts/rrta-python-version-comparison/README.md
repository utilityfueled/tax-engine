# RRTA interpreter comparison

Standalone, nonqualifying manual experiment. Default mode compares Python versions using the same unchanged helper. Actual run44190812240 completed below the10percent threshold on both PDFs; no version was adopted. Ordinary Web/CI Python and privacy inspection remain unchanged. [Actual result](../../docs/upgrade-2026-rrta-python-paired-20261117.md).

The public `utilityfueled/tax-engine` artifact `14372125476` belongs to completed run `44169011257`, source `2fccaa27f2305e2f59db43a0067e19f4c631898f`. Read-only metadata was rechecked: unexpired, 459,416,206 bytes, SHA256 `20d8d9e49a5f355aaf5f64d205c4b6300aac2334b535c12afc0616a8b88f7676`. `inputs.json` pins exactly two 509,346-byte PDF members, their full eight-field expected outputs, the eighteen already asserted fictional test markers, unchanged helper and requirements. This is a test fixture provenance claim; it is not a claim about arbitrary artifact contents. The extractor opens only those exact members, bounds their sizes, checks hashes, rejects duplicate names and never extracts the archive tree. No local/private PDF is staged or uploaded.

The workflow uses existing read-only Actions access. One authenticated metadata GET and one authenticated archive-redirect GET use the temporary job token; only the signed fixed-provider HTTPS blob download follows, **without authorization**. Host/path/query/token values and all network error details are never emitted. The downloaded archive, two PDFs and venvs remain in an exclusively created runner temporary directory and are removed in `finally`; failures to remove force HOLD. The eighteen already-public fictional markers are source-pinned in `inputs.json` and passed transiently through memory/stdin; raw markers are never diagnostic artifact output. Artifact retention includes only explicit JSON projections, never that temporary tree, raw PDF data, output/error strings, command lines or URLs.

Both regular-GIL Linux x64 CPython versions are exact: **3.13.18** and **3.14.10**, supported by the official Actions manifest. Setup-python v5 is pinned to official commit `a26af69be951a213d495a4c3e4e4022e16d87065`. Each receives the SAME hash-locked pure-Python pypdf 6.10.0 wheel; installed package `.py` source digests must match. Probes require CPython/Linux/x86_64, exact versions, normal GIL and disabled JIT. Actual compiler/build metadata and ten allowlisted ABI/build-feature sysconfig values are recorded, along with hashes of CFLAGS/CPPFLAGS/LDFLAGS/CONFIG_ARGS (never raw command/path strings). These remain stable within each interpreter before/after comparison; they are not required equal between distributions. No existing local venv is changed. Neither local 3.14.6 controls nor a future positive comparison establishes pure-version or Linux failure causality.

For EACH exact PDF: four warmups (two per version), then twelve ABBA blocks. Totals are **104 comparison children / 8 warmups / 96 measurements / 48 paired comparisons**. Each invocation preserves the original `-I -B`, `--phase-fd3`, the original four-pipe stdio (including FD3 phase timing), 4,000ms timeout, 65,536-byte output limit, SIGTERM and sanitized environment. Raw FD3 records stay transient and are never uploaded. All eight output fields must equal the pinned baseline; every attempted comparison is saved, including failure, overflow and timeout. No retry, exclusion, percentile filtering or replacing censored timings. Separate two synthetic parity workers check clean geometry, identifiers in text/hex/octal/nested data, integers, malformed input, first-error ordering and cross-inspection isolation under the same unchanged helper. Their outcomes must agree across versions. These controls/preflight children are separate from the 104 comparison children.

Any missing/failed/censored comparison or changed control outcome holds the performance conclusion. With all attempts valid, require paired median improvement **at least 10% separately for BOTH PDFs**. A completed comparison with less improvement may exit zero but explicitly records `thresholdPassedBoth:false`; it never authorizes adoption. No release/security/tax/human-acceptance claim is made. A later interpreter adoption still requires independent review and the original full 655 cases/650+5, configured two workers, zero retries, 30-second cases and unchanged four-second privacy deadline, plus other Python consumers.

The standalone workflow is manual-only, exact main SHA/first attempt/public repository, read-only permissions and unique run-id concurrency, so it cannot cancel normal Web/CI. Job limit is 20 minutes; the experiment step is 16 minutes. Bounded preparation worst-case is approximately 7 minutes (two metadata requests 15s each, archive 180s, extraction 10s, wheel 60s, venvs 30s each, installs 30s each, two 4s probes). All comparison timeouts together require approximately 7 minutes, leaving cleanup headroom. Job timeout/cancellation is still an exceptional incomplete/HOLD outcome, never a successful cleanup assertion. There is no larger per-case or helper deadline.

After independent source review, commit and root review, dispatch ONCE:

```sh
gh workflow run rrta-python-version-comparison.yml --ref main -f source_sha=EXACT_REVIEWED_MAIN_SHA
```

Do not dispatch from this preparation. Expired/changed artifact metadata, unsupported signed-download host, unavailable interpreter/wheel, changed source or any failed admission yields HOLD; do not substitute PDFs or retry automatically.

Offline controls:

```sh
node --test tests/scripts/rrta-python-version-comparison.test.mjs
node node_modules/eslint/bin/eslint.js scripts/rrta-python-version-comparison/run.mjs tests/scripts/rrta-python-version-comparison.test.mjs
```

References: [official interpreter manifest](https://github.com/actions/python-versions/blob/main/versions-manifest.json), [setup-python exact-version selection](https://github.com/actions/setup-python/blob/v5/docs/advanced-usage.md), [read-only artifact API](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact), [pypdf 6.10.0](https://pypi.org/project/pypdf/6.10.0/).


## Explicit compound experiment

The default-false `compound_prefilter` input selects a new combined candidate:
A is Python3.13.18 with the original helper; B is Python3.14.10 with the exact
previously tested negative-only literal-filter derivative. This is a distinct
experiment. The runtime-only comparison and earlier local filter comparison
individually missed their predeclared thresholds; their timings cannot establish
a combined gain. The earlier local filter PDFs were a different serialization;
the new experiment retains the exact original source-pinned two-PDF input set.

Both event input and environment must canonically agree. The complete original
and derivative source hashes are fixed; an altered source holds the comparison.
The derivative exists only in the owned private temporary directory. Every
positive byte hit follows the original scanner; text-marker matching remains
exact escaped literal matching. All original parsers, surfaces, exemptions,
limits and privacy controls remain. Both helper hashes are checked afterward.
The versions/result records identify the experiment mode and helper hashes.

The same104children, four-second cap, full eight-field output parity, eleven
controls per interpreter, ABBA schedule, all-outcome retention, cleanup and
10percent paired-median threshold on EACH PDF apply. No individual-component
causality or automatic adoption follows. No ordinary helper or interpreter is
changed. Actual compound execution is pending.
