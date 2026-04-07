# Tax Engine Spec Documents

Each YAML file in this directory documents every line of an IRS form or worksheet.
These specs are the **source of truth** for the tax engine.

## Format

```yaml
form: "Form 1040"            # IRS form name
taxYear: 2025                # Tax year
irsReference: "1040-inst"    # IRS instructions document
lines:
  - line: "1"
    description: "Wages, salaries, tips, etc."
    formula: "Sum of all W-2 Box 1 values"
    irsRef: "Form 1040 Instructions, Line 1"
    inputs:
      - "W-2 Box 1 (all employers)"
    edgeCases:
      - "Multiple W-2s from same employer"
      - "Corrected W-2c"
    testRef: "tests/engine/federal.test.ts::Form 1040 Line 1"
```

## Workflow

1. **New form/schedule**: Create the spec YAML first
2. **Write failing tests** referencing spec lines
3. **Implement** the calculations
4. **Verify** with `pnpm spec:validate` that all lines are covered
   For Pennsylvania-only state iterations, use `pnpm spec:validate:pa` to
   validate just the `spec/state/pa-*.yaml` surface, then run `pnpm test:pa`
   to confirm the Pennsylvania calculators and related public API coverage.

## IRS References

- Form instructions: https://www.irs.gov/forms-instructions
- Publications: https://www.irs.gov/publications
- Revenue procedures: https://www.irs.gov/irb
