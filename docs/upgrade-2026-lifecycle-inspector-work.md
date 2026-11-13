# Local lifecycle PDF inspection

The desktop and mobile lifecycle tests inspect the initial, reopened and restored review downloads. The inspector contract requires one text extraction per output page. It locates the first page whose extracted text contains both `1040` and `Filing Status`, and checks the two primary and ten immediately following cell values at the official 2025 Form 1040 widget coordinates. Each cell must contain exactly its expected value after trimming, at an origin less than 0.02 PDF points away on each axis. Cover pages, partial headings, later Form 1040 headings and trailing pages cannot substitute for that pair.

Both readers remain strict. Every output page must contain the review notice. The output must contain no AcroForm fields, widget or unresolved annotations, or formatted or compact synthetic SSN in extracted text. A missing Form 1040 page, missing companion page or missing official blank coordinate rejects the packet. The existing seven-field inspection receipt, official blank, browser journeys, and browser and subprocess deadlines remain as recorded in the lifecycle test.

The focused regression executes the Python source from the actual browser spec with controlled page visits. It checks page extraction counts, layout selection, cell rejection and privacy failures. The saved browser downloads provide a separate replay through the pinned PDF reader.

## November 12 verification

The test contract and regression were written before the browser spec changed. Against `c1766777a025e36a603fe0c9f2f8cc6407a58ec3`, all three layout cases reproduced duplicate extraction of the selected pages, and the existing denial controls passed. The final regression passes four tests with 26 denial cases, including one omitted-value control for each printed cell. Targeted TypeScript, strict ESLint and diff checks pass. The TypeScript source surrounding the inline Python compares byte for byte with the baseline.

The pinned reader replayed the six prior desktop and mobile initial, reopened and restored downloads twice per implementation. All 24 invocations returned exactly their saved inspection receipts with empty stderr. Local median inspector time was 382 ms for the baseline and 325 ms for the final source, a 14.9% decrease. These are inspection-only timings from saved artifacts. Fresh browser execution and the Linux container gate are pending.
