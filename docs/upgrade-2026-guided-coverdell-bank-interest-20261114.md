# Guided Coverdell bank-interest originals — November 14, 2026

This package adds guided intake for the already implemented, narrow post-disqualification Coverdell method: an actual January 1 custodial conversion to an ordinary domestic bank cash account owned by the primary beneficiary, with a complete cash ledger and a matching original 1099-INT. It adds no tax formula or income a second time. All other post-disqualification investments, retained trusts, foreign accounts, unproved ownership and unknown activity remain outside this method.

The controlling calculation remains the existing `coverdell-post-disqualification-interest` / Form 1099-Q source contract and its official authority. The new contract is `spec/federal/guided-coverdell-bank-interest.yaml`. Its source packet requires actual conversion records, positive original bank interest, explicit zero other income/gains/losses/flows, complete identity and year, and Decimal cash conservation. Guided review stores a snapshot of the actual original and related facts. Editing the original, owner, year, cash ledger or source records invalidates review; confirmation cannot substitute for an absent original. The original interest is reported through the existing Schedule B route once.

The collector uses the raw saved INT collection, not a displayed placeholder row. An optional original PA direct-obligation allocation now survives original conversion and has a visible field; this method requires an actual amount, including an established zero, without deriving or defaulting it. Ordinary original INT behavior retains `undefined` when this field is unknown. Original context is also forwarded through the existing composed student-loan replay. The two engine files changed only their consumed taxpayer type projections; emitted JavaScript was checked identical to the committed predecessor.

## Verification and custody

The isolated production-build source was Git `6bacf7629bfc0e09680a8ef9d8ae5ec1b5daed12` plus eighteen pinned package files. It includes committed PTC work and excludes unrelated pending source. The new spec's four references, root and web TypeScript checks and eight focused test files passed (51 tests). Lint found no errors and five pre-existing warnings. Independent implementation review also exercised partially entered original render cases and the actual hosted/provider privacy boundary; this is engineering review, not a qualified human tax interpretation.

The actual desktop (1280 px) and mobile (390 px) journeys both passed against the isolated production build, using visible controls for all new conversion facts and the original PA allocation. They demonstrated blank denial, original selection and confirmation, canonical calculation, reload, source-edit invalidation, and reconfirmation. Both saved browser states were separately replayed through the real guided bridge, parser and federal engine: one original INT, interest 100, AGI 400, total tax and amount owed 30, payments zero and refund zero for the explicit fictional fixture. The visible hero was required to reach exactly `$30` after confirmation, reload and reconfirmation; screenshots were taken after that final assertion. The two screenshots have their respective actual viewport widths and no horizontal overflow. No filled-return, provider, business-expense or self-employment analysis requests occurred; raw and decoded synthetic private markers were absent from observed URLs and request bodies, with no downloads or page errors. These are bounded synthetic observations, not a general encoded or binary PII proof.

The guarded run collected two cases, with no skips, retries or timeout changes (30 seconds per case; two configured workers, one actual worker). The owned local server closed normally. It did not deploy, send email, call a paid provider or qualify a hosted image.

| Evidence | SHA-256 |
| --- | --- |
| Final eighteen-file source freeze | `3a6fced1b4d737b44851d36931466781183dd2875c13f4759cca39824da6f844` |
| Isolated stage source manifest | `2b5004992e9dc451b858e3831540d27fefa7399aac1f6bf71ae8dc7a1114aa0b` |
| Reviewed isolated browser action audit | `b42b5a648265dd29865640cf760fbd20021ca7984e946c5da929ac5e6254f372` |
| Actual artifact, source, state replay and cleanup audit | `0ad5f9be62241e7d0b0b52ba54c6982dc7d69199beaf59abfc62b80192007bad` |
| Independent corrected implementation review | `be4204a7872c4406a8844e9c004d88ce5b2df14e7667baebcc70323d87460e4c` |

Private evidence is under `.local/upgrade-evidence/nov14-guided-coverdell-bank-interest/`; its successful actual window is `rate-window-1794694555237-38135`. The artifact audit verifies all eighteen overlays, 5,090 source inputs and 315 immutable production-build files, including screenshot, actual saved-state, report and cleanup hashes.

## Preserved failures and remaining gates

Spec-first failures showed lost explicit original PA allocation and rejection by the prior no-later-activity collector. Subsequent genuine controls caught documentary confirmation invalidating an unrelated student-loan review, canonical parsing during render of a partially entered original, and an unknown runtime filing-status value. Those were corrected without fabricating missing source facts or widening the canonical method. A pre-build staging check rejected a tracked environment example; the correction individually verified the two exact Git-tracked examples while preserving the ban on implicit environment files.

The first actual browser attempt failed both cases because its exact textbox selector omitted the field's existing accessible hint. Both blank fields were present. Its failure report and normal cleanup are retained. The selector-only successor passed both cases with correct canonical saved results and normal cleanup. Its screenshots nevertheless preceded the ticker animation settling; that genuine pass, source and artifacts are preserved. A further browser-only successor retained every assertion and added exact independently derived `$30` display waits plus explicit owed/payment/refund assertions. It passed both cases before the final screenshots. Original facts, privacy controls, request bounds, retries and deadlines stayed intact. A separate read-only state auditor initially attempted to traverse a generated JSON file as a directory; its directory filter was corrected before successful replay, without changing application or browser results.

This package does not supply qualified human tax approval, final 2026 annual forms, current-source AMD64 runtime qualification or image advisory disposition. Full 2026 annual output gates remain closed. It does not lift the hold on pushing `main` while automatic production deployment is unresolved. The next combined source freeze must include this package before claiming full-suite or runtime qualification for the resulting current source.

Root independently rehashed all eighteen final source pins, both original PNGs
and saved states, and five actual browser/build/cleanup artifacts; both actual
results are passing with zero retries and 30-second timeouts. Both full original
screenshots were visually reviewed with settled $30 balance. Root actual review
SHA256: `23dfe5cf8565b16027ad97c3937b70a87f7c6fab265255761d2ca55ffaf80fe9`.
