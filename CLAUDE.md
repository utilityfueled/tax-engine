# Tax Engine

Open-source US federal and state tax engine. Spec-driven: every IRS rule maps to a spec entry and a unit test.

## Architecture

- **Language**: TypeScript (strict mode, no `any`)
- **Validation**: Zod schemas at all boundaries (input JSON, form outputs)
- **Testing**: Vitest with spec-driven tests — every IRS line/worksheet has a test
- **PDF**: pdf-lib for filling IRS fillable forms
- **CLI**: tsx for development, node for production

## Project Structure

```
src/
├── engine/           # Core tax calculation engine
│   ├── federal.ts    # Federal tax orchestration (Form 1040)
│   ├── schedules/    # Schedule A, B, C, D, E, SE, etc.
│   ├── worksheets/   # IRS worksheets (QDCG, passive loss, etc.)
│   ├── forms/        # Additional forms (8949, 8959, 8960, 8582, etc.)
│   └── state/        # State-specific engines (WA, CA, etc.)
├── models/           # Zod schemas and TypeScript types
│   ├── inputs.ts     # Input document schemas (W-2, 1099s, K-1s, etc.)
│   ├── outputs.ts    # Calculation result types
│   └── constants.ts  # Tax brackets, thresholds, rates by year
├── ingest/           # Input loading and validation
├── pdf/              # PDF form filling
├── utils/            # Shared calculation utilities
├── cli.ts            # CLI entry point
└── index.ts          # Library entry point

spec/                 # IRS spec documents (YAML) — source of truth
├── federal/
│   ├── form-1040.yaml
│   ├── schedule-a.yaml
│   ├── schedule-b.yaml
│   ├── schedule-c.yaml
│   ├── schedule-d.yaml
│   ├── schedule-e.yaml
│   ├── schedule-se.yaml
│   ├── form-8949.yaml
│   ├── form-8959.yaml
│   ├── form-8960.yaml
│   ├── form-8582.yaml
│   └── qdcg-worksheet.yaml
├── state/
│   └── wa-capital-gains.yaml
└── README.md         # Spec format documentation

tests/                # Unit tests (mirror spec structure)
├── engine/
│   ├── federal.test.ts
│   ├── schedules/
│   ├── worksheets/
│   ├── forms/
│   └── state/
├── models/
├── ingest/
├── pdf/
└── fixtures/         # Test fixture data

data/
├── input/            # Example input JSON files
└── output/           # Calculation outputs (gitignored)

forms/
├── blank/            # Blank IRS PDF forms (downloaded)
└── filled/           # Completed forms (gitignored)
```

## Key Commands

```bash
pnpm dev              # Run the web app locally
pnpm dev:engine       # Watch the root engine export surface
pnpm build            # TypeScript compilation
pnpm test             # Run all tests
pnpm test:watch       # Watch mode tests
pnpm test:coverage    # Coverage report
pnpm lint             # ESLint check
pnpm lint:fix         # Auto-fix lint issues
pnpm typecheck        # Type checking
pnpm calculate        # Run tax calculation on data/input/
pnpm spec:validate    # Validate spec files and test coverage
pnpm spec:validate:ca # Validate California state spec coverage
pnpm spec:validate:il # Validate Illinois state spec coverage
pnpm spec:validate:nj # Validate New Jersey state spec coverage
pnpm spec:validate:ny # Validate New York state spec coverage
pnpm spec:validate:oh # Validate Ohio state spec coverage
pnpm spec:validate:pa # Validate Pennsylvania state spec coverage
pnpm spec:validate:wa # Validate Washington state spec coverage
```

## Conventions

- Use `unknown` over `any`; validate with Zod at boundaries
- All monetary values use `Decimal` (from decimal.js) — never float
- Every IRS form line maps to a spec YAML entry with: line number, description, formula, IRS reference
- Every spec entry maps to at least one unit test
- Test names: descriptive, no "should" prefix, reference spec line (e.g., `"Form 1040 Line 11 - AGI equals total income minus adjustments"`)
- Constants (brackets, rates, thresholds) are year-keyed so engine supports multiple tax years
- State engines are modular — add new states without touching federal logic
- Audit trail: every calculated value records its inputs and formula

## Spec-Driven Development

The `spec/` directory is the source of truth. Each YAML file documents:
- Every line of an IRS form or worksheet
- The calculation formula
- IRS publication/instruction references
- Edge cases and phase-outs
- Links to the corresponding test

When tax rules change year-to-year, update the spec first, then update constants and tests.
For Pennsylvania-only state-lane work, prefer `pnpm spec:validate:pa` to confirm
the PA specs stay fully covered without being blocked by unrelated historical
spec-ref debt elsewhere in the repo.

## Frontend (Future)

The project will include a web UI for inputting tax data and viewing results. Use the `playwright-interactive` skill to iterate on the frontend.
