---
name: spec-audit
description: Audit spec coverage — verify every IRS form line has a spec entry, every spec entry has a test, and calculations match IRS instructions. Use to find gaps in tax rule coverage.
allowed-tools: Bash, Read, Grep, Glob
---

# Spec Coverage Audit

Audit the spec-to-test-to-implementation chain for completeness.

## Workflow

1. **Scan all spec files** in `spec/federal/` and `spec/state/`
2. **For each spec entry**, verify:
   - A corresponding unit test exists in `tests/`
   - A corresponding implementation exists in `src/engine/`
   - The test name references the spec line
3. **Find gaps**:
   - Spec entries without tests
   - Implementations without spec entries
   - Tests without spec entries (undocumented behavior)
4. **Report** a summary with:
   - Total spec entries vs. tests vs. implementations
   - Missing tests (list spec lines)
   - Missing spec entries (list implemented but undocumented calculations)
   - Missing implementations (list spec lines without code)

## Output

Report findings as a table:

| Form | Line | Spec | Test | Implementation | Status |
|------|------|------|------|----------------|--------|
