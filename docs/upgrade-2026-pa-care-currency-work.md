# Preserve actual care amount sources

Both native care amount fields now validate currency syntax before removing
display decoration and emit a parent update only when the resulting exact
string changes. Unchanged blur preserves confirmation. Malformed grouping, bare
dollar symbols and nonnumeric text remain invalid and visible; blank and zero
stay distinct. Real amount, lexical and provenance edits still revoke review.
Decorated negative values may lose decoration on shared blur but stay invalid
and unconfirmed. No shared parser, tax formula or monetary rounding changed.

The currency and married-entry specs preceded their combined genuine RED:
13 failures and two passes. Their final adjacent run passes 178 tests in ten
files, including 18 new cases. Web product types, scoped lint, ten spec references
and diff checks pass. Imported fixture typing retains the same 12 baseline
diagnostics, with no new owned diagnostic. Distinct engineering review passes
11 additional real DOM/source controls across both packages. Full integrated
checks remain pending; no browser, filing or release qualification is claimed.

Private evidence: `nov05-pa-married-dependent-care-native`, manifest
e7650bae493dc06e340d7e03b9299b49f20c00125a125377bd3ab5f5c39c94bf;
distinct review `nov05-pa-married-dependent-care-native-independent`, manifest
a31bd1ee76683ae232b69e466d645eb42e13626578d0c5b9bf34911e98e8ed43.
