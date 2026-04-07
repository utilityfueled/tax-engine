## Agent Guidelines

### Spec-First Workflow

When implementing any tax calculation:
1. Write or update the spec YAML entry first (in `spec/`)
2. Write the failing test that references the spec
3. Implement the calculation to make the test pass
4. Verify with `pnpm test`

### Research Protocol

When implementing a new IRS form or schedule:
1. Look up the official IRS instructions for the form
2. Document every line's formula in the spec YAML
3. Note phase-outs, caps, and special rules
4. Create test fixtures that exercise edge cases (near thresholds, over caps, etc.)

### Accuracy Standards

- Cross-reference calculations against IRS publications
- Use exact IRS rounding rules (round to nearest dollar unless specified)
- Test with known-good examples from IRS instructions where available
- Monetary math must use Decimal — never floating point

### Code Organization

- One file per IRS form/schedule in `src/engine/schedules/` or `src/engine/forms/`
- Each file exports a single calculation function
- Functions take validated input and return typed output with audit trail
- No side effects in calculation functions
