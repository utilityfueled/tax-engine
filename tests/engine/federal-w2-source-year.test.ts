// Spec: spec/federal/form-1040.yaml.
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return {
    ...original,
    getConstants: (year: number) => year === 2026
      ? FEDERAL_2026_CONSTANTS
      : original.getConstants(year),
  };
});

function parsedReturn(returnYear: number, sourceYear: number | undefined) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: returnYear },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: sourceYear }],
  });
}

it.each([[2025, 2024], [2025, 2026], [2026, 2025], [2026, 2027]])(
  "holds explicitly wrong-year W-2 wages and withholding for a %i return (source %i)",
  (returnYear, sourceYear) => {
    const input = parsedReturn(returnYear, sourceYear);
    expect(input.w2s[0]?.taxYear).toBe(sourceYear);
    expect(() => calculateFederalTax(input))
      .toThrow(new RegExp(`W-2.*source year.*${returnYear}`, "i"));
  },
);

it.each([2025, 2026])("keeps matching and undated W-2 wage and withholding inputs for %i", returnYear => {
  for (const sourceYear of [returnYear, undefined]) {
    const input = parsedReturn(returnYear, sourceYear);
    expect(input.w2s[0]?.taxYear).toBe(sourceYear);
    const result = calculateFederalTax(input);
    const line = (id: string) => result.allLines.find(entry => entry.form === "1040" && entry.line === id)?.value.toString();
    expect(line("1a")).toBe("85000");
    expect(line("25a")).toBe("12750");
    expect(result.agi.toString()).toBe("85000");
  }
});
