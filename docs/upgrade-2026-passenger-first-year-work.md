# Original-bound first-year passenger worksheet

The standalone 2026 Form 4562 worksheet now reconciles actual passenger-car
originals, allowed section 179, documented bonus treatment and regular
depreciation under the combined business-use ceiling. Listed amounts reach
Part V and the total once. That standalone revision rejected canonical returns and Schedule C/E. The later
[finite original-bound parent bridge](upgrade-2026-passenger-parent-work.md)
adds a separately reviewed single-business method; broader cohorts remain denied.

The finite cohort requires one new domestic 2026-model car, January–September
placement, ordinary owned active sole-proprietor business, actual expenses,
5-year 200DB half-year treatment and qualified business use above 50%. Complete
mileage, acquisition, election, Part I and original form/asset facts are required.
Only actual election-out or independently documented positive 100% bonus is
admitted. Missing facts, carryovers, mixed assets, other activities, history,
credits and unsupported elections remain denied. No future basis is inferred.

Authority: [Publication 946](https://www.irs.gov/publications/p946), passenger
worksheet and recordkeeping; [Form 4562 instructions](https://www.irs.gov/instructions/i4562),
Parts I/II/V; [the printed form](https://www.irs.gov/pub/irs-pdf/f4562.pdf); and
[26 USC 280F](https://uscode.house.gov/us/usc/119-121/t26/s280F/).
Source retrievals and literal independent Decimal oracles are retained locally.
Spec and failing tests precede implementation.

Distinct V1 review found four real defects: contradictory long mileage could
reconcile at global precision; rounded original basis could change a deduction;
reported Part I income retained cents; and undocumented prior section 179
carryover bypassed the guard. V2 uses a fresh local Decimal precision of 256,
preserves exact documentary inputs, rounds only reported lines/deductions and
closes the carryover bypass. Caller precision is unchanged. The original failed
receipts remain failed. An old mixed-asset test retains its input exactly and
now verifies explicit source rejection and input immutability.

Actual checkout verification on baseline `96e3fbea`: initial 12 genuine failures,
then 17 genuine failures against the final spec, followed by 399 passing tests
across 16 files. Eight package checks pass: all three type checks, spec/inventory,
both builds and repository lint, with no tracked source drift during each check.
Distinct V2 engineering review adds 19 controls to the author's 310 passing
controls. These are finite package checks, not full-suite or human tax approval.

A byte-identical spec rename and three path-comment changes make the new
worksheet discoverable without changing validator/generator code. Independent
827 spec/inventory controls pass. All 875 prior inventory entries remain exactly
unchanged; one partial entry yields 876 total and the supported count stays 68.
Final spec and inventory commands also pass after that metadata-only rename.

Evidence directories under `.local/upgrade-evidence/`:

| Package | Frozen manifest SHA256 |
| --- | --- |
| `nov05-passenger-first-year-combined-private-v2` | `efee279fafd6865947d79d767796b0a6c6287da0d95b07addb2fa5b464324d67` |
| `nov05-passenger-first-year-combined-independent-v2` | `e22013ff8c4f3510d9dca6293762f81e3b05f7ba97eec48f7fe9d30445fbc398` |
| `nov05-passenger-traceability-rename-independent` | `7d3c77e990c80e02e431cf8bc4290ffa98b1e9f7261cf7c823c896edd580b88f` |

Actual checkout receipts are in `nov05-passenger-first-year-combined-main`.
Full current-source unit/coverage/browser checks, broader canonical owner linkage,
physical final 2026 forms, native collection, qualified human review and
hosted/self-hosted release qualification remain open. Filing and model promotion
remain disabled.
