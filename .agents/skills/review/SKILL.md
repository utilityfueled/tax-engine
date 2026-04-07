---
name: review
description: Review code changes for quality, correctness, and spec compliance. Use when asked to review code, a PR, or recent changes.
context: fork
agent: Explore
allowed-tools: Bash(git *), Bash(gh *), Read, Grep, Glob
---

# Code Review

Review code changes against project standards and IRS spec compliance.

## Context

- PR diff: !`git diff main...HEAD 2>/dev/null || git diff HEAD~1`
- Changed files: !`git diff --name-only main...HEAD 2>/dev/null || git diff --name-only HEAD~1`

## Review Checklist

### Tax Accuracy (Critical)
- [ ] Calculations match IRS instructions and spec YAML
- [ ] All monetary math uses Decimal (no floating point)
- [ ] Rounding follows IRS rules (nearest dollar unless specified)
- [ ] Phase-outs and caps correctly implemented
- [ ] Edge cases covered in tests (thresholds, zero income, max values)

### Spec Compliance
- [ ] New calculations have corresponding spec YAML entries
- [ ] Spec entries cite IRS publication/instruction references
- [ ] Every spec line has at least one unit test
- [ ] Test names reference the spec line they validate

### TypeScript & Code Quality
- [ ] No `any` types (use `unknown` with Zod validation)
- [ ] Functions are pure — no side effects in calculations
- [ ] Audit trail maintained for calculated values
- [ ] Path aliases used (`@/*` not relative `../../`)

### Testing
- [ ] New code has corresponding tests
- [ ] Tests follow Arrange-Act-Assert pattern
- [ ] Test fixtures exercise edge cases near thresholds
- [ ] Coverage thresholds maintained

## Output Format

Provide findings grouped by severity: Critical > Warning > Suggestion.
Include file paths and line numbers for each finding.
