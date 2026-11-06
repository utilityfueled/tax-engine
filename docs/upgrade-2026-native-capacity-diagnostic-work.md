# November 5 native capacity diagnostic

The authorized capacity-only diagnostic completed in 12.449 seconds. It used one
normal start and one normal stop of the isolated rootless ARM64 test VM. The final
readbacks confirm the VM stopped, its owned processes absent and the original
Podman socket route restored. All other VM identities and preserved baseline
metadata remained checked. The user separately authorized stopping the existing
default VM; both normal-stop attempts and its intervening restart remain recorded.

The guest reported 76,500,168,704 free disk bytes and 7,599,566,848 available memory
bytes, two CPUs, UID 501, no host mounts and Podman 6.0.2. These are observations
from this boot, rather than estimates from its nominal 80 GiB disk allocation.
Twenty-eight bounded commands ran; the unchanged ceiling was 80. There were no
errors, builds, installations, application workloads or provider calls.

Before this run, five read-only observations established the actual current
stopped baseline. ROOT accepted that exact metadata for preservation; the helper
did not reconstruct historical inodes, timestamps or hashes. The original failed
diagnostic, old internal expiry and prior failed baseline observations remain
unchanged. The existing unused user approval was bound to a fresh internal
15-minute window: five minutes for observation and ten reserved for cleanup.
The command/output caps, single fixed facts command and no-retry policy stayed
unchanged. Source review passed 44 inherited, 21 new and nine distinct controls.

The single approved diagnostic is now consumed. Cumulative reserved test-VM
starts/stops are 3/3. This result does not qualify an application image, a full
release rehearsal, a filing export or production hosting. A complete rehearsal
still needs the final application source/export, reviewed execution bindings,
applicable authorization, actual build/recovery/browser/scan results and the
remaining human and final-form qualification evidence.

Private evidence under `.local/upgrade-evidence/`:

- Source: `nov05-native-diagnostic-current-baseline-continuation-sourcefirst`,
  16-member manifest `c75fa38aad9b22873cceb192e6b0b58f5f7a3aac3f38ece718408aa2577dbe73`.
- Distinct review: `nov05-native-diagnostic-current-baseline-continuation-independent`,
  13-member manifest `c8c9f5ff199e3b66bb079831540fd7514e868de8a19fa724fcd425b30ea01a8a`.
- Actual: `nov05-native-diagnostic-current-baseline-continuation-root`,
  89-member manifest `fc7408cf5b7b233cc48f149f454f1128939351ae6074625efb876edbffce8863`;
  tool session 24727 closed naturally with exit 0. ROOT reverified every member.

A pre-execution ROOT proof/config check passed without native imports. The
frozen source report's template wording was corrected in a separate addendum:
the disabled template retains a historical metadata descriptor, and execution
requires the exact accepted current descriptor. No frozen source was rewritten.
