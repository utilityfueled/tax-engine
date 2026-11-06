# Actual deceased-claimant EIC periods

The current Form8862 numeric claimant method previously required a full calendar
year and rejected a deceased filer. This package derives each person's actual
calendar-year period from January1 through death or December31. A joint return
keeps separate deceased and survivor periods, including when both die in the year.
The actual home-day total must exceed half that person's period. It prints those
days and actual period-end age, retaining the applicable dates and denominator in
the review appendix. It does not annualize income or prorate the EIC table.

The original death dates, individual periods, complete distinct-day records,
no-accounting-period-change answer and applicable joint no-remarriage source
record are required. A replacement household cannot inherit the original joint
record. Missing facts, false answers and explicit zeros stay distinct, and source
edits require confirmation again. The income-only Form8862 shortcut is retained.
Fiscal/accounting-change methods and legal authority to file are separate. No
filing, final2026 or independent human qualification gate is changed.

Official sources refreshed October26,2026:

- [IRC32](https://uscode.house.gov/us/usc/119-118/t26/s32/) c(1)(A)(ii)(I) tests residence against the individual's taxable year; subsection(e) permits a year closed by death.
- [IRC443](https://uscode.house.gov/us/usc/119-118/t26/s443/) a(2) and [Reg1.443-1](https://www.ecfr.gov/current/title-26/section-1.443-1) a(2) establish the actual death-shortened period. The accounting-change annualization rule is distinct.
- [IRC6013](https://uscode.house.gov/us/usc/119-118/t26/s6013/) a(2) and [Reg1.6013-1](https://www.ecfr.gov/current/title-26/section-1.6013-1) d(1)/(2) preserve each spouse's period and the survivor-remarriage/accounting-change boundary. The published1956 example has one Jan1–Aug1 period and one Jan1–Dec31 period.
- [Publication559](https://www.irs.gov/publications/p559) describes the final period and availability of EIC on an otherwise eligible short final return.
- [Form8862 instructions](https://www.irs.gov/instructions/i8862), lines9/10, require actual claimant days and provide the deceased-spouse age examples. Child line7's printed365/366 convention is separate.

The91/181,90/180,183/365 and137/273 controls are independently derived examples,
not published IRS numerical oracles. The age examples use the published67/64
spouse facts and the exact February14,2000 birth with February13/12,2025 death
boundary. The unchanged published EIC table gives649 on actual10000 income.

## Verification

- Spec-first core red: four failures and one unchanged shortcut control passed.
- Core corrected:25 tests across four files passed.
- Follow-through red: two source/PDF tests failed on missing joint controls and applicable-period explanation. Separate household-copy red reproduced retained marriage facts after a spouse replacement.
- Corrected source/DOM/PDF plus adjacent cohort:13 tests across five files passed; root types passed.
- Immutable source tree `93828a6a1c948e2cd34c497728c6a851408fa20e`: 1,581 tests across 154 files passed, including the full guided-interview source suite and adjacent EIC/Form8862/workspace/PDF consumers. Root, contract and web types, all 5,464 spec references, scoped lint (zero errors or warnings), and root/web production builds passed. All twelve owned hashes remained unchanged.
- Production desktop/mobile source, save/reload, privacy and download cases passed 2/2 with zero retries. Both independent saved-PDF readers found the actual 91/183 days and 40/37 ages, separate 181/365-day periods, redacted source identifiers and one review notice on every page. Unknown/remarriage and edited day sources blocked calculation until actual reconfirmation; the qualifying control retained the unprorated 649 credit.
- Both saved sixteen-page packets were reopened and all 32 pages rendered. Complete contact sheets, both numeric claimant pages and source-period appendices, and desktop/mobile source and review screens were visually inspected. No clipping or misplaced values were found; the review-only notice remains visible. Artifact hashes and paths are retained in `eic-deceased-artifacts.json`.
- Parent independent review passed twelve tests across four files, including four private controls: a spouse's actual August 1 death period (107/213 days versus 106), the survivor's separate 365-day period, medical absence yielding 30/59 versus 29 days and an excess total of 60, the 65th-birthday boundary, and stale joint/no-confirmation sources. This is bounded software/source review, not human tax qualification. Final integration and version/inventory updates remain separate.
- Parent separately rehashed and reopened both saved PDFs (32 pages, eight literal claimant fields), inspected both contact sheets and every review footer, and reviewed the readable claimant/period pages and desktop/mobile screens. No issue was found. Evidence: `.local/upgrade-evidence/parent-death-period-review.json`; its independent test log SHA256 is `abfa81b1ef4909bce3bc21d5e55c785abdbd0ea79b3cc665ff74f3dbd812cd24`.

The first browser server launch was denied permission to bind task-owned localhost
port 3347 by the execution sandbox. Its log is retained separately. The same
synthetic local runner then used the approved local-port execution permission;
it inherited no provider or production database settings and closed its own
server after the two tests. No assertion, deadline, retry or source behavior was
changed.

Retained exact logs (private evidence directory `/private/tmp/tax-ee0132c-verification-8utd72md`):
- `eic-deceased-period-red.log` SHA256 `adb49b557d85775a29aba26b9815f82f4e6d8acea45678d582bf027990d4f865`.
- `eic-deceased-period-core-green.log` SHA256 `7b105340b4377a73275609bba49cb7c5409889e33a475768f15aeb9ae986a4a2`.
- `eic-deceased-followthrough-red.log` SHA256 `821568b5e6aa25a1b8a4dc0efa94f5e3c7608725fd7ff2dc0516209caa72df18`.
- `eic-deceased-household-copy-red.log` SHA256 `4fb7aac2fcd0b03f4cb492083bb93c73a8988098de3dcd0c2e4fec4cc3803280`.
- `eic-deceased-followthrough-green.log` SHA256 `852e202aabc0bb181bed8e11e7ff106af40343ab5e9d4cdc82474aff2336b9c0`.
- `eic-deceased-types.log` SHA256 `8813a1315617b84ae9d8484794641c4abfb4838e48906ce0a77c34a236b8fd8c`.
- `eic-deceased-exact-tests.log` SHA256 `eecc85c1f156d88f65959cee7c92ede94b34a23941fde64b4243d6f7460c4707`.
- `eic-deceased-browser.log` SHA256 `90bd8b8c81de73e44efd1462877998f66a3a95b7a689c5d92095de9ed9130d6d`.
- Desktop saved PDF SHA256 `e95304d9965f7c5e8228c9732709a804f661d00f213c552bd20ad42a29be22d7`; mobile saved PDF SHA256 `b25c3d3669879af857773dc4a7812c6d8091ac65e7639a5d9451ac5f5b4135ad`.

## Final integration

The final private candidate on `c078ce047295f712621e8422dfe0cae6946e7dab`
retains all eleven reviewed code, spec and test blobs unchanged. It advances
only the applicable rule versions to 2025.143/2026.140, updates the source
provenance without changing qualification flags, and regenerates the 515-entry
inventory. Tree `d341e41dce4dbd22d992ce736528e4e1a2a8ecef` passed 569 tests
across 14 files, root/contract/web types, all 5,467 strict spec references, inventory
verification, scoped lint with zero warnings/errors, and both production builds.
Its desktop/mobile production rerun passed 2/2 with zero retries, using the same
actual source, monetary, privacy and saved-PDF assertions. All fourteen candidate
hashes remained unchanged through those checks. The only subsequent change is
this evidence paragraph; the final commit/tree is recorded in the untracked
delivery receipt.

Final integration test log SHA256:
`df93a35ef447ea53d7b4fb121d6ab87b10a32f6790b2944ab16c9b7486fa6318`.
Final production browser log SHA256:
`87c047de8cad3cd29e50ef07b7c06cec3b37e0a7b36016cdf070ead29a568dd5`.
