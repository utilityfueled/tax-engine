# Child income in investment-interest sources

Official final2026 Form4952, current Pub550 and the Form6251 instructions were
refreshed2026-10-25. Form4952 includes the child ordinary investment portion
and qualified dividends on4a, the latter on4b, and actual transferred capital
distributions in the4d/4e source calculation. Alaska income is excluded. The
separate AMT worksheet includes the actual child private-activity preference.

The source partition confirms that parent amounts exclude every elected child,
binds each original child by index/year/name/birth date/SSN last4 and requires
all parent amounts, including actual zeros. The binder recomputes child amounts
and reconciles the completed combined worksheet before rounding. It does not
add the child to a combined source twice. Parent gross income, gains and losses
remain signed. A net short-term gain does not increase preferential net gain.
The distinct AMT source is required for both2025 and2026 when children are used.

The spec preceded failures: the canonical return accepted a missing partition,
and a separate regression showed it accepted missing2025 AMT sources. Both
are corrected. The IRS4000interest/2000Alaska example contributes2200investment
income; a separate actual1000PAB/200deduction source adds800only for AMT. The
canonical example deducts2200regular/3000AMT and records6251line2c=-800 and2g=800.
Other cases cover signed parent income, gains/losses, cents and multiple children.

Guided investment-interest source intake remains active implementation work.
Existing review-form qualification and filing gates remain closed. This package
does not claim independent human review, staging or final-year filing readiness.

Isolated validation used tree `40f8bebbfbd627812a94c10277cdc144ea473e58`
(base `a996dbc`): 69 tests in 10 files pass, root types pass, all 4,311 spec
references resolve, and scoped lint has zero errors/four existing federal
warnings. The earlier source snapshot `f00f571f` passed 104 tests in 13 files;
an independent agent checked that source interpretation and ran all eight new
engine cases without findings. Final test-fixture refinement removed newly
introduced non-null assertion warnings without changing calculation code.

The saved redacted four-page regular4952 reference was reopened, all printed
fields checked against independently stated amounts, and all four pages rendered
and inspected. It prints deduction2200/carry2800, leaves the identifying number
blank, omits source references and retains the review notice on every page.
Reference SHA256 `0bc3eab3ddf29301fe69efc4cf583213c746bf1e6497e04e5f219f872dd46a3f`.
Evidence is in `.local/upgrade-evidence/child-4952-{final-*,source-reference.*}`.
This is local synthetic verification and bounded agent review, not independent
human qualification or evidence that the2026 filing export is available.
