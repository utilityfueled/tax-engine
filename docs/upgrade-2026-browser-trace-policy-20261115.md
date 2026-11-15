# Browser qualification trace policy

This policy changes failure diagnostics, not the test's assertions or
qualification limits. A paired local measurement supports the instrumentation
change; it does not qualify the failed strict AMD64 run.

Playwright 1.64.1 supports a public trace object with `snapshots: false` while
keeping screenshots, source files and attachments enabled. The project keeps
its default `on-first-retry` mode. The existing strict command still selects
`--trace=retain-on-failure`; the installed configuration merger replaces only
the object's mode and preserves its feature flags. No environment translation,
new fixture or production private API is required.

```ts
use: {
  trace: {
    mode: "on-first-retry",
    snapshots: false,
    screenshots: true,
    sources: true,
    attachments: true,
  },
}
```

The retained failure trace includes the action timeline, screenshot filmstrip,
test sources and attachments. It omits replayable DOM snapshots **and trace
HAR/network resources**. This is reduced failure forensics, not equivalent
evidence. The original 17 strict failures and their full traces remain retained
under source `1360b9cb4128901dcc8dfa8805393dbbfc203992`.

`retain-on-failure` already discards passing traces. With the qualification
runner enforcing zero retries, the default `on-first-retry` mode does not
record a retry trace. Full DOM/HAR traces have therefore not been universal
passing-run evidence. This does not justify dropping any live check.

All test bodies, native-control count/tag reads, duplicate-label checks,
fill/select/Tab actions, geometry and keyboard assertions, screenshots,
request privacy checks, response checks and strict PDF inspectors remain
unchanged. The runner still enforces two workers and zero retries. The selected
30-second deadline and existing reviewed body exceptions remain unchanged,
along with case identities, original skips, request budgets, source/build/image
binding, database closure and owned server cleanup. An audited configuration
change requires a reviewed source hash and dependent audit-hash refresh.

For a separately reviewed full-snapshot diagnostic, the same supported public
object can set `mode: "retain-on-failure"` and `snapshots: true`, retaining the
other three flags. This is a diagnostic configuration, not an automatic
qualification retry or permission to change deadlines, actions or assertions.
Any failing qualification remains failed.

The [spec](../spec/browser/qualification-trace-policy.yaml) is linked to
[installed configuration-merge regressions](../tests/scripts/qualification-trace-policy.test.ts).
They read literal policy values from the actual configuration without importing
its local environment loader or starting a browser. The installed merger is a
test-only compatibility oracle; production uses public `defineConfig` options.

The initial unchanged configuration produced a genuine feature-policy failure
while the existing CLI and qualification-limit regression passed. The same
regressions pass with the public trace object.

One ordered local Apple ARM comparison ran the same two original test bodies
with `--trace=retain-on-failure`, 30-second deadlines, two workers, zero retries
and no CDP profiler. Full tracing passed the school case in 16.242 seconds and
the passenger case in 6.793 seconds. With DOM snapshots disabled and the other
trace features retained, both passed in 12.863 and 3.177 seconds respectively.
Both runs closed their owned server and process groups normally.

These observations come from one baseline-then-candidate pair. Order, cache and
environment effects were not isolated. They do not establish CPU attribution,
an AMD64 performance result or remote qualification. The retained measurement
receipt is `PAIRED-MEASUREMENT.json`, SHA-256
`c0f012708a5ba6d4629136762d8e4379260e9f0dab9b1ffb7d171441ef8b31d4`,
under the private `nov15-strict-1360-local-trace-pair` evidence packet.
