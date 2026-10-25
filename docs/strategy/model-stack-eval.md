# Task-based AI evaluation

All selected profiles remain candidates. There is no quality score or model recommendation without measured runs.

The draft corpus contains 240 cases across eight tasks, ten scenario families and three variants per family. It includes a fixed held-out variant, missing/conflicting fields, cents, large amounts, duplicate lines, refunds, transfers, ambiguous business use, unsupported years and untrusted document instructions. It contains redacted text only. These generated variants are **not independently reviewed cases or evidence of extraction quality**. Broader independently authored scenarios and PII/redaction end-to-end review remain required.

Before any run, reviewers must validate expected values independently, preserve the held-out split, and record reviewer/date per case. Run each profile/case three times. Retain failed and abstaining attempts and their billed tokens, including retries/escalation. Compare Luna High, Sol Low, Sol High and explicitly enabled Gemini High with GPT-5 Mini and Gemini 3 Flash Preview. Actual account availability is unverified.

Use the application's versioned task schema for each response and record its validation result. Normalize only for deterministic field/category/citation comparisons; a normalized result alone is not an application-schema pass. A separate human must assess prose grounding, substantive quality and PII. Do not use an LLM as the monetary judge. Unknown usage prevents promotion. All attempts are priced exactly with Decimal, separately at actual-run and January 2027 rates. Cost per accepted task includes failed attempts.

Gates: >=99.5% schema validity and required-field exact match, no critical-field regression, no observed PII leak, filing-ready claim or engine-value override; reviewed held-out repeated coverage; P95 <=30 seconds routinely /120 seconds for cancellable reconciliation; January cost per accepted task <=$0.50 routinely /$1.00 reconciliation; >=10% lower accepted-task cost or >=1 percentage point quality gain against both baselines. These are predeclared initial evaluation budgets, not measured results.

Commands: `pnpm eval:models:sync` writes draft artifacts; `pnpm eval:models:check` checks freshness; `pnpm eval:models:live-summary -- --live-run-file=path.json` evaluates supplied records. The script makes no provider calls and spends no credits. Production activation, 5%/25%/100% rollout, rollback, representative corpus review and live measurements remain separate gates.
