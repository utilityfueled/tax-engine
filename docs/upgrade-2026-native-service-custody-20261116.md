# Native service custody follow-up, November 16

The current c018 ARM64 rehearsal remains blocked before runtime staging. The
read-only socket diagnostic identifies an hardcoded UID/GID equality
assumption in the local maintenance helper. It does not establish complete
service custody or authorize deletion.

The first socket attempt returned terminal 1 (`79dc29`) before any VM command:
the source packet omitted four files read by its inherited controller. Its
false stop/restoration flags remain false. The corrected packet verifies all
seven local prerequisites before launch; root and independent review verified
390 source pins and each ran all 17 inert controls.

The corrected actual session 25906 returned terminal 1 (`2b25ce`). Its 32 steps
and 66 saved files show normal VM stop, original 2 CPU/8192 MiB/384 GiB resources
and socket-route restoration, with no uncertain operation or exceeded deadline.
No image or guest file was removed. The original guard still rejects service
custody; after-preservation is unknown.

Both observation phases contain two exact service-command candidates among
11 real-UID-501 processes. One candidate reaches the original socket `lstat`:
its socket type, UID 501 and mode 0660 satisfy the original predicates, while
GID 1000 fails the helper's hardcoded GID 501 requirement. The other candidate
fails earlier and has no socket observation. Four unit collectors and zero
Podman-info collectors ran. The GID mismatch therefore explains one observed
rejection, not every admission failure. The root helper returned 1 and was
reaped with EOF and no remaining owned group; this is not successful protocol
admission.

Root owner ACK `bf6cd271387223a2e15b4978e823cc64bb1492fca5986a91017b3a569fe9eb5b`
and independent saved-artifact review
`62e14bd62ea5dc63eb653504f729b3fad32bdd14c2867e92d88d6e521605e32d`
bind the unchanged saved evidence. The independent reader returned 0 (`849cb5`).

Next work preserves both failures and investigates positively verified account,
process, systemd-unit and socket identity. Changing socket ownership just to
satisfy the helper would not establish that identity. Fresh capacity, exact
closed-image maintenance, current ARM64 runtime/recovery/browser execution,
image advisory disposition and release qualification remain required. The
current c018 runtime source packet is prepared but cannot stage using a
historical or failed maintenance witness.
