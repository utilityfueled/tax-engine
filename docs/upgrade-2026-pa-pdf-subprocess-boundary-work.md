# PA saved-PDF inspector subprocess deadline

Four existing Python inspections in `tests/pdf/pa-ordinary-source-pdf.test.ts` now have a 4,000 ms subprocess timeout with `SIGKILL`. Every Python script, PDF input and assertion is unchanged. The existing five-second test deadline, two-worker limit and readiness gates remain unchanged.

The current c2b6dfac global run completed nine static checks and 1,932 of 1,933 unit files before its remaining PA PDF worker blocked in a synchronous inspector. ROOT closed only the recorded runner and its verified process group with normal TERM; all seven recorded processes were then absent. That run is incomplete: coverage and browser checks did not execute. The original stall's cause remains unknown.

A controlled reproduction uses the actual source call options and installed Vitest timeout implementation. The original call returned after 6,025 ms and only then failed the five-second framework deadline. The corrected call terminated its owned inspector at 4,002 ms with `ETIMEDOUT`/`SIGKILL`. A framework timer cannot interrupt JavaScript blocked in `execFileSync`; the new child deadline supplies that missing boundary. Missing inspection output still fails the test.

After adoption in the main checkout, `pnpm test tests/pdf/pa-ordinary-source-pdf.test.ts --maxWorkers=2` passed all 11 tests. Type checking, spec validation, inventory validation and scoped ESLint also passed. The private candidate run independently recorded the same 11 passing cases. A preliminary overly broad private test selection was stopped normally and retained; it is not counted as focused validation.

Evidence is retained in `.local/upgrade-evidence/nov05-pa-pdf-subprocess-hang-diagnosis` (44-member manifest `cd3b54ccaca82e669047b626cae0fba23b98322721e6ea5a2104b36439989019`) and `nov05-pa-inspector-timeout-main`. The prior global close record remains in `nov05-current-public-hosting-selfhost-global-v2/root-close-result.json`. A fresh complete current-source run remains required. This test boundary correction supplies no tax, filing, hosted or self-host release qualification.
