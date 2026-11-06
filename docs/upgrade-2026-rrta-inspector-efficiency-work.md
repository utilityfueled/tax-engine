# Bounded saved-PDF inspection reuse

The b1 remote managed browser run failed both RRTA paper cases at the bounded
saved-PDF inspector. Its raw child outcome was discarded, so the cause remains
unknown. Both actual saved PDFs pass the original inspector locally. Public
Python linkage evidence also rules out the proposed missing-library-path fix;
no environment inheritance change is made.

This test-infrastructure change prepares marker encodings once per inspection
and reuses parser operations/spans for identical immutable content bytes within
that same reader. The memo admits at most 8 MiB of keys and 4,096 entries; reaching
either limit falls back to full parsing. Every reference still checks its own
resources, Do calls, cycles, ambiguity, context and arguments. Complete graph,
trailer, xref, decoded-stream/string and identifier scans remain. No result,
document or fact cache crosses inspections. The independent parser comparison
and nine original function ASTs remain exact.

Child failures expose only fixed timeout/spawn/signal/exit/stderr/output/JSON/
projection categories. They expose no raw child error, code, streams or identifiers.
The four-second child deadline, 64 KiB bound, isolated interpreter and exact
eight-field success schema stay unchanged. Browser actions, thirty-second case
deadlines, configured two-worker limit, zero retries and all privacy assertions
remain unchanged; the action audit changes only two existing source hashes.

Specs and tests precede implementation. ROOT reproduces 31 passing/11 failing
tests on the original implementation, then 42 passing tests after exact adoption,
including all 24 existing privacy controls. Unicode, repeated content, resource
changes, missing resources, cycles, full-parse fallback, cross-inspection reuse
boundaries and safe error categories are covered. Both actual remote 509,355-byte,
16-page PDFs retain identical eight-field results: 18 markers and 21 geometry
substring exemptions each. The observed parser calls decrease from 646 to 193;
all measured content/context, argument, graph and byte-scan visit counts stay exact.
These local observations do not qualify Linux timing or prove the remote cause.

All nine relevant static checks pass: three type checks, both builds, lint,
8,582 spec references, inventory and the real source audit. Both actual desktop/
mobile browser journeys pass, zero retries/skips, and the owned server closes.
The first sandbox attempt stops at the port preflight before any server/test;
no listener or foreign process is touched. The authorized local-browser rerun
passes with all original limits. The new saved-PDF helper does not change a tax
calculation, rendered output, export readiness or provider behavior.

Private author manifest: `9aae41a537fa5113024e3d63c71a4f6b97079a1fe8548fb790e9c1875437b874`.
Distinct ROOT source review: `862877b95e7742457a41301b17930621e6c50d7e0ca732666bd6e9e4eedefc71`.
The source baseline is `b1d3ccdce52670575d5061be35c418cb774cd462`.
Full successor global/remote/image runs, independent human review, final 2026
forms, staging outages and broader qualification remain required.
