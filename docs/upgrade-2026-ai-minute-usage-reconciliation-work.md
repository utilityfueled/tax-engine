# OpenAI minute usage reconciliation

November 5, 2026. The owner completed sign-in to Utility Fueled LLC. The
organization usage page reports 174 requests and rounded spend of $0.26.
A successful native Chrome download supplies the scoped November 5 activity
CSV; an earlier DOM download wait failed and remains recorded. A separate
cost-export attempt stopped after the user changed Chrome. No cost CSV or
invoice was obtained, and no paid request ran during reconciliation.

The 147,099-byte activity CSV contains 1,448 grouped rows, a complete 1,440-minute
UTC grid and 28 active rows. All active and nonempty identity fields contain
one internally consistent project/key/user tuple. Exact identifiers stay private;
the journal does not independently bind a key identifier.

For GPT-5 Mini in the 05:56–06:01 UTC window, the export exactly matches the
33 successful journal attempts: 20,223 input tokens, 11,026 output tokens and
zero cached tokens. All four counters also match each of the three nonzero
minutes when correlated by observed completion time. Dispatch-time grouping
differs. This is observed correlation, not a claim about the provider's internal
accounting clock.

The old 30-second timeout began at 05:58:32.378 UTC. No additional aggregate
request or token usage appears beyond the known successful attempts in that
exported window. The CSV has no request ID, the failed attempt has no response
reference, and the ongoing day's data is not final settlement. Definitive zero
billable usage for that request remains unproven. Its **$0.022384 reserve stays
held**. Calculated known spending remains **$0.26282160**, or **$0.28520560
including reserve**, strictly below the authorized $140.

Independent saved review verifies the 217-record journal chain, 108 closed
attempts (107 successful and one failed), exact aggregate/minute correspondence
and 12 negative controls. ROOT reads the report and verifies all eight frozen
members. No original journal or evaluation result is rewritten; no model is
promoted. Representative human-reviewed evaluation, invoice and hosted retail
reconciliation remain required.

Private evidence: `nov05-openai-minute-usage-reconciliation` and
`nov05-openai-minute-usage-independent` under `.local/upgrade-evidence`.
CSV SHA256 `eb97e958a238e2a6a8bf8704b72746478f374a7b63c8440cf7cfd1b3b4e3ae8c`;
independent manifest `2b7ff8b6e909068e5d16dc6ae03f1b496c9dca3a802788db9f2ed84cf2e0f63e`;
unchanged journal `5c6d22f203775c5b9cf8a2872282eb8e0846c258701f57695ced5bda43d631fa`.
