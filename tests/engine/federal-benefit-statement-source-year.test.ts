// Spec: spec/federal/form-1040.yaml, social-security-statement-source-year.
import { describe, expect, it, vi } from "vitest";
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

const sources = [
  { label: "Form SSA-1099", collection: "formSSA1099", amount: "netBenefits", year: "sourceTaxYear" },
  { label: "Form RRB-1099", collection: "formRRB1099", amount: "netSocialSecurityEquivalentBenefitPortion", year: "taxYear" },
] as const;

function parsedReturn(source: (typeof sources)[number], year: number, statementYear?: number) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: year, socialSecurityTips: "0", accountHolder: "primary" }],
    socialSecurityFacts: {
      sourceFactsConfirmed: true,
      puertoRicoIncomeExclusion: "0",
      americanSamoaIncomeExclusion: "0",
    },
    [source.collection]: [{
      [source.year]: statementYear,
      [source.amount]: "1000",
      federalWithheld: "125.51",
    }],
  });
}

for (const source of sources) {
  describe(source.label, () => {
    it.each([[2025, 2024], [2025, 2026], [2026, 2025], [2026, 2027]])(
      "holds a mismatched benefit statement for %i (source %i)",
      (year, statementYear) => {
        const input = parsedReturn(source, year, statementYear);
        expect(input[source.collection]?.[0]).toMatchObject({ [source.year]: statementYear });
        expect(() => calculateFederalTax(input)).toThrow(
          `${source.label} source year ${statementYear} must match the ${year} return`,
        );
      },
    );

    it.each([[2025, 2025], [2025, undefined], [2026, 2026], [2026, undefined]] as const)(
      "uses payments and withholding for %i (source %s)",
      (year, statementYear) => {
        const input = parsedReturn(source, year, statementYear);
        expect(input[source.collection]?.[0]).toMatchObject({ [source.year]: statementYear });
        const result = calculateFederalTax(input);
        const line = (id: string) => result.allLines
          .find(entry => entry.form === "1040" && entry.line === id)?.value.toString();
        expect(line("6a")).toBe("1000");
        expect(line("6b")).toBe("850");
        expect(line("25b")).toBe("125.51");
        expect(result.agi.toString()).toBe("85850");
        expect(result.totalWithholding.toString()).toBe("12875.51");
      },
    );
  });
}
