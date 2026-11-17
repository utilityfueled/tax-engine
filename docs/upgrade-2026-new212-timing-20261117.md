# Optional NEW212 PDF timing evidence

The prior strict container run failed both NEW212 cases at their unchanged
30-second deadline. Existing traces leave part of the PDF review interval
unobserved; they establish no CPU, network, server or Python cause.

An optional, default-off test probe now emits only ten fixed phase names,
start/finish boundaries, elapsed milliseconds and success booleans. It records
click, remaining response/download waits, file operations, the existing PDF
child call, parsing and validation. Missing finishes remain incomplete evidence.
No document content, paths, commands, results or exception text enter these
diagnostic records. All original actions, assertions, Python code and child
arguments, timeout and output limit are preserved.

Only the exact environment value `TAX_ENGINE_TEST_NEW212_TIMING=1` enables it.
The shared environment reducer forwards that value to the existing ordinary
and optional CPU runners; their other environment restrictions remain intact.
Two source-linked failures precede two passing controls. Ten timing controls,
five source-change negatives, two syntax parses, types, scoped lint,9432spec
references and inventory checks pass. Root and independent source reviews pass.
The source audit retains every budget and hash value; its initial key-order
failure is retained and fixed by restoring the snapshot's required ordering.
The generated inventory adds one unsupported browser-contract entry.

The first actual instrumented local run on `9343d78a` passes both original
cases: desktop 9,686 ms and mobile 8,604 ms. The fresh web build passes. Both workers
retain the 30-second deadline, zero retries and the original PDF assertions.
All 40 fixed timing records have successful finishes; the managed server closes
normally and a fresh check finds its PID and port absent.

Remaining response waits are 1,093.867 ms / 986.929 ms; the existing Python-call
intervals are 937.100 ms / 946.247 ms. These intervals include callback argument
construction and wall time, not isolated child CPU. They exclude other journey
work. A single macOS run neither reproduces nor explains the prior Linux
container failures and establishes no speedup or container qualification.

Actual execution result `1922b8643ff24412e276f1c9ed390e784b8d233147f93ef342970b0e688e6e2d`;
root saved-artifact review verifies 53 pins and both original results:
`006aa5d5fdfe598ff392b788ccec764188e695d29c120773eccf9ead0cf2732b`.

Root source review `6337491039e8abbcf86bdac6be5174b767113a216c2553f7f45bfa3e2b8736ed`;
independent helper `35e60f512bf099e871e928c599dfca8cd4d841521f169efb713ffb4774d6420c`;
independent forwarding/integration `d1f72185991cfad0316381a7b638be1d5c0621bc0893a5a612be2287687e1929`.
The root source review predates the subsequent order-only audit repair;
its separate adoption addendum binds the final metadata.

Independent final adoption/order review `5736db20e0b3fa96506db6cce9fa0c480420ba6ff296359ccbae50e13fc5701f`.
