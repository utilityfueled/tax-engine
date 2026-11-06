# Resolve mapped PDF fields once per form

The 2025 Form1040 and Schedules1/2 maps repeatedly traversed every field for
each write. They now queue their existing writes and resolve the current form's
fields once when applying the batch. Decimal formatting, write order, blank
values, checkbox clearing, year checks and review notices stay the same. Both
schedule header-only paths explicitly apply their batch before returning.

The batch retains no field index between calls or documents. It validates every
queued name and type before writing any field, including empty writes. Successful
application closes the batch. Existing single-field setters remain available.

## Source and independent review

Policy `spec/federal/pdf-review-policy.yaml#mapped-write-batch` was written
before the retained seven-case failing test. The final nine regression cases
exercise saved/reopened fields, Decimal half-dollar rounding, true/false
checkboxes, missing and wrong-type fields, replacement fields, separate documents,
ordered clearing, batch closure and both early-return headers.

Frozen source tree `02f793f5f30f810a3b59d9b84107cf44fe8a5127`, based on
`927399be49312738511b0fe1da3b989e8f6b5e76`, owns six files. Its manifest SHA256 is
`b3f33fbf53554c58e5f777353167379c8f8fe19dbfe7f3afe092f068547853df` and patch SHA256
`9aab07235668475878425fd0af51ef6ca40661ccad394c5e2b0a005fc304a63d`.

A separate agent reviewed the exact six blobs and all3,547 archived entries,
then passed18 cases across three files, one worker, including six additional
lifecycle, precision, header and year-gate controls. Its AST comparison found
all80 mapped writes preserved their arguments and ordering. Review report
`.local/upgrade-evidence/ai-pdf-field-batch-independent-review.json` has SHA256
`f5e13b1a3b0697ab91935b9ca30aa0ff059b0f9c6e0a49b69ddcc381a22de2bb`.
The reviewer's first attempt had one missing-widget fixture failure; it and the
corrected fixture rerun are retained. No product test expectation was weakened.

## Saved output and timing evidence

The parent produced four original fixture scenarios with the old and new maps,
saved interactive and flattened versions of all three forms, then compared24 PDF
pairs containing50 paired pages. A separate Python PDF reader found all1,855
field, text, geometry, notice and rendered-pixel assertions equal. The parent
also inspected all three contact sheets and a readable Schedule1 detail page.
Report `.local/upgrade-evidence/pdf-field-batch-output-review/checks.json` has
SHA256 `8f13c7ea58ce87f39cc829da74744d3b03d56b1ed735baad0c1683b31e2eafb2`.
These are synthetic direct-map comparisons, not a filing qualification or a
claim that direct mappers redact names and identifiers.

An isolated three-sample profile observed72 versus3 field traversals across
fill/save/reopen. Fill time ranged136–220ms before and25–57ms after; this is a
bounded observation, not an overall application benchmark. The complete output
producer took3.70s before and4.86s after under different concurrent load, so no
whole-packet latency improvement is claimed from those runs.

The unchanged12-file PDF timeout cohort passed36 tests without coverage. With
V8 instrumentation, the same files and the nine new cases passed45 tests in13
files. That partial-suite command still exited1 because it did not meet the
unchanged global coverage thresholds. It is not a full coverage pass. Separate
mapping/utility checks passed92 tests in seven files; type, spec, inventory and
scoped lint checks passed. All logs, failures and profile scripts are retained
under `.local/upgrade-evidence/pdf-field-batch-*`.

The completed remote927399be run, before this change, passed19,420 unit tests
and both484-case browser suites. Its coverage run passed19,415 tests and timed
out on five PDF cases at the existing five-second limit; no coverage artifact
was produced. This package changes neither test deadlines nor coverage settings.
Full current-head coverage and release gates remain required.

## Main integration

The same six reviewed blobs apply without an overlap on marriage-health commit
`9c077851766b1ca44ccbfafb3348b7d062ed7b29`. The combined mapping and timeout
cohort passes128 tests in19 files with one worker. Root, contract and web types,
5,874 spec references, the unchanged553-row inventory and the root build pass.
The full diff and whitespace check were reviewed before the separate performance
commit. Evidence is recorded in
`.local/upgrade-evidence/pdf-field-batch-main-checks.json`; the test log SHA256 is
`3260f1d3b3797f383a64491026855071e6ec77607480abe288aec00de35d0adb`.
