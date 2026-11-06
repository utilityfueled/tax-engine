# OpenAI closed-day cost reconciliation — November 6, 2026

The November 6 export reports **$0.26282160** for November 5, 2026, 00:00 UTC through November 6, 00:00 UTC (exclusive). It exactly matches all **174 known successful calls**, the earlier cost export and the independently reconstructed minute activity. Both fresh-minus-known and fresh-minus-earlier cost are **zero as of this export**.

| Retained successful activity | Calls | USD |
| --- | ---: | ---: |
| Initial comparison | 107 | 0.14829345 |
| Earlier capability probe | 1 | 0.00003280 |
| Classification | 12 | 0.01618585 |
| Local accounting rehearsal | 3 | 0.00812870 |
| Four-case run | 39 | 0.06966185 |
| SSA run | 12 | 0.02051895 |
| Total | **174** | **0.26282160** |

The CSV's nonempty API-key identifier exactly matches the sole nonempty key in the retained minute activity; its organization identity matches the earlier cost export. Project selection and successful download are retained operator observations, not an independently replayed browser session. Blank raw project fields cannot establish project identity.

**$0.022384 remains held** for the failed attempt with unknown final usage. Known cost plus reserve remains **$0.28520560**. A closed calendar day and unchanged total do not establish final provider settlement or guarantee no later charge. The reviewed [Costs API schema](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs) supplies no finality flag; [spending-controller guidance](https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api) retains a reservation when final cost is unknown. No fixed waiting period is asserted.

The remaining sufficient proof is provider-confirmed final consumption/settlement or authoritative cost-status for the verified enclosing scope, reconciled to exact charges and any credits, refunds, discounts or unrelated adjustments. An applicable invoice must reconcile to exact service-period consumption; a rounded invoice or prepaid top-up alone is insufficient. A **request ID is not mandatory** for a complete, scoped aggregate proof. If finalized gross cost has zero unexplained residual, a separate financial reconciliation can support releasing the reserve without inventing zero tokens or rewriting the failed attempt. A positive residual requires attribution; a negative residual requires investigation.

This is bounded agent reconciliation of saved evidence. No reserve release, new paid call or human qualification is claimed. Provider and hosted retail-ledger qualification remain separate.

## Source fields and retained evidence

| Source field or descriptor | Observed boundary |
| --- | --- |
| `amount_value`, `amount_currency` | Exact USD cost; one 383-byte CSV row |
| `start_time` / `end_time` and ISO equivalents | The UTC interval stated above |
| `api_key_id` | Present; exact equality to prior minute activity, value withheld |
| Organization ID/name | Present; match prior export, values withheld |
| `project_id`, `project_name`, `user_id`, `user_email`, `line_item` | Present columns with blank raw values |
| Request attribution / finality | No request ID or finalized-status field |

Private source bytes and identifiers stay outside this public note. The ignored evidence packages are `nov06-openai-closed-day-cost-followup` (manifest SHA-256 `d5cbcd36e6924ed27ca573b9b87b6c300db82e3554f2b6f65851f33580ad8436`) and `nov06-openai-closed-day-cost-independent` (manifest SHA-256 `c9fd00c0896b3f21ed0fba50929fcfc7e06c6faf795ff8ce00dddd3976a17646`), both under `.local/upgrade-evidence/`. The independent reader verified the frozen files and separately reconstructed costs; it did not replay account operations. This AI accounting evidence does not change runtime or dependency qualification.
