---
name: lint
description: Lint the codebase and auto-fix issues.
disable-model-invocation: true
allowed-tools: Bash
---

# Lint & Fix

## Commands

| Action | Command |
|--------|---------|
| Check only | `pnpm lint` |
| Auto-fix | `pnpm lint:fix` |
| Type check | `pnpm typecheck` |

## Workflow

1. Run `pnpm lint:fix` to auto-fix what's possible
2. Report any remaining errors that need manual attention
3. Run `pnpm typecheck` for type-level issues
