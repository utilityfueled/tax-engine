# Consistent mobile layout measurements

The self-host browser job for `456bd432` reported 463 passed cases, one flaky
case and five hosted-only skips. The flaky mobile layout assertion compared
the first two progress steps with a measured vertical difference of 1,431px;
it passed on retry. That job is not zero-retry qualification.

The test previously awaited four separate browser calls to obtain the heading,
ticker and first two step rectangles. Scrolling or reflow between these calls
can mix viewport positions from different moments. The test now obtains all
four rectangles in one synchronous browser evaluation. Both visibility checks,
all four null checks, section-before-ticker ordering and the strict 12px row
alignment assertion remain. Product code, deadlines and retry settings do not
change. No sleep, polling tolerance or automatic retry was added.

The production build and web types pass on private `c9db24a2` source. Both
existing mobile cases pass three runs each with one worker, zero retries and a
30-second test deadline. A separate private browser control demonstrates a
700px false difference from sequential reads separated by scrolling; the
simultaneous measurement still detects an actual 30px row offset. That control
establishes the failure mechanism, not the cause of the exact remote event.
An independent agent source review confirms the assertions are preserved.
An additional browser probe confirms that visible, visibility-hidden and
display-none elements retain the old rectangle/null behavior. Focused lint
passes with zero errors and the same 16 non-null assertion warnings. The
private browser server is stopped.

Evidence and hashes are in `mobile-position-verification.json` under local
upgrade evidence. The initial browser command omitted the required pinned
Python environment and was rejected before tests; that prerequisite failure
is retained separately from the successful run. The later operating-K1 package
does not change this test's base blob. Final integrated and remote browser
verification remains required; these checks do not establish hosted readiness.
