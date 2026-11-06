# Reviewed Node 26 lock-contract successor

The full local and remote unit runs at `6393455d` exposed a stale whole-lock
assertion. Separately reviewed dependency commit `1fef5041` added Vercel
Functions 3.10.6; the Node 26 assertion still expected the earlier lock.

The spec preserves the historical SHA256
`d199e2344fa6cf61402330f216e3f7ccf6bc9b5e7a568670b29a9fe27dc8c23f`
and binds the exact approved successor
`268026058217dd84aee4e9b1c691fa1bac7d3049e6cb68d7fd16ef3af7a76dea`.
The current lock is byte-identical to that dependency commit: all historical
package/snapshot entries remain unchanged, with 17 additive keys in each and
one web importer addition. Future lock changes still require explicit review.
No dependency, runtime, workflow, coverage gate or timeout changes here.

Spec-first private reproduction records one failure and six passes before the
single expected-hash correction; all seven pass afterward. Distinct review
replays seven tests, seven spec references and six drift/graph controls. Current
main's seven focused tests pass. TypeScript, spec validation, inventory freshness and lint also pass.

The original full run remains retained: local unit 26,787 pass/two fail,
coverage 26,788 pass/one fail, and browser 579 pass/five original hosted-only
skips/zero failures or retries (584 cases). All 5,364 regular-file pins stayed
unchanged. No current coverage percentage was emitted after the failed tests.
The separate PA static PDF five-second timeout remains unresolved. Remote unit
reproduced both failures; remote coverage reproduced the lock failure; remote
managed browser passed. This package does not establish a passing successor
full run, container scan, hosted security, human review or release readiness.

Private evidence under `.local/upgrade-evidence`:

- Author `nov05-node26-reviewed-lock-successor-private`, 20-member manifest
  `5ff5e3bafa93c722733d4f3ed21a313e1036b8999a80cca37258dd6302b7c654`.
- Distinct `nov05-node26-reviewed-lock-successor-independent`, 21-member
  manifest `5d014ec621594369823f855c36f3b18acdda2c3994e6c98921b373191c94a803`.
- Main `nov05-node26-reviewed-lock-successor-main`.
- Original full run `nov05-current-public-hosting-selfhost-global`, 1,261-member
  manifest `34faf1e5aacfdbfa091df8b9131519b32ba606ef862e9eb95b32cf6a19b49821`.
