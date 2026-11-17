# RRTA interpreter comparison — November 17, 2026

[Run 44190812240](https://github.com/utilityfueled/tax-engine/actions/runs/44190812240)
at `40f819b7ba7daac43f907090e73c3ea9361deea4` completed successfully as a
valid negative experiment. It compared Linux Python 3.13.18 and 3.14.10 on the
same pinned pypdf source and two fixed synthetic PDFs. All 104 scheduled
children were retained and passed without timeout under the unchanged
four-second child deadline. The fixed ABBA schedule and assessment were
independently recomputed; all eleven controls per interpreter and the complete
cross-inspection results agree. Actual interpreter/package/build/GIL/JIT
metadata and removal of the temporary inputs were verified.

The predeclared threshold was at least 10% paired median improvement for each
PDF. The 24 desktop pairs yielded 4.0744922688778225%; the 24 mobile pairs
yielded 4.177413413033565%. Both fall below the threshold, so this result
supports no interpreter adoption. No ordinary Web/CI Python version, helper,
privacy assertion, timeout or readiness gate changed. These timings establish
no browser CPU cause or strict current-runtime qualification.

Independent assessment SHA-256:
`ceb58ca301632679857fad9f16026562d827a38cdc7982866d2573df83b2fa25`.
The four-file artifact is 3,671 bytes, SHA-256
`264242644ea434714610effd021b423f63eb285e325b040b62a55c3e29effd25`.
[Source contract](../spec/browser/rrta-python-version-comparison.yaml).
The original strict privacy-child failures remain open.
