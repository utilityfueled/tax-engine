# Consolidated test inventory, November 15

The final AI source-admission changes on `22b8f0b8` now have refreshed test metadata.
Actual collection finds 637 browser cases: the existing 635 and two HOH source-entry
cases. The five original skips, eight runtime overrides, fourteen diagnostic targets,
two workers, zero retries and 30-second default remain unchanged. The new HOH
cases each permit zero requests to all four protected API categories.

Root comparison preserves every existing budget, policy and inventory entry, and
rehashes all 1,959 source-closure entries. The inventory adds four spec entries,
from 1,020 to 1,024; their generated partial/unsupported status remains unchanged.
Separate review independently recollects all cases, verifies all 5,959 Git entries
including six literal links and fifteen official PDF samples, and passes 83 focused
tests and the inventory check.

Frozen source manifest: `caa55ff93f963933c346c4a1e0f0aaa23bcf2a0b3c1126a6aba8a741d7abfe68`.
Independent review: `98129813dadc593e6aa3093b0d974fe344752f9b328c7bcea8fedb77a9121ff3`.
Private receipts: `.local/upgrade-evidence/nov14-final-consolidated-metadata/head-22b8f0b8/`
and `.local/upgrade-evidence/nov15-final-metadata-22b8-independent-review/`.

This package refreshes three metadata files. Collection is not executed browser
or hosted/native evidence. Full combined checks, exact-source rehearsals, human
reviews, annual form qualification and security disposition remain separate gates.
The public backup branch contains all work through `22b8f0b8`; main and production
remain unchanged while the automatic production-build decision is pending.
