# November 15 public provider-source refresh

Seven unauthenticated official documentation GETs at 03:42 UTC returned 200.
All seven raw responses match the November 14 originals byte for byte, and
28 source checks pass. The pinned prices, cache/context/regional/thinking rules
and January effective-date transition remain unchanged. Published model and
lifecycle descriptions are distinct from account entitlement. A separate single
authenticated catalog GET at 03:58 UTC returns 200 and lists 96 models, including
Luna, Sol, GPT-5 Mini and its pinned snapshot. The count and selected listings
match November 14; the raw response hash differs, and the raw body was not
persisted, so no equality of the complete model set is claimed. No generation
was performed. The deprecated GPT-5 Mini and preview Google
baseline labels remain visible in candidate evaluation.

Sources: [OpenAI prices](https://developers.openai.com/api/docs/pricing),
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini),
[Google prices](https://ai.google.dev/gemini-api/docs/pricing),
[Google model descriptions](https://ai.google.dev/gemini-api/docs/models).

Private evidence: `nov15-public-provider-refresh`. Report
`01d1b10c28503a58868518c6a01c8e2cd498e33d49284d8d0eb37b3d26b0a916`;
manifest `a1c113b7e7469be4c9b9eef4236bebaf9999a4335cfaac23c10f60d6bc128d48`.
Root reverified all manifest pins and seven saved retrieval receipts. The
normalized documentation-tool extracts are retained separately from raw bodies.
The public documentation fetch used no key; the catalog GET reused the existing
reviewed memory-only loader without changing or persisting credentials. Neither
operation made a paid generation call, source configuration change or promotion.
Catalog receipt `9bd8df6d5465e36d7ab574fe1aebb893f7812cab9500cc3b6ab921d8b05efb2d`
and review `79259f7af92741c8e2ec38c39d1279957f773e1071a3d63abad5f3554a3c95bf`
are in `nov15-openai-account-catalog`; root reverified all manifest pins.
Catalog presence does not establish generation or effort qualification.
Independent human labels, held-out qualification, Google project access and the
unchanged unknown-usage reserve remain separate requirements.

Read-only access to the existing usage console also succeeded. Its available
aggregate data and absent stored response do not identify the earlier timeout,
whose original request used `store: false`. The $0.022384 reserve and
$0.29423670 accounted exposure remain unchanged; no zero-charge inference or
new authentication request is needed. Private review
`91aa8387f2a9a616662ebc6786a1625fe2ab3569f99f232abdba473194252723`.
