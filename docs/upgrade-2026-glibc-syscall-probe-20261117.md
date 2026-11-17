# Glibc baseline syscall diagnostic

Native run44040154316 reached the full baseline build and failed
`misc/tst-personality` and `time/tst-clock2`. The clock test observed EPERM1
where it requires EINVAL22. Candidate, allocator and ABI qualification did not
run. All32 cleanup checks passed. This remains failed qualification.

The separate manual diagnostic compares three otherwise identical containers:
Docker28.0.4 builtin seccomp, its exact official policy, and that policy with
only personality argument4294967274 and clock_settime argument1 allowed.
The fixed probe restores process personality and attempts only the non-settable
monotonic clock. It adds no capability, host mount or host clock operation.
Complete toolchain package inventory must match the failed run, or execution
holds. The original full tests remain required after any diagnostic result.

Source-first failures precede ten passing controls. Root and independent source
and adoption reviews pass; adopted controls and scoped lint pass. The initial
three missing builtin imports and the earlier incorrect Docker inspect-shape
assumption are retained and corrected. The manual workflow has20minutes total;
its controller reserves3minutes of17 for normal owned-resource cleanup. No
package installation, image publication or release approval follows from it.

Root source review `642d7260e3b41da60aa865555ec05f37caade9c2ef2a35dc6d085591acd53b10`;
independent source `6ab12447c6d0afd938ac611d6a06e40f3c5e4c1306ae654ee4fa2ecb919c82e7`;
independent adoption `0ac02d6ae2967eb5d9f12b978c426573badc8ea30bd8289ad9a6873d1639e340`.
Actual diagnostic execution and all broader security gates remain pending.

Primary references: [Moby28.0.4 policy](https://github.com/moby/moby/blob/v28.0.4/profiles/seccomp/default.json),
[Docker28.0.4 option serialization](https://github.com/docker/cli/blob/v28.0.4/cli/command/container/opts.go),
[glibc personality test](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/unix/sysv/linux/tst-personality.c;hb=glibc-2.36),
[glibc clock test](https://sourceware.org/git/?p=glibc.git;a=blob;f=time/tst-clock2.c;hb=glibc-2.36).
