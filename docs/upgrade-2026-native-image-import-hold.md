# Native image built and imported; rehearsal still blocked

The bounded ARM64 rehearsal built image
`c9e943c112fa9c1d2953ab2fda48cc96d2b5bd07428933a626d27538202ca9f5`
from public commit `480ca19d06a68032fce8fa08255e9f9c9e2c1e88` in the isolated
VM with no host shares. The first attempt stopped when the strict Docker archive
checker rejected nine extra legacy compatibility symlinks. Its HOLD remains.

A separately reviewed host-only conversion drops only complete, unique,
unreferenced one-hop compatibility links to regular manifest layers. It extracts
no files. The raw export remains unchanged. The original strict image checker
then passes the exact ConfigID, all nine uncompressed layer hashes, platform,
source label, runtime user and health check on the converted archive. Thirty-three
independent offline controls cover payload preservation and malformed inputs.
An initial review incorrectly equated legacy alias directory IDs with DiffIDs;
that interpretation is withdrawn, with its failed controls preserved.

A separately reviewed continuation reused the stopped owned VM, original
baseline, original deadline and remaining one start/stop. After a changed boot,
the retained build image matched and independent import into the originally
planned separate store passed. Source census verified 5,056 regular files and
six literal links. Author 29 and distinct 13 offline orchestration controls had
passed before that execution.

The continuation then stopped during dependency installation, before smoke,
browser, recovery or image scan. Seven worker records describe addon attempts
that the observer blocked before calling the native loader. Its reader rejects
these fault records. This is a real failed rehearsal, not a smoke result. A
source-only successor is being prepared to distinguish sealed blocked attempts
from observer failures while continuing to prohibit addon loading; it has no
runtime qualification yet.

Both attempts finished with positive final safety: owned VM stopped, owned
processes absent, original routes restored, old machines preserved and source
unchanged. The continuation consumed the original total of two starts and two
stops, within its original deadline. No further start or retry is authorized by
that grant. The stopped owned VM and all failure evidence remain retained.

Actual smoke, strict browsers, recovery, current image SBOM/scan and final
release qualification remain required. This older source does not qualify later
branch changes. No readiness, advisory acceptance, filing or promotion gate
has been opened.

Private evidence: `nov05-native-zero-export-execution-sourcefirst-v3` actual
`710aa77e4d0449a1b0aa0edacca64d6f`; `nov05-native-docker-alias-canonicalization`;
`nov05-native-docker-alias-independent-corrected`; and
`nov05-native-owned-continuation-sourcefirst/actual-continuation`.
Canonical archive SHA256:
e61bbe423e665fab072d1157cc07e0b97383f21664ebb8d214b996331cfbb58b.
Continuation source manifest:
47e934319620661f8724426fb58b501281bff0f3ef191aff8fa7b1df950f1627;
distinct review manifest:
be7516548a1499878ee79dae94377b846da879205e193a4258f680e17e76dd65.
