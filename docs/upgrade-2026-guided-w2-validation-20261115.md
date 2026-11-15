# Avoid a discarded guided W-2 audit digest

Guided canonical validation now uses the existing W-2 source assertion helper
instead of calculating an audit result it immediately discarded. Both wrappers
execute the same source preparation and completion checks. Actual result-producing
engine calls still calculate and retain the source commitment. No tax amounts,
original-source conditions, confirmation rules or browser deadlines change.

The retained failed AMD64 diagnostic contains byte-identical public chunk
locations mapping to SHA256 work under guided progress rendering. Read-only
mapping review: `ccbdbc62c5c75c4350c0b2cf77e9aa0cf226c42342a65e0aa43a20533180130c`.
That identifies avoidable work; it does not establish CPU utilization, a measured
speedup or the cause of all eleven prior browser failures.

The spec preceded an actual unnecessary-hash regression failure. Main adoption
passes 949 tests in four suites, web types, all 9,248 spec references and scoped
lint. Tests verify literal withholding totals, unchanged canonical output,
continued engine digest generation, preserved input originals and matching
rejections for bad owners, years, rows, amounts, confirmation and stale sources.
The historical packet-free path remains unchanged.

Three-file freeze: `e0de517bfbda48189e743bc3224891b777a4d2f4273d188296b23dcddd35f4fd`.
Separate review passes five tests, including six additional rejection-parity
controls. Review receipt: `062535d3597282e0efefeb0f34e02b93337da5202dbb875a2e403ff152bf316e`.
Root adoption: `0a74fa22ad60fbd369b91f67597d55878b80da0febdd85e6e54b643f9fe498c0`. Final combined/runtime evidence follows. The earlier failed AMD64 run remains failed; no retry, timeout,
coverage, source-accuracy or qualification gate is relaxed.
