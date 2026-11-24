// Spec: spec/federal/schedule-a-2026.yaml
import { describe, it, expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { calculateSALTDeduction } from "@/utils/tax-math.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";
describe("Direct SALT facts retain categories", () => {
  const facts = { realEstateTaxes: "3000", additionalStateLocalIncomeTaxes: "2000", personalPropertyTaxes: "500" };
  it("routes direct tax payments to their proper Schedule A lines", () => {
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleA: facts }));
    const line = (number: string) => result.allLines.find(entry => entry.form === "Sched A" && entry.line === number)?.value.toString();
    expect(line("5a")).toBe("2000");
    expect(line("5b")).toBe("3000");
    expect(line("5c")).toBe("500");
    expect(line("5e")).toBe("5500");
  });
  it("includes additional income taxes when comparing with sales taxes", () => {
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleA: facts, salesTaxDeduction: { state: "WA", method: "actual", actualGeneralSalesTax: "1500", autoCompare: true } }));
    expect(result.allLines.find(entry => entry.form === "Sched A" && entry.line === "5a")?.value.toString()).toBe("2000");
  });
  it.each(["realEstateTaxes", "additionalStateLocalIncomeTaxes"])("rejects negative additional %s", field => {
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleA: { ...facts, [field]: "-1" } }))).toThrow(/nonnegative/i);
  });
});

// spec/federal/schedule-a-2026.yaml, 5e-salt-phase-down-precision
it.each([
  { status: "single", magi: "505005", cap: "40398.5", reported: "40399" },
  { status: "married_filing_separately", magi: "252504", cap: "20199.4", reported: "20199" },
] as const)("rounds line 5e after the exact 2026 phase-down for $status", ({ status, magi, cap, reported }) => {
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      taxYear: 2026,
      filingStatus: status,
      spouse: status === "married_filing_separately" ? complexMFJFixture.taxpayer.spouse : undefined,
    },
    w2s: [],
    form1098: [],
    scheduleA: { realEstateTaxes: "50000" },
  });
  const constants = FEDERAL_2026_CONSTANTS;
  const result = calculateScheduleA(input, d(magi), status, constants);
  expect(result.lines.find(line => line.form === "SALT WS" && line.line === "10-limit")?.value.toFixed()).toBe(cap);
  expect(result.lines.find(line => line.form === "Sched A" && line.line === "5e")?.value.toFixed()).toBe(reported);
  expect(calculateSALTDeduction(d("0"), d("50000"), constants, d(magi), status).toFixed()).toBe(reported);
});
