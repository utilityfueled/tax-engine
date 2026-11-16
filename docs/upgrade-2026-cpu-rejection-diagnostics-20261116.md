# Fixed rejection reasons for optional CPU evidence

The optional CPU-profile collector now records a fixed reason when a profile
fails validation. This distinguishes malformed sample intervals, node identities,
tree structure and other checks without retaining profile fragments, function
names, URLs, exception text or taxpayer data. Upload validation reconstructs the
exact permitted record and rejects unknown reasons and extra fields. Historical
reason-free records remain readable.

The spec and two genuinely failing tests precede implementation. All 26 focused
tests then pass, as do scoped lint, typecheck, all 9,398 spec references and the
inventory check. A separate 816-case comparison against the committed collector
retains identical acceptance decisions and identical accepted output: 96
available profiles and 720 unavailable profiles. Current and historical records
pass the strict upload reconstruction. Every existing limit remains identical.

This changes diagnostic reporting only. It does not change the application,
browser actions, assertions, deadlines, retries, coverage or readiness gates.
The earlier eleven rejected profiles did not retain their rejection details;
these new categories do not retrospectively explain them. No replacement remote
run or runtime qualification is claimed.

Root verification receipt:
`c1c4241e9b223d3529d6c0051d344c9003ad020387348b94eaa318db51cb98ee`.
Independent source and adversarial review passes:
`af55b567d784cfc9bbaff14381692e9a84fe1d29cf70dadedc0cca86974fb45d`.
Its separate 960-case comparison preserves acceptance and accepted output,
including 1,772 current/historical upload roundtrips and 84 private-addition
rejections. Its own 26 focused tests pass. The broader runtime failures remain
open.
