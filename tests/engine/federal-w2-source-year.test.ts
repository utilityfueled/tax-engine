// Spec: spec/federal/form-1040.yaml.
// Spec: spec/federal/w2-state-local-canonical.yaml.
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

const wageSource = {
  ...simpleW2Fixture.w2s[0],
  taxYear: 2026, accountHolder: "primary" as const, wages: "50000", federalWithheld: "9500",
  socialSecurityWages: "50000", socialSecurityWithheld: "3100",
  medicareWages: "50000", medicareWithheld: "725",
};

const jointTaxpayer = {
  ...simpleW2Fixture.taxpayer,
  taxYear: 2026, filingStatus: "married_filing_jointly" as const,
  spouse: { ...simpleW2Fixture.taxpayer.primary, firstName: "Alex", ssn: "321-54-9876" },
};

it("holds indistinguishable canonical W-2 originals for a 2026 return", () => {
  for (const copy of [
    { ...wageSource },
    { ...wageSource, wages: "50000.00", federalWithheld: "9500.0",
      employer: { name: "  TECH  CORP ", ein: "123456789" }, state: "OH", stateTaxWithheld: "1500" },
  ]) {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, w2s: [wageSource, copy] });
    expect(() => calculateFederalTax(input)).toThrow(/reconcile.*W-2 originals/i);
  }
  const unassigned = { ...wageSource, accountHolder: undefined, taxYear: undefined };
  for (const w2s of [[wageSource, unassigned], [unassigned, wageSource]]) {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: jointTaxpayer, w2s });
    expect(() => calculateFederalTax(input)).toThrow(/reconcile.*W-2 originals/i);
  }
});

it("holds 2026 W-2 copies with supplemental metadata differences", () => {
  const copies = [
    { label: "employer address", copy: { ...wageSource, employer: { ...wageSource.employer, address: "1 Sample Street" } } },
    { label: "inactive service", copy: { ...wageSource, militaryService: { activeDuty: false } } },
  ];
  for (const { label, copy } of copies) {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, w2s: [wageSource, copy] });
    expect.soft(() => calculateFederalTax(input), label).toThrow(/reconcile.*W-2 originals/i);
  }
});

it("preserves affirmative military facts in 2026 W-2 comparison", () => {
  for (const militaryService of [
    { activeDuty: true, dutyState: "OH" },
    { activeDuty: false, combatOrHazardousDutyPay: true },
  ]) {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
      w2s: [wageSource, { ...wageSource, militaryService }] });
    const result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe("100000");
    expect(result.totalPayments.toFixed()).toBe("19000");
  }
});

it("counts different W-2 originals for the same employer and both identified joint recipients", () => {
  const distinct = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    w2s: [wageSource, { ...wageSource, wages: "49000", socialSecurityWages: "49000", socialSecurityWithheld: "3038",
      medicareWages: "49000", medicareWithheld: "710.50" }],
  });
  const distinctResult = calculateFederalTax(distinct);
  expect(distinctResult.agi.toFixed()).toBe("99000");
  expect(distinctResult.totalPayments.toFixed()).toBe("19000");
  const joint = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: jointTaxpayer,
    w2s: [wageSource, { ...wageSource, accountHolder: "spouse" }],
  });
  const jointResult = calculateFederalTax(joint);
  expect(jointResult.agi.toFixed()).toBe("100000");
  expect(jointResult.totalPayments.toFixed()).toBe("19000");
});

it("keeps historical canonical 2025 W-2 admission", () => {
  const original = { ...wageSource, taxYear: 2025 };
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [original, { ...original }] });
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe("100000");
  expect(result.totalPayments.toFixed()).toBe("19000");
});
