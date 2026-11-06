# Donation qualification interaction regression

The full coverage run on committed51b7182 with regenerated419-entry inventory
completed17,895 passing cases and one failure across964files in581.83seconds.
It did not produce a passing coverage result: an older interaction still queried
the retired section170(b)(1)(A) label. The failure reproduces independently.
The actual collector asks whether the recipient qualifies for a charitable
contribution deduction and separately records private-foundation classification.

The repaired interaction selects the existing general qualification field and
asserts both actual qualifiedOrganization=true and isPrivateFoundation=true for
its private-foundation fixture. The public-cash browser helper uses the same
current label with its separate public classification. No product behavior,
assertion, readiness gate, test deadline or coverage threshold changes.

Independent agent review found the second browser-helper occurrence. The corrected
unit file passes8cases; independent review passes33cases/4files. All4 affected
production Chromium flows pass with0retries on the isolated2d1b9bb snapshot,
including amount comparison, no unsupported saving claim, aggregation and
persistence. This is local synthetic evidence, not hosted qualification. The
full integrated suite/coverage will be repeated after package integration.

Evidence under `.local/upgrade-evidence/` (SHA256):

- `full-coverage-51b7182.log`: `257fec09a19dc8bef8e42bc6a3f0b352a00ce53f4e04a020c10d861c2b557c3a`
- `full-51b-required-facts-reproduce.log`: `6a1e6ef67dd4a4cfdc7b49fbc09608fa3415b73066d120c6ceb4602737ba75ca`
- `required-fact-label-tests.log`: `9b3689a72881a132c292bb8195b2481932a990c042d247a7db6b1f430c2e023a`
- `ai-required-facts-label-review.log`: `b95caa40fd39dfce24cef2de9c4c09ffe260374be6990d06e7dd9426fb3176f0`
- `required-fact-label-browser.log`: `121bfb0963e166e0f96529daf92f940c24bd04cd447009674c244803939fdce0`
