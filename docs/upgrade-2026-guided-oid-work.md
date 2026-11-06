# Actual guided OID source facts

The investment interview now collects actual Form1099-OID boxes, owner, year,
revision, instrument classification, source reference and recipient reconciliation.
Unknown amounts remain unknown; explicitly entered zero is preserved. Recipient
adjustments, premium periods/history, TIPS history and separate PA issuer/premium
worksheets feed the existing Decimal calculations. Editing facts clears affected
confirmations. OID withholding is counted once in state previews and SALT inputs;
duplicate additional withholding requires reconciliation.

Sources refreshed on2026-10-25:

- [IRS Form1099-INT/OID instructions, January2024 continuous-use revision](https://www.irs.gov/instructions/i1099int).
- [Publication1212, December2025, recipient adjustments and premium/deflation rules](https://www.irs.gov/publications/p1212).
- [PA PIT Guide, interest and stripped obligations](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/interest).

The spec preceded failing source/DOM tests and implementation. Independent
synthetic arithmetic includes100.10+20.20=120.30; current market-discount/premium
elections produce110.40; municipal OID/interest less mandatory premium produces
110.10; an actual recipient/premium worksheet produces80 interest and15 separate
premium deduction. Large monetary input9007199254740993.01 remains exact.

Checks before the isolated commit verification:596 guided/DOM tests across38
files passed;25 focused source/DOM tests passed after the final lint cleanup;
root/web types and3,593 spec references passed. Scoped lint has zero errors and
zero warnings. Logs are in`.local/upgrade-evidence/guided-oid-*`.

The isolated staged code tree67b87d85149da72c3f716ff44651db9e1c620564 passed592
guided/DOM tests across37 files, root/web types and all3,593 spec references.
An independent agent reviewed the scoped helper, UI and bridge integration,
refreshed the IRS sources and ran57 source/core/DOM tests with no actionable
findings. Its log is`oid-intake-independent-review.log`. This is agent review,
not the required independent human tax qualification.

This package does not qualify forms or change filing gates. Positive TIPS
ordinary loss remains explicitly blocked pending its federal return-line
integration. A separate next package corrects selected-state versus mailing-state
routing and replaces generic PA/OH previews with their dedicated engines.
