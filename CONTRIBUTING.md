# Contributing

## Before You Start

- Read [README.md](./README.md)
- Read [SECURITY.md](./SECURITY.md)
- Keep all fixtures and examples synthetic
- Avoid broad refactors mixed with tax-rule changes

## Local Setup

```bash
pnpm install
pnpm dev
pnpm test
```

## Required Workflow For Tax Logic

When changing a tax calculation:

1. Write or update the spec entry in `spec/`
2. Add or update the failing test that references the spec
3. Implement the engine change
4. Run the narrowest relevant tests
5. Run `pnpm spec:validate`

## Accuracy Standards

- Cross-check against official IRS or state instructions
- Use `Decimal` for monetary math
- Follow jurisdiction-specific rounding rules
- Prefer small, auditable functions with explicit inputs and outputs

## Pull Request Guidelines

- Explain what changed and why
- Link the affected form, schedule, or worksheet
- Note any tax-year assumptions
- Call out risk areas and follow-up work
- Include tests for new behavior

## Scope Discipline

- Do not commit secrets, personal data, or internal-only operational files
- Keep code changes and fixture changes tightly scoped
- Prefer additive migrations over silent behavior changes

## Code Style

- TypeScript strict mode
- Validate unknown inputs at boundaries
- One calculation module per form or schedule where practical
- Preserve the audit trail when adding computed values

## Need Help?

Use [SUPPORT.md](./SUPPORT.md) for the right support channel.
