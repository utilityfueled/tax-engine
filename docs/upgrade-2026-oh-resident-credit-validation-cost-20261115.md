# Preserve resident-credit validation without temporary hashes

A current resident-credit projection read now compares the same normalized,
JSON-serialized UTF-8 bytes directly instead of creating two temporary hashes for
each of 22 expected fields. A complete read retains its one stored-facts hash,
compared with 45 SHA calls before this change. Durable facts/source/payment
commitments, the opaque context map, validation order and public output stay
unchanged. No cache, tax formula, browser policy or readiness gate changes.

The software spec and actual failing test precede implementation: the unchanged
reader makes 45 SHA calls where one is required. All four new tests then pass,
and all seven affected behavior files pass 275 tests. Types, scoped lint and
four spec references pass. Root passes 950 tests across the new candidate and
existing strict global reference checks. The earlier global reference failure
identified the separate W-2 quote-format issue, now fixed without parser changes.

The independent reviewer passes the same 275 tests plus three separate controls,
including 484 comparisons against exact predecessor source. These cover each of
22 fields with 22 value variants, Decimal/string normalization, object order,
undefined/null, arrays and Unicode; same-object stale edits, forged contexts,
first errors and defensive returned-row copies retain their behavior. Three full
predecessor federal/adapted/Ohio/payment output fingerprints remain identical.
These are software-preservation snapshots, not independent tax interpretations.
A private reviewer import-setup failure is retained with the corrected execution.

| Evidence | SHA-256 |
| --- | --- |
| Three-file source freeze | `79ed294624c10865c7e60e43fc007d2c510b06eefb449a07a253179ab6ea3fc7` |
| Author receipt | `fb7512435a4ea02087b3a38b1ffbc3c001819d0cadf927e260f3c461a64ade7f` |
| Independent review | `38adfcef6cd02e7d1b7d0ad79b6ff58398a6f4e8d00dc5898cba8b5aecd96120` |

Private packets are `nov15-oh-resident-credit-validation-cost`,
`nov15-oh-resident-credit-validation-amd64-peer` and
`nov15-oh-resident-credit-validation-root-review`. The earlier sampled hashing
path supports investigating this candidate; no measured CPU saving or browser
timeout cause is claimed. Exact-source metadata, combined and runtime checks
follow this implementation commit.
