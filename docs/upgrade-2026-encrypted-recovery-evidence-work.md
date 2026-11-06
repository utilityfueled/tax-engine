# Authenticated encrypted-recovery browser evidence

The complete local lifecycle test now validates the strict encrypted envelope
and independently authenticates and decrypts the backup against originals read
before export. It no longer searches randomized ciphertext for short names.
Production encryption, storage and recovery code are unchanged.

The actual6e15 managed job failed its1280px name-substring assertion. Artifact
13489166584 (139,056,438bytes, SHA256
`6097afd6b106ee7053102fc4902c542d15da6d2db887a9e63e0be6afce5fafcc`)
contains one such token exclusively inside ciphertext. Both saved backups
authenticate and reproduce the exact workspace, guided facts and official
original W2 bytes. The old failed journey remains failed; later steps were not
proved by decryption alone. Its historical pre-export receipts lack independent
guided-mode/file-mtime oracles, so the archive replay does not claim those.

The test-only helper requires exactly eight canonical envelope fields, fixed
algorithm parameters, canonical binary encodings and valid AES-GCM
authentication. Decrypted payload shape, workspace, guided facts/mode, all
original IDs/metadata/hashes and complete document bytes must match independently
read originals. Unknown/duplicate/escaped fields, plaintext additions, malformed
encodings, wrong passwords, tampering and changed originals fail. Errors and
return values contain no decrypted originals, ciphertext or raw crypto errors.
All existing browser actions, request/privacy controls and limits remain.

Spec-first actual old assertion replay yields1280FAIL/390PASS. Author19tests
and distinct28tests pass, retaining14old recovery controls and nine independent
adversarial checks. Exact four-path adoption retains author45-member manifest
`92e19ad8538bbc2e32b3c719ac0dd9b134162b69436204664a23fc9d6118df3e`
and distinct70-member manifest
`6b51c2a346fce2360f1087e045ed78c1d5c2e4191dcd66a01195cd33f515b69b`.
An initial author include-merge mistake started a broader run; its parent was
stopped130 and logs retained. It establishes no broad-suite or performance pass.

Main at8ec7a6f3 plus this package passes all eight scoped checks: types3,
spec8591/8591, inventory, full lint,19focused unit tests and both actual
desktop/mobile complete lifecycle journeys. Browser execution uses explicit
30000ms,2configured workers (1actual worker for the single file),0retries,
0skips,16.7s; owned server54113 closes. All5,461 source hashes remain exact
during checks. These new journeys independently read mode/file metadata before
export and finish restore/reopen/delete with the stronger evidence helper.

The audit changes two source hashes and four line references only:1832→1833,
153contracts and all quotas unchanged. Generated inventory adds one operational
row:927→928, all927oldrows and68supported statuses unchanged. No final global,
remote-image, hosted/native, human, final2026 form or filing qualification follows.
