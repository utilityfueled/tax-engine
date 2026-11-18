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


## Actual original-batch run

[Manual run 44187013822](https://github.com/utilityfueled/tax-engine/actions/runs/44187013822)
at `b0634d4bfd73f57b4efdb11c2015353a8fbfe190` failed. Its original strict
baseline completed 646 passes, four failures and five original skips. The four
failures are NEW212 desktop, school refund desktop/mobile and school covered
desktop. Ordinary mode separately completed 649 passes, one RRTA desktop
four-second privacy-child failure and five skips. Neither result qualifies the
strict suite.

Both diagnostic admissions retained the same source/image and exact original
rows/bounds, configured two workers, zero retries, 30-second case deadlines and
retain-on-failure tracing. More than 45 minutes of the original job remained
before each invocation, with its ten-minute controller and cleanup reserves
unchanged. Batch 6 completed ten failed cases; batch 7 completed seven passes
and eight failures. Both diagnostic steps returned nonzero. Actual parallel
slots 0 and 1 were observed, with worker restarts. These diagnostic failures
are distinct from the original baseline's four failures. The fixed privacy
projection retains case IDs/status/duration, not arbitrary assertion text;
exact diagnostic assertion categories are unavailable in the retained records.

Ten of fourteen sanitized profiles validate. Four remain unavailable with
`invalid-profile/sample-interval`. Valid profiles span only 1.35–5.54 seconds
in the current-page main isolate. Their sampling wall intervals establish no
complete-journey or process-CPU cause; PA remains unsampled. No raw profiles or
traces were downloaded. The original failure and all unavailable records remain
retained; no limits, retries or assertions changed.

Assessment SHA-256:
`4e2aedcd0f76ffbdfe5a91e7a023d4fe5aa27df58543107bec3103df586e0a9c`.
It verifies 24 sanitized artifact file pins, 15 frozen source/dependency pins
and the separately reviewed workflow adoption. The recorded image is
`sha256:64c3a5034324ecffaf5141c70f703d62e4f0f725e86fd0785b978324ab6e7d93`.
Source/image admission is evidenced by the reviewed same-job guards and plans;
this assessment did not independently inspect the full image archive. The owned
container-removal step succeeded; no separate post-removal inspection is claimed.
The next source investigation may examine the rejected interval contract while
retaining these negatives; no rerun or product optimization follows from this
partial sample alone.

## Fixed metadata successor

A separately reviewed successor records only bounded fixed interval rejection
counts and diagnostic browser failure categories. Raw values/messages/stacks
stay private; unknown or inaccessible facts remain unknown. Profile acceptance,
weights, actions, limits, retries, workers, exits and cleanup are unchanged.
The original baseline projection and historical unknown records are preserved.
Eight new, six unchanged full-batch and all 27 original CPU controls pass,
along with lint, syntax, spec/inventory, browser audit and script closure.
Spec-first failures precede implementation. All 34 source/evidence pins match.
Source manifest: `76e736a9686b24eb9d027f3bc9168ef7ed7fdeac3f14bb8f59c21f47657633e0`.
Independent review: `add0662789ff6b37b85149b599eedec248d54b2689b7ef8f6bce30038df9c2bc`.
No fresh browser result or recovered historical category is claimed.

## Actual fixed-metadata run

Run44199237148, source43423f37, failed November18 at00:29:25UTC.
Ordinary self-host tests passed650 with zero failures and five skips. Original
strict container tests passed640, failed ten and skipped five. These retain
the original655 cases and all timing/assertion gates. Diagnostic batch6 failed
all ten (eight other/two timeout); batch7 passed seven and failed eight
(four other/four timeout). No cancellation or sampled success replaces failure.

Fourteen stored profiles were checked with the exact same-source validator:
nine valid, five unavailable for negative sample intervals. The fixed metadata
records seven negative deltas among35,569 intervals, with zero other rejection
categories. Their magnitude, origin and causal significance are unknown. Valid
profile spans range0.171–27.467seconds and cover only the current-page main
isolate. They establish neither complete journey/process CPU nor a host-gap cause.
The cleanup step succeeded; no separate post-removal inspection is claimed.

Frozen V2 actual assessment:
`2f51805c8ad4a1fef32574f23cc6fdcee0eda8453cf98b74c0e53e1c1c41170d`;
V2 manifest:
`3f73b26f33d662b14d91fc6f22e6d126676c9d2beffb49fdfb5eb47e468fd7be`.
The initial assessment was expanded before freezing; its first communicated
bytes were not retained. The version chain documents that drift without
reconstruction. The original raw-artifact manifest is unchanged. Root verified
the frozen V2 receipt and all eight manifest pins.

Real browser and React follow-up rejected two selector substitutions and found
no duplicate whole evaluation per fill. These negative investigations preserve
all original actions and failures. A separately reviewed, default-off counter
diagnostic for a navigation-free original phase is in preparation; no new
phase observation, product optimization or cause is claimed.
