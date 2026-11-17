# SQLite source candidate — November 17, 2026

The standalone Bookworm source package backports the official SQLite fix for
CVE-2025-7458 to `3.40.1-2+deb12u2`. It preserves the exact runtime change and
all five upstream regression cases from official mirror commit
`b816ca9994e03a8bc829b49452b8158a731e81a9` (Fossil origin `12ad822d9b827777`).
No application image, deployment or scanner policy changes.

The source preparer verifies Debian's signed release → source index → descriptor
and tarball chain. The package recipe requires both original full suites,
positive baseline reproduction and five candidate regression passes both
normally and under ASan/UBSan. An artifact carrier records actual failure status;
successful image creation cannot substitute for those checks. The optional
owned-command callback keeps both local source verifiers within the runner's
sanitized environment, deadlines and child-custody checks.

Spec-first RED, seven focused source tests and all five spec references pass.
Root's final combined source check passed 19 tests plus scoped lint (`075e35/0`).
Independent whole-source review passed; its corrected receipt records **13**
negative chain controls, preserving the original receipt that misstated 14.
The subsequent controlled-verifier correction received its own failing test,
passing test and independent review.

Evidence:

- Original source review: `e2247d5ac49e090b28bd0ffd221cb1c181e36dde1a5e33c7a54419f3ed7459df`.
- Count correction: `944f686f1b516075b5bba943e8fd2b919d9f52efc2ad0d9b0a71b6b56152e564`.
- Final helper/runner source review: `bcec59abb9f50cb64bbdc7f94e35729024f36acb45f98cf6b3c550a9f99df934`.

The later compatibility-repaired baseline compiles, but its fulltest fails;
candidate/CVE/sanitizer, ABI/consumers and runtime qualification remain open.
[Actual full-package result](upgrade-2026-sqlite-upstream-experiment-20261117.md).
The package clears no advisory and grants no risk acceptance.

Sources: [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2025-7458),
[official SQLite fix](https://github.com/sqlite/sqlite/commit/b816ca9994e03a8bc829b49452b8158a731e81a9).
