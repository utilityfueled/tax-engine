# Isolated hosted two-account baseline

November 5, 2026. Actual operations use the protected isolated Preview built
from `480ca19d06a68032fce8fa08255e9f9c9e2c1e88`, deployment
`dpl_65RJyinbWH7vuzvod5gdcjFPbnBz`. These results do not qualify later source
commits or the existing production application.

The user approved the isolated synthetic environment and subsequent use of its
existing access token for the two accounts' signup/session routes. One bounded
CREATE invocation makes 11 requests: two synthetic `.invalid` account/session
pairs, two distinct sandbox customers and two seven-day trial subscriptions.
The subscriptions have no payment method and are configured to cancel when
the trial ends without one. No card, real charge, external recovery email or automatic replay is used.
The source uses fixed target/account/deployment pins, exclusive phase outputs,
bounded responses and timeouts, and stops on an ambiguous outcome.

A separate BASELINE invocation makes eight requests and updates metadata only
on those two subscriptions. A subsequent approved read-only inspection checks
the restricted app role and exact database identity inside the transaction
before selecting only the two owned subscriptions and their two last-event
receipts. Both subscriptions have the expected owner, customer, Starter plan,
active mapped state, trial period and cancellation flags. Each distinct
`customer.subscription.updated` event has exactly one receipt. The transaction
commits and its client closes; all three workers exit zero.

The distinct saved review verifies the existing source, exact authorities,
identity provenance, actual receipts and root wrapper outputs. Eight negative
controls reject altered counts/events, failed execution and invented delivery
or retry claims. This review performs no fresh database query. Original helper
admission failures and their reviewed corrections remain retained.

These results establish the finite baseline records. A single receipt does not
prove duplicate handling or an actual failed delivery followed by automatic
retry. Independent provider-delivery qualification, DB/Redis/provider outages,
exact credit effects, cleanup, current-artifact recovery, final forms and human
security/tax review remain required. No filing or model promotion is enabled.

Private evidence bindings (SHA256):

| Evidence | Binding |
| --- | --- |
| Source, 33 members | `fadb678eda04e43d0b69a32bbeedc7964a0bb668cbc0cc1f3683d43faba91be4` |
| Distinct source review | `0c3d0130f05cd9e0299caaccf025d6e81054fb499db3aea7ea8b81fccfcee682` |
| Actual CREATE receipt | `a4278f6bfa104dd8f5ff9472b49bcccfc414f24a338ccaee6728580897f7a6e4` |
| Actual BASELINE receipt | `e7bf2caa9ca9b57cefb8ba43dfd49509ab5107608da55129539779ded11b65ea` |
| Distinct CREATE/BASELINE saved review | `4d4137f1287c372e368e2219287b1dfc4646e6eb869644650e44d93c65e2f25b` |
| INSPECT authority | `72cf3dafe26d4a0d8fcce1f8d0defc3407d5e103cef913126ba7437c034f4cf3` |
| Distinct INSPECT saved review | `9ae6eed408b42d73e98da87f00fa2fc4d6a9322667bf50e6457483c1e162343c` |

Evidence is under `.local/upgrade-evidence/nov05-isolated-two-account-*`.
Credentials, passwords, cookies and private URLs are excluded from public
records. The reviewers use explicit safe-file allowlists; they do not recursively
manifest the private actual-operation directories.
