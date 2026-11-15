# RRTA saved-PDF operand dispatch

The actual f307 self-host browser run failed two RRTA saved-PDF checks at the
unchanged four-second child deadline. Both complete PDFs and safe phase prefixes
remain retained in the [terminal review](upgrade-2026-remote-browser-terminal-20261115.md).
This package removes redundant type checks inside the privacy inspector. It does
not establish the cause or resolution of the remote failures.

Exact pypdf `NumberObject` and `FloatObject` operand leaves already received no
operand-string action. They now take that same result directly. Exact `list` and
`ArrayObject` containers traverse their children in the original order. Subclasses,
strings, names, byte strings, dictionaries, indirect references and unknown types
retain the complete original fallback and first-error order. No tuple traversal,
cache, parser, marker surface, privacy exemption or authoritative tax calculation
is added. Full graph, resource, encoded-string and final page-text checks, the
four-second deadline, 64-KiB child limit and exact eight-field result stay intact.

The spec precedes the regression. After correcting an unrelated ByteString
expectation, the unchanged predecessor genuinely fails its deterministic work
check (94 redundant probes versus zero); its second control passes. The minimal
implementation passes both. Author passes 1,018 tests across five suites and
root production typing/scoped lint. Independent review passes 98 focused tests,
948 spec checks and 2,231 additional old/new classification, first-error and
immutability vectors. Root separately passes 70 privacy tests, 948 spec checks,
production typing and scoped lint, and inspects both actual remote PDFs in bounded
children: all eighteen identifiers and every eight-field projection are preserved.
The first root pin lookup used the wrong base for sibling evidence; no source was
adopted by that failed prerequisite. The unadopted run and corrected replay remain
separate. Root's four privacy suites count 70; its separately run spec suite counts
948. An unmatched initial spec-file filter is not counted as an executed suite.

Local normal-child confirmation measures eight old/new pairs for each actual
remote PDF: mean 1.2401 to 1.1442 seconds at 1280px and 1.2451 to 1.1394 seconds
at 390px. Every full projection matches. A separate profile reduces type probes
from 1,152,655 to 667,093 while parser and text/deep-copy counts remain unchanged.
These are finite local measurements, without a timing assertion or remote pass.
An earlier parser-reuse prototype measured less than one percent benefit and
was rejected; its source and results remain private evidence.

Source freeze: `c55308e6c6e9069485e1e3d84eb226200669747ded162f2b6bb3ad28ae619a93`.
Independent review: `b175912b884ac4ad93d8a579beaa2432d48cd2c64a92293dbfde85d11e1e31bb`.
Root review: `c5daf981af81b4faac3307f2111aa3b402ca138f6a10fea625eb093f4221a464`.
Private packets: `nov15-rrta-argscan-fastpath-candidate`,
`nov15-rrta-argscan-amd64-peer` and `nov15-rrta-argscan-root-adoption`.
Integrated metadata, aggregate checks and actual remote/native/hosted successors
remain required. Filing, model promotion and release qualification remain closed.
