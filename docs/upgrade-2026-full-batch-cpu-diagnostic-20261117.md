# Original-batch public JavaScript diagnostic

This is an adopted, default-off diagnostic. It has not run against an application and does not qualify a release. The existing full strict baseline, its 30-second case deadlines, actions, assertions, tracing, two configured workers, zero retries and request windows remain unchanged.

Actual Web run `44169011257` at `2fccaa27` completed all 655 cases: ordinary managed mode passed 650 with five original skips; strict mode passed 636, failed 14 and retained those five skips. The ordinary mode used 90-second deadlines. Five of the twelve non-PDF strict failures also took over 30 seconds when they passed in ordinary mode. The twelve strict failures comprise two NEW212 cases, one reciprocal case, four resident-credit cases, four school part-year cases and one PA married-payment case. Two further failures were the existing four-second RRTA privacy-child bound.

The retained non-PDF traces show 452–852 completed browser/protocol actions per case. They provide wall intervals, not process CPU or GC attribution. The strict image's server uses a 384 MB old-space cap; Chromium does not inherit that cap. Docker inspection records no CPU or memory cgroup limit on the four-CPU host. No heap cause is established. The later `6cf1d4f3` run, whose application/test/build source is identical, had only two strict school part-year deadline failures; its ordinary job separately had two RRTA privacy-child failures. These outcomes preserve the failures and demonstrate varying headroom, not a readiness pass.

The new helper reuses the reviewed public-chunk inventory, profiler fixture, sanitizer, case-result projection and owned-command supervisor. It validates the same job's completed failed full baseline and all original source/image evidence. It derives the original batch plan from the complete 655-case collection, then executes exactly original batch 6 (10 rows) or 7 (15 rows), preserving order and bounds rather than repacking targets. Existing wrappers sample six and eight cases respectively; unwrapped neighbors still execute unchanged. The PA married-payment failure remains unsampled. Some unrelated PA cases are original batch neighbors; they remain unchanged and unsampled too.

Each invocation checks the public current-job metadata against the exact source, run, attempt and container job identity. Its original 90-minute job deadline must have at least 600 seconds for the controller plus 600 seconds reserved for later job steps. Otherwise it emits a fixed `HOLD`. Each invocation has a 600-second outer limit, with the last 30 seconds reserved for owned-child and temporary-file cleanup. Neither the original job nor any case deadline is extended.

Only sanitized public-JavaScript projections, fixed outcomes and validated identity/budget metadata enter the new artifact directory. Raw Playwright traces, reports and temporary profiler files stay in the owned temporary directory and are removed. Observed worker and parallel indices come from actual results; configured concurrency alone does not prove two workers ran. Sampling changes execution cost, so no result supersedes the original full failure.

The existing registered Web workflow now exposes the default-false boolean `cpu_full_batches` input and two separate steps after the original strict browser step, before its existing cleanup. The job retains its 90-minute limit and all existing security/resource settings. Each sampling step has a 10-minute outer timeout. Explicit manual full-batch runs use a unique run-ID concurrency group, preventing cancellation of a normal qualification run on the same source SHA. All normal group semantics remain unchanged.

```yaml
      - name: Sample original strict batch 6
        if: ${{ !cancelled() && github.event_name == 'workflow_dispatch' && inputs.cpu_full_batches && steps.container_browser.outcome == 'failure' }}
        timeout-minutes: 10
        uses: ./.github/actions/browser-cpu-full-batches
        with:
          enabled: 'true'
          original-outcome: ${{ steps.container_browser.outcome }}
          batch: '6'
        env:
          CANDIDATE_IMAGE_ID: ${{ steps.candidate.outputs.image_id }}
      - name: Sample original strict batch 7
        if: ${{ !cancelled() && github.event_name == 'workflow_dispatch' && inputs.cpu_full_batches && steps.container_browser.outcome == 'failure' }}
        timeout-minutes: 10
        uses: ./.github/actions/browser-cpu-full-batches
        with:
          enabled: 'true'
          original-outcome: ${{ steps.container_browser.outcome }}
          batch: '7'
        env:
          CANDIDATE_IMAGE_ID: ${{ steps.candidate.outputs.image_id }}
```

Author controls: five meaningful controls first failed before implementation; a sixth outcome-preservation control also failed before its correction. All six now pass, including foreign-source/attempt/job refusal, exact original row/order/bounds refusal, preflight-before-execution refusal, deadline/remaining-budget boundaries and sanitized-artifact/default-off contracts. All 182 adjacent controls in four files pass, scoped ESLint and syntax checks pass, both YAML files parse, nine original test-source pins match, and spec validation reports 9,447 valid test references with none missing or broken. Independent source review passed (`9797eb1348d5b052faf5654aa01ddedcfc9c3a2f5fa6c834cd7a57cb29e0bfff`). Separate workflow adoption review passed (`f9f2526fb1afa911c4ff7d8fe2b86e948fc8193aa139d37604062299fed97c10`), including an exact YAML inverse of every original field and 36 concurrency cases. Root reran the six focused controls, syntax, scoped lint, workflow grammar and spec validation. No deployment, service creation, provider call or actual browser rehearsal occurred in this package.

References: [GitHub manual workflow requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [workflow step timeouts](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepstimeout-minutes), [composite action metadata](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runs-for-composite-actions).
