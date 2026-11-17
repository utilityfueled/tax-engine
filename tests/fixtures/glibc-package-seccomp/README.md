# glibc package sandbox fixtures

`baseline-runner.txt` is the public pre-correction runner, SHA256 `703af2c4ab36575f72c6c7f7f777865396b43b8d5247060115c4ec3953c7bdd1`. It is read as text to prove the real candidate build method adds the new admission boundary.

`historical-package-before.json` projects the saved original package-container inspection from the failed AMD64 experiment. The original inspection SHA256 is `647142d47774a63b8c22a835d80fa077d25dcae8892b3fcd9948f3eceb1a1764`. Only the validator's Config entrypoint, command and environment; HostConfig network, privilege, root-filesystem, capabilities and security options; and mount type, source, destination and writable flag are retained. The sole host input path is replaced with `/fixture/authenticated/inputs`. This is a documented fixture transformation, not a new actual observation. Container, operation, graph-storage and host identities are omitted.

The historical `SecurityOpt: null` is unchanged and must fail the new guard. The positive projection changes only that field to the exact hypothetical profile. It does not claim the historical container had that profile or passed the original tests. No credentials or private host paths are retained.
