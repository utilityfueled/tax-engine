# November 13 Debian advisory refresh

The Debian Security Tracker JSON was retrieved November 13 at 12:26:27 UTC.
Its decoded SHA-256 is `40560246edf2cb9374bc1989c92330c7fa17eb9b8137a8e7d99b9e7b279fb360`.
The comparison matches all 81 literal trixie source-package rows from the
[November 6 historical AMD64 register](upgrade-2026-image-advisories-20261106.json),
bound to source `3a44570ef5176367eceb2d639e5c415901c783d3`. The primary-source
comparison report hash is `e38f570c63b2ec0e9bbd734bcc82e3f832f0706b55bb38df95575cb573abc636`.
[Debian Security Tracker](https://security-tracker.debian.org/tracker/data/json).

Debian now records three fixed trixie zlib advisories. The historical image
contained `1:1.3.dfsg+really1.3.1-1+b1` and its 182-match scan stays attributed
to that image. The new fixed version, `1:1.3.dfsg+really1.3.1-1+deb13u1`, is
already pinned by hash in both Docker stages. The current platform images
still need native package inventory and scan evidence.
[DSA-6613-1](https://security-tracker.debian.org/tracker/DSA-6613-1) ·
[Pinned package evidence](upgrade-2026-debian-zlib-security-work.md).

The other 78 historical rows are open and unchanged. The subsequent native
ARM64 image at `2e258445` has the fixed zlib package and the three zlib
advisories no longer appear in its scan. That image has 197 Debian matches
across 86 IDs. All 86 have open trixie rows in the same primary response.
The eight newly matched IDs cover glibc, OpenSSL and GCC. The overdue
security/platform disposition remains open for all 86.
[ARM64 image and per-advisory register](upgrade-2026-image-advisories-20261113-arm64.json).
