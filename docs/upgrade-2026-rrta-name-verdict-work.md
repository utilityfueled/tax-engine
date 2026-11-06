# Bounded RRTA saved-PDF name checks

The saved-PDF privacy inspector now reuses a successful marker check for an exact
immutable `NameObject` string within one inspection. Every original conversion
still runs. The set retains at most 4,096 names of at most 512 characters;
longer names and new names after capacity is reached receive the full original
check. Text strings, their original bytes, byte strings and subclasses receive
all original checks. Raw file, decoded streams, graph traversal, page text,
geometry, resource, cycle and independent-parser checks remain unchanged.

The spec and genuine public regression preceded implementation: the original
inspector performed 54 full name checks for 21 unique names. All 60 focused tests
in three files pass on the adopted source, preserving the original 54 privacy
and efficiency cases. Fourteen distinct independent controls pass, including
failed checks, hidden original-byte markers, subclasses, exact Unicode,
512/513-character boundaries, exhausted capacity and active-content rejection
after an equal name appeared as an ordinary value. The cache starts empty for
each inspection and marker list. Worst-case retained character payload is
8 MiB, with Python object and set overhead additional.

Both saved sixteen-page PDFs from the failed `9283c5f1` remote RRTA cases pass
baseline and candidate inspection under the original four-second and 64-KiB
limits, using all eighteen original markers. Each original eight-field result
is identical. Separately instrumented full name checks fall from 21,718 to 409
per document. These local observations demonstrate reduced repeated work;
they do not establish a material overall runtime improvement or a Linux timeout
fix. The rejected Do-index experiment is excluded.

The reviewed browser source audit changes exactly two existing hashes: this
helper and the separately reviewed PA-40 mapper. All 1,834 keys, 154 contract
files, request counts, windows, deadlines, retries and declarations are exact.
Neither change adds an HTTP request or browser action. The `760b6b0d` managed
and container browser jobs failed before cases because the PA mapper's audit
pin was stale; those failures remain retained rather than relabeled.

Main passes the 60 focused tests, inventory generation and check, spec
validation, all three type checks, full lint and actual source-audit admission.
The first package wrapper used the nonexistent `spec:inventory:generate`
command; that setup failure is retained. It was corrected to the existing
`spec:inventory` command without repeating or weakening the passing focused
cases. A new full integrated run and remote distribution checks are required.

Private evidence is retained under `.local/upgrade-evidence/`:

- `nov06-rrta-name-verdict-private`: 60-member author manifest
  `0f72407afe542102804e7eba4be78141f01ab691a6e9416fb57531993d739592`.
- `nov06-rrta-name-verdict-independent`: 11-member independent manifest
  `a8615593af7ac3f144c52ad05e5e70ca5fcd6efc2bc49624b6c0b6519bb3855a`.
- `nov06-pa-name-browser-audit-proposal`: four-member proposal manifest
  `de9fb78cc734a75f2c1e1a1b3dc85c586384d43a252ecf8d015de929b3760c11`.
- `nov06-rrta-name-verdict-main`: actual adoption and package checks.

The helper source SHA256 is
`c96790a2aa6d17ffe041dc75bfde40e2e5584defc3c836552f1d607049a99885`.
The audit SHA256 is
`99c966ae8497dabc60de005a13aca3600d579c8beafd2d9860c5e2734ceb7aa3`.
No privacy, filing, model, final-form or readiness gate changes. Agent review
supplies software evidence only; required human review remains open.
