# Exact private glibc version correction

The [first native AMD64 source run](https://github.com/utilityfueled/tax-engine/actions/runs/44037755888)
failed during the patch/version stage before package compilation. Its three-file
patch applied with zero fuzz; all 32 scoped cleanup checks passed, with no
cleanup errors or deadline overrun. The complete 51-command record is retained.

The matching official Bookworm devscripts source appends its own counter to
a new dch --local suffix: +vivalatax1 becomes +vivalatax11. The recipe expected
exact +vivalatax1. It now uses --newversion "$candidate_version" and retains
its immediate exact dpkg-parsechangelog equality guard. The generated native
changelog was not exported; the version diagnosis is supported by the matching
official source and replay, not claimed as observed changelog bytes.

Only that one executable line changes. Features, package builds, complete
suites, allocator regression, ABI and consumer checks remain unchanged. Genuine
spec-first RED is retained. Root and independent whole-source reviews, ten
focused controls, six spec references, lint and shell checks pass. A fresh
native build must still prove the repaired recipe. No risk is accepted.

Correction manifest:`e04754e9207e8a64847e4ba04dd0f4ee1a5e763e1c1378de951cbe8fa8fd4308`.
Independent review:`27eed154fa1d30aeaffe10be04deda0ce5705f7e7488cd9f1152166f7a8c5d80`.
Root focused/spec terminal:`4f2e4c/0`; independent controls:`6c9224/0`.
Official [dch version options](https://manpages.debian.org/bookworm/devscripts/dch.1.en.html).
