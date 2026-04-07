---
name: fix-issue
description: Fix a GitHub issue by number. Reads the issue, implements the fix, writes tests, and prepares a commit.
disable-model-invocation: true
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

# Fix GitHub Issue

Fix issue #$ARGUMENTS following project conventions.

## Workflow

1. **Read the issue**: `gh issue view $ARGUMENTS`
2. **Understand the requirements**: Read linked files, related code, spec entries, and any discussion
3. **Update spec first**: If this touches tax calculations, update the relevant spec YAML in `spec/`
4. **Write failing test**: Add or update tests that reference the spec
5. **Implement the fix**: Make the fix following project conventions:
   - TypeScript strict mode, no `any`
   - Zod validation at boundaries
   - Decimal for all monetary values
   - Audit trail on calculated values
   - Path aliases (`@/*`)
6. **Run tests**: `pnpm test` to verify
7. **Lint**: `pnpm lint:fix`
8. **Commit**: Stage changes and create a descriptive commit referencing the issue:
   ```
   fix: <description> (#$ARGUMENTS)
   ```
