// Spec: spec/federal/form-1040.yaml.
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

const originals = [
  {
    label: "Form 1099-INT", collection: "form1099Int", box: "interestIncome", amount: "1210.25",
    form: "1040", line: "2b", withholdingLine: "25b",
  },
  {
    label: "Form 1099-DIV", collection: "form1099Div", box: "ordinaryDividends", amount: "1420.35",
    form: "1040", line: "3b", withholdingLine: "25b",
  },
  {
    label: "Form 1099-MISC", collection: "form1099Misc", box: "otherIncome", amount: "2750.65",
    form: "Sched 1", line: "8z", withholdingLine: "25b",
  },
  {
    label: "Form 1099-NEC", collection: "form1099Nec", box: "nonemployeeCompensation", amount: "2640.55",
    form: "Sched C", line: "1", withholdingLine: "25b",
  },
  {
    label: "Form W-2G", collection: "formW2G", box: "reportableWinnings", amount: "2530.45",
    form: "Sched 1", line: "8b", withholdingLine: "25c",
  },
] as const;

function parsedReturn(source: (typeof originals)[number], year: number, statementYear?: number) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: year, socialSecurityTips: "0", accountHolder: "primary" }],
    [source.collection]: [{
      payer: "Synthetic annual statement payer", taxYear: statementYear, accountHolder: "primary",
      [source.box]: source.amount, federalWithheld: "125.51",
    }],
    scheduleC: source.collection === "form1099Nec"
      ? { businessName: "Synthetic ordinary consulting business", qbiMateriallyParticipated: true }
      : undefined,
  });
}

for (const source of originals) {
  describe(source.label, () => {
    it.each([[2025, 2024], [2025, 2026], [2026, 2025], [2026, 2027]])(
      "holds a mismatched original statement for %i (source %i)",
      (year, statementYear) => {
        const input = parsedReturn(source, year, statementYear);
        expect(input[source.collection]?.[0]?.taxYear).toBe(statementYear);
        expect(() => calculateFederalTax(input)).toThrow(
          new RegExp(`${source.label} source year ${statementYear}.*${year}`),
        );
      },
    );

    it.each([[2025, 2025], [2025, undefined], [2026, 2026], [2026, undefined]] as const)(
      "uses the same-year or undated original for %i (source %s)",
      (year, statementYear) => {
        const input = parsedReturn(source, year, statementYear);
        expect(input[source.collection]?.[0]?.taxYear).toBe(statementYear);
        const result = calculateFederalTax(input);
        const line = (form: string, id: string) => result.allLines
          .find(entry => entry.form === form && entry.line === id)?.value.toString();
        expect(line(source.form, source.line)).toBe(source.amount);
        expect(line("1040", source.withholdingLine)).toBe("125.51");
        expect(line("1040", "1a")).toBe("85000");
        expect(line("1040", "25a")).toBe("12750");
        expect(line("1040", "25d")).toBe("12875.51");
      },
    );
  });
}
