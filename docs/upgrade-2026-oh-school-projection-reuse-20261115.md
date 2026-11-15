# Ohio school projection within one calculation

The Ohio adapter previously validated and calculated the same actual school
sources twice during one synchronous call. It now keeps the first freshly
validated school projection and uses it at the existing assignment position.
All later residency and independent payment checks still run in their original
order. The complete first IT return is not reused; the final adapted IT return
is calculated independently. No caller can submit a prepared projection, and no
global, identity or cross-call cache is introduced. A missing current projection
fails closed. Tax formulas, eligibility, money rounding, source commitments,
public readiness, worker counts and deadlines remain unchanged.

Before implementation, source dependency review classifies every argument
changed between the two calls: eleven are overridden by actual source facts and
three are unused school dependency metadata. Thirteen complete predecessor
input/federal/adapted/state/payment/school hashes are captured before the patch.
The spec and regression then produce sixteen genuine failures and twenty-five
passes on unchanged source. The minimal implementation passes all forty-one.
Thirteen complete hashes and twelve exact first-error messages remain identical.
Repeated calls, edited originals and nested prior-output mutation cannot reuse a
prior projection. Standalone source entry points validate freshly.

Author and root each pass 618 tests across eleven files. Independent review
replays those 618 and adds forty-five complete-output-or-exact-error vectors.
Root rehashes all 58 frozen members and checks both predecessor source blobs and
the sole production caller. Production typing and six new spec references pass;
scoped lint retains two pre-existing adapter warnings and zero errors. Optional
test-inclusive typing retains thirteen identical unchanged-fixture diagnostics
with none in owned files. The initial private PDF runner's missing pypdf failures
and the corrected complete run remain retained. A separate replay amendment
corrects README instructions without changing the source freeze or results.

Deterministic school-source work decreases from two passes to one per adapter
call. The regression also observes the preserved separate final IT calculation.
These are finite source and work-count checks, without a timing assertion, remote
timeout attribution or current runtime qualification claim.

Freeze: `854bc1dbd3608b35def61d63155bc3eb267555c55a8d68fbac13922655586dd2`.
Independent review: `f31a4c23311deb609508204cd7ef311c19ea3e2a37dfccdc269bae3ff6513f83`.
Private packets: `nov15-oh-school-same-invocation-candidate`,
`nov15-oh-school-same-invocation-replay-amendment`,
`nov15-oh-school-invocation-amd64-peer` and
`nov15-oh-school-invocation-root-adoption`. Final integrated metadata, aggregate
checks, current distributions and required external reviews remain pending.

## Aggregate call-count assertion correction

The exact `02926be4` full unit and coverage runs each retain one failure and
28,808 passes across
2,106 files. Its original guided-render work-count assertion still expected
12 federal calculations; the reviewed school reuse correctly performs nine.
The focused unchanged test independently reproduces one failure/nine passes.
No tax-value or complete-output assertion failed in that test.

A separate pre/post trace verifies the same three adapter evaluations, with
school projections decreasing from six to three and federal calculations from
twelve to nine. The three initial/header and three residency freshness calls
remain. The spec now records this exact finite work contract. The test expects
nine federal calls and additionally requires exactly three school builds; PA
royalty remains four federal calls and zero school builds. Every original
monetary, full-output, source-edit, alias, immutability and hash-bound assertion
remains. No product code, browser policy, deadline or readiness gate changes.

All 1,000 focused render/school/spec-reference tests pass; scoped lint and all
9,354 spec references pass. Private evidence is retained in
`nov15-guided-oh-school-work-count-correction` and the independent trace packet.
The original full-run failure is retained, and fresh aggregate checks must pass
on the committed correction before final runtime qualification.

Independent exact-patch review additionally passes 51 render/school cases;
separate predecessor/current trace cohorts pass 11/52 cases. Its SHA-256 is
`e442ae680b847ebbaee71ddb161e992632e99f600e89af8cced00bb9871d689c`.
