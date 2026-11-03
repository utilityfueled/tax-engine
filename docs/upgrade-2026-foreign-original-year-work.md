# Actual original year in the foreign-credit fixture

The synthetic foreign ordinary-credit source now explicitly supplies its actual2025 interest statement year. Its existing payer/account, income20000, foreign income10000 and foreign tax900 are unchanged. This is a fixture correction; no application default, tax calculation, readiness gate or annual election inference changed. Omitted original year remains unknown and rejected even with a dated annual election.

Spec first and two new controls precede the fixture edit. Fresh existing three tests plus two new tests reproduce two genuine failures/three passes (log6ca1a4b34bc111ee850064525b3fc04f9ecc9b782042baccb5870163b8c0f55c), then allfive pass unchanged. Three types,7232 spec references, inventory719+check, strict two-path lint0 and diff check pass: nine commands. Original three-test source bytes remain exact. Product-identical172fc engine/web builds are retained without a redundant test-only rebuild.

Root review and command evidence: `.local/upgrade-evidence/nov03-foreign-original-year/review-result.json`, SHAf81e8f61ed3bd43cf3ac1406293a46bc638ebdcbcbe5ecf2c51c62ce0f7c81d7. No new PDF, real taxpayer data or qualification evidence.

The fresh entire unit run at172fc before this fix records21961 total,21918passed,10failed and33pending. This scoped result resolves its foreign-fixture failure; it does not claim a subsequently green full suite or measured85% coverage. Pending33 PostgreSQL integration cases require their isolated database runner.
