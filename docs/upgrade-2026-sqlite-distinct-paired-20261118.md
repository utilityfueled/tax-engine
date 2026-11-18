# Isolate the original five upstream cases — November 18

Run `44235763098` passed both full SQLite suites but its filtered regression
failed on legacy setup before the intended distinct-10.1 through 10.5 cases.
The original complete upstream file remains unchanged. A standalone helper
requires its exact hash and derives the original tester bootstrap, five complete
SQL/oracle bodies and finish_test. Both variants and the sanitizer receive
identical derived bytes. Filters, status oracles and all full suites stay intact.
The package recipe binds the helper before context staging; GPG scope is unchanged.

Source reconstruction from held Debian files plus the committed zero-fuzz patch
matches the retained native file byte for byte. Three Python source/custody
controls pass and are now retained through a normal Vitest wrapper. Independent
review adds ten boundary controls. Root retained-builder tests, shell syntax,
lint, spec and inventory checks pass. Two initially malformed spec selectors
were corrected; the failed validation log remains retained.

A held ARM64 host binary repeats the old missing-table error before any target
case. The isolated fixture fails the unchanged 10.1 oracle and starts 10.2 before
SIGSEGV. That negative
host result does not satisfy the unchanged strict baseline reproduction oracle;
its binary source qualification is deliberately unasserted. Neither host trial
qualifies a Linux package, candidate, sanitizer, ABI or release. Fresh source-bound
native evidence remains necessary. The earlier private actual assessment's
16.x wording is corrected here: the actual filter and intended cases are 10.x.

Root source/check receipt:
`dac0c61c15573ae19a7d99a4fe6f0937e802bdedf57f0cf08f3070152e6a5500`.
Independent final review:
`55179fa56db0123666b9f8b78241fcb1237844ea5061422a8e460c5b35089883`.
