---
name: test
description: Run the project test suite. Use when asked to run tests, verify changes, or check for regressions.
disable-model-invocation: true
allowed-tools: Bash
---

# Run Tests

Run the test suite. Choose the appropriate scope based on the request:

## Commands

| Scope | Command |
|-------|---------|
| All tests | `pnpm test` |
| Watch mode | `pnpm test:watch` |
| Coverage report | `pnpm test:coverage` |
| Single file | `npx vitest run $ARGUMENTS` |
| Pattern match | `npx vitest run -t "$ARGUMENTS"` |

## Workflow

1. If `$ARGUMENTS` specifies a file or pattern, run that specific test
2. If no arguments, run the full suite: `pnpm test`
3. If tests fail, analyze the output and report:
   - Which tests failed and why
   - The relevant spec entries
   - The relevant source files
   - A suggested fix if the cause is clear
