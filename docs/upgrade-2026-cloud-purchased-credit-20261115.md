# Private purchased-credit backend rehearsal — November 15

Historical application source `8cc5b0ec0b1507e0203a8ce1bc5f3a72de1b5f09` passed a
bounded isolated Neon/Stripe sandbox rehearsal. It does not qualify the public
checkout route, signed webhook delivery, a promoted model or the whole current
application. The public purchase gate stayed closed.

The actual checkout used a Stripe test card with saved-information enrollment
explicitly disabled. A genuine sandbox completion event was checked against the
issued session and processed through the private backend entry. One purchase,
one issuance and one billing receipt remained after duplicate processing. The
1000-cent purchased budget paid for two provider attempts, each charged one
cent; both reservations settled with zero remaining held credit and 998 cents
available. One response was deliberately rejected after parsing and grounding;
its known usage was still charged. Duplicate attempt and settlement requests
left the ledger unchanged. The separate control actor remained unchanged.

Provider-reported costs were $0.0002398 and $0.0002378, summed with Decimal to
$0.0004776. Conservative cumulative exposure is $0.29471430, including the earlier
unreconciled $0.022384 reserve. This stays within the approved $140 limit. No real
Stripe charge was made, and the sandbox retains its financial history.

Actual work used 14 Stripe requests, 249 SQL queries, 191 browser requests and two
provider calls. The 1200-second controller closed normally after 77.003 seconds,
with its child reaped and process group absent, no TERM, no unknown operation and
no cleanup errors. The owned schema was removed with RESTRICT; owned price and
product were deactivated and the synthetic customer deleted. Foreign relation
name/count and inventory guards passed; this is not a historical foreign-content
integrity claim. Database pools and the seven-import scope closed normally.

The source packet has 149 pinned files, manifest
`4024a45c4ed35d513e50078747ce23c8bc58ccf7a296b537955bde7d6bed78bb`.
Root source and independent source reviews passed before execution. Root actual
review `cb0d387726b28f16317ecc62f5bd399fbf8cd3d93bfe471e45d8cfd3855b2cb3`
binds owner session 96750, terminal exit 0, runtime receipt
`6eae5ea3971d9ea869455df87651828976d4110799c5954cc98b24eaaf230a43`
and the private journal. Independent saved-artifact review
`a195888844c12d51ce9680578c915e7f707323533db192c3cc36b1822d8e5919`
passes, including independent token-cost recomputation and exact current 24-path
financial source parity. This parity does not qualify the whole current runtime.
Private credentials, checkout URLs, rows and provider identifiers remain outside
Git. Earlier failed attempts and their separate reconciliation evidence remain
unchanged.
