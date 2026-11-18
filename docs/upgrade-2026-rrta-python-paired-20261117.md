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

## Default-off compound successor

A separate experiment combines Python 3.14.10 with an exact negative-only
literal prefilter against the unchanged Python 3.13.18/helper baseline. The
ordinary helper and interpreter selection remain unchanged. This tests the
combined candidate without assuming additive improvements or component causes.
The same 104 children, four-second child limit, eight complete output fields,
11 controls per branch, ABBA ordering, complete outcome retention and 10%
paired-median threshold for both exact saved PDFs remain enforced. A hit
retains the original scanner; the generated candidate is confined to an owned
temporary directory and checked before and after execution.

The six source paths match author manifest
`f7feeb79aec909af28537876ae5287c5e33f7d161928a2ba0b11d111f10c37dc`.
Independent source review
`8ae82d2a5fe833fcc3abc56dd959c844ddfcc742edafa2c958a1cbfa27f1fca0`
verified all 39 pins, 11 Node controls, 22 branch controls and four exact
complete-output parity observations. Scoped lint, spec, inventory and actionlint
passed. Earlier local filter timing used different PDF serialization; those
negative results do not predict this exact-input combined experiment. No actual
compound run or adoption is claimed here. The workflow defaults to false.
