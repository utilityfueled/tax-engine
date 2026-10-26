# Charitable contribution heading browser assertion

The full production browser run on `7523384` completed with 359 passes, five
hosted skips and one failure. The itemized-deduction visibility assertion used
a text regex that matched both the intended current-contribution heading and
the new prior-year carryover summary. Playwright correctly rejected the ambiguous
locator. The full run remains failed evidence.

The assertion now requires the exact existing heading role and name. Its visibility
check, neighboring expense-field assertions, timeout and retry settings are
unchanged. No product code or calculation changes.

All eight itemized-deduction browser cases pass against the same isolated
production build with the corrected test, one worker and zero retries. A separate
agent inspected both the `h4` in `deduction-source-details.tsx` and the carryover
`summary`, and found no concern with the focused correction. The first local
server attempt used an extra command separator and exited before running tests;
its error is retained separately. The corrected command started and stopped only
its own loopback server.

Local evidence: `.local/upgrade-evidence/full-browser-7523384.log`,
`charity-heading-browser.log`, `charity-heading-browser-server.log`, and
`charity-heading-browser-server-initial-cli-error.log`. This focused pass does
not replace the required final full browser run or provide hosted staging evidence.
