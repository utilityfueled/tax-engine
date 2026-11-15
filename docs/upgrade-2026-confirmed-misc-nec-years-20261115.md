# Confirmed MISC and NEC original years — November 15

Confirmed AI explanations now reject an explicitly mismatched calendar year on
actual 1099-MISC and 1099-NEC originals, including zero-income records that affect
withholding. The existing direct-original check previously covered W-2, INT,
DIV and retirement originals. The change extends that collection; it changes no
monetary formula, missing-year behavior or business-source eligibility rule.
Historical refund and carry years are not recursively treated as current originals.

The spec preceded six genuine failing cases. Author verification passes 89 focused
and 954 adjacent tests, types, lint and 21 spec references. Separate review passes
39 tests, including fifteen actual authenticated in-process POST requests and two
genuine predecessor failures. Wrong-year denials are private/no-store and make
zero provider or accounting calls; matching/missing years and complete historical
refund records preserve their established behavior and original input.

Main passes 35 admission and 52 adjacent explanation tests in three files, all
21 spec references, the unchanged 1,030-row inventory and scoped lint without
warnings. Browser metadata changes only this source hash and the dependent audit
binding; all 643 case identities, request bounds, skips and deadlines remain.

Frozen three-file source: `2c7e3597d47e52bf91f59e0f432a6a5b0b028621800914c2cbb50380b67c6e12`.
Separate review: `5f86567dc3bc13b6f2842640dc78042df727962787d6a47b9fc6451bf0eda205`.
Root review: `40bd56dd7f5db480232fd1f036f3c314ff5cc4fddb321dce9998518453d01880`.
Retained evidence: ignored `.local/upgrade-evidence/nov15-confirmed-misc-nec-year-root-review/`.
This is software source admission, not verification of real-world documents or
qualified human tax review. Complete current checks/runtime qualification and
broader direct-original audit remain active; final 2026, filing and model promotion
remain closed.
