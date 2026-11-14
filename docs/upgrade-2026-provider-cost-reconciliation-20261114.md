# November 14 provider cost reconciliation

The signed-in Utility Fueled LLC dashboard supplied two Cost data exports
covering November 1–14 UTC. The export dialog included all projects, API
sources, keys and models. The second export grouped costs by line item.
The original files remain private. No paid request ran during reconciliation.

| Evidence | SHA-256 |
| --- | --- |
| Daily organization cost CSV | `d8f907adf6f7cdcf79091f1bd165fdc48893336b2c3fe4d4646946e760671c65` |
| Itemized cost CSV | `0a1322f50f5af02968d5bc34e722a7142d504b2c5702a64182bbe5d445fdc7b7` |
| Independent reconciliation manifest | `b152215813466bf94eff6dc845ac8d71e02c64f63234feee49aa59ee866b609d` |

## Exact match

A separate agent reconstructed all 174 known usage results from the original
journals, including the application-rejected response that still incurred
provider cost. Five journal hash chains validate. Every quantity and charge
in the 13 exported model/token categories matches the known requests at their
pinned rates. Decimal aggregation yields exactly **$0.26282160**. There are
no negative or offsetting adjustment lines. Four controls detect added tokens,
added charges, missing positive lines and unexpected categories.

The current unexplained provider-reported cost is **$0**. OpenAI documents
month-to-date Cost data and line-item exports for financial reporting.
Requiring a final invoice or a provider guarantee against future corrections
was an additional local condition in the earlier closed-day assessment.
The current aggregate cost reconciliation passes on the directly observed
export scope. Earlier request records and assessments remain retained.
[OpenAI cost export guidance](https://help.openai.com/en/articles/20001072-exporting-monthly-usage-details-from-the-api-usage-dashboard) ·
[OpenAI usage and cost guidance](https://help.openai.com/en/articles/10478918-reviewing-api-usage-and-costs).

## Retained reservation and remaining work

The original timed-out request still lacks usage attribution. Its **$0.022384**
reservation remains held. Known cost plus held exposure is **$0.28520560**,
leaving **$139.71479440** below the user's $140 ceiling. Future authorized
requests must include this hold and all concurrent commitments in the spending
controller. The retained hold alone does not exhaust the available budget.
No zero-token result, permanent settlement, reservation release or new paid
request follows from this review.

Independent qualified-human corpus review, repeated held-out evaluation,
Google access, current provider generation/profile evidence and deployed
retail-ledger reconciliation remain open. Model promotion stays disabled.
The private package is `.local/upgrade-evidence/nov14-provider-cost-reconciliation`.

## Account-visible provider catalog

A separate read-only `GET https://api.openai.com/v1/models` at 05:04 UTC
returned 200 using the existing authorized testing key in process memory.
Its 96-model catalog includes `gpt-6-luna`, `gpt-6.1-sol`, `gpt-5-mini` and
`gpt-5-mini-2025-08-07`. There was no generation request or saved key.
The first sandbox attempt returned `URLError`; the network-enabled request
succeeded. The catalog establishes current account-visible listings.
Generation compatibility, efforts and route qualification still require
their separate evidence. The private receipt SHA-256 is `d0cc6c099b2ddeef2f5d0b333a1d447094f843e96e6acd782702c112d831e7ee`.
