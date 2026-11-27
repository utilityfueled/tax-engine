// Spec: spec/federal/form-8911.yaml.
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const charger = {
  taxYear: 2026, owner: "primary", invoiceReference: "Paid charger invoice",
  placedInServiceReference: "Dated installer commissioning record", censusTractSourceReference: "Census home tract result",
  censusTractGeoid: "01001020100", placedInServiceDate: "2026-06-30",
  invoiceGrossCost: "2000.00", nonqualifyingInvoiceCost: "0", rebatesAndOtherBasisReductions: "0",
  originalUseBeganWithTaxpayer: true, oneNewChargingPortConfirmed: true, domesticMainHomeConfirmed: true,
  personalUseOnlyConfirmed: true, invoiceReconciledConfirmed: true, censusTractMatchesLocationConfirmed: true,
} as const;

const wageReturn = {
  ...simpleW2Fixture,
  taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
  w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "primary", wages: "125000", federalWithheld: "24000",
    socialSecurityTips: "0", socialSecurityWages: "125000", socialSecurityWithheld: "7750", medicareWages: "125000", medicareWithheld: "1812.50" }],
};

it("holds a later port after the federal calculation as-of date", () => {
  const form8911 = {
    ...charger,
    additionalPortSources: {
      firstPortReference: "First port", independentCostsConfirmed: true,
      ports: [{ ...charger, portReference: "Second port", invoiceReference: "Second invoice", placedInServiceDate: "2026-07-01" }],
    },
  };
  const input = TaxYearInputSchema.parse({ ...wageReturn, form8911 });
  expect(() => calculateFederalTax(input, { asOfDate: "2026-06-30" })).toThrow(/on or before.*as-of/i);
  expect(calculateFederalTax(input, { asOfDate: "2026-07-01" }).form8911?.personalCredit.toFixed()).toBe("600");
});

it("calculates the June 30 credit and excludes a July 1 installation", () => {
  const input = TaxYearInputSchema.parse(JSON.parse(JSON.stringify({ ...wageReturn, form8911: charger })));
  const result = calculateFederalTax(input);
  // $125,000 less $16,100 standard deduction gives $108,900 taxable.
  // Rev. Proc. 2025-32 single rate: $17,966 + 24% * $3,200 = $18,734 ordinary tax.
  // Form 6251: $125,000 AMTI less $90,100 exemption, then 26% = $9,074 TMT.
  // The $600 personal credit fits under the $9,660 regular tax excess over TMT.
  expect(result.totalTax.toFixed()).toBe("18134");
  expect(result.form8911?.personalCredit.toFixed()).toBe("600");
  expect(result.form8911?.tentativeMinimumTax.toFixed()).toBe("9074");
  expect(result.form8911?.remainingBasis.toFixed()).toBe("1400");
  expect(result.allLines.find(line => line.form === "Sched 3" && line.line === "6j")?.value.toFixed()).toBe("600");
  expect(result.allLines.find(line => line.form === "1040" && line.line === "20")?.value.toFixed()).toBe("600");

  const late = calculateFederalTax(TaxYearInputSchema.parse({ ...wageReturn, form8911: { ...charger, placedInServiceDate: "2026-07-01" } }));
  expect(late.form8911?.personalCredit.toFixed()).toBe("0");
  expect(late.totalTax.toFixed()).toBe("18734");
});

it("uses the actual residential energy credit before the charger and the general business credit afterward", () => {
  const input = {
    ...wageReturn,
    energyCredits: { priorYearCarryforward: "9500", carryforwardSourceTaxYear: 2025, carryforwardConfirmed: true },
    form3800: { currentYearCredits: "500" },
  };
  const withoutCharger = calculateFederalTax(TaxYearInputSchema.parse(input));
  const result = calculateFederalTax(TaxYearInputSchema.parse({ ...input, form8911: charger }));
  // $18,734 regular tax - $9,500 residential credit - $9,074 TMT leaves $160.
  expect(result.form5695?.residentialCleanEnergyCredit.toFixed()).toBe("9500");
  expect(result.form8911?.personalCredit.toFixed()).toBe("160");
  expect(result.form8911?.remainingBasis.toFixed()).toBe("1400");
  expect(withoutCharger.schedule3?.generalBusinessCredit.toFixed()).toBe("160");
  expect(result.schedule3?.generalBusinessCredit.toFixed()).toBe("0");
  expect(result.totalTax.toFixed()).toBe("9074");
});

it("holds a source dated after the independent calculation as-of date", () => {
  const input = TaxYearInputSchema.parse({ ...wageReturn, form8911: charger });
  expect(() => calculateFederalTax(input, { asOfDate: "2026-06-29" })).toThrow(/ready for use.*as-of/i);
  expect(() => calculateFederalTax(input, { asOfDate: "2026-02-29" })).toThrow(/valid as-of date/i);
  expect(() => calculateFederalTax(input, { asOfDate: "9999-12-31" })).toThrow(/valid as-of date/i);
  expect(calculateFederalTax(input, { asOfDate: "2026-06-30" }).form8911?.personalCredit.toFixed()).toBe("600");
});
