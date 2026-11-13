// Spec: spec/federal/schedule-c-wagering-2026.yaml
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const original = {
  taxYear: 2026,
  ledgerReference: "Synthetic wagering ledger",
  fullCalendarYearConfirmed: true,
  completeDomesticProfessionalActivityConfirmed: true,
  noOtherActivityOrDuplicatedAmountsConfirmed: true,
  grossTaxableWageringGains: "12000.15",
  wageringLosses: "10000.25",
  otherwiseDeductibleWageringExpenses: "1999.80",
} as const;
const taxpayer = { ...simpleW2Fixture.taxpayer, taxYear: 2026 };
const scheduleC = { accountHolder: "primary", accountingMethod: "cash", professionalWagering: original };
const fixture = { taxpayer, scheduleC };

describe("professional wagering in 2026", () => {
  it("uses actual professional gains and applies the limitation once to the combined cost pool", () => {
    const input = TaxYearInputSchema.parse(fixture);
    const result = calculateScheduleC(input, input.scheduleC);
    // The $12,000.05 combined cost pool yields $10,800.045. The result preserves mills.
    expect(result.grossReceipts.toFixed()).toBe("12000.15");
    expect(result.grossIncome.toFixed()).toBe("12000.15");
    expect(result.totalExpenses.toFixed()).toBe("10800.045");
    expect(result.netProfit.toFixed()).toBe("1200.105");
    expect(result.lines.filter(row => row.form === "Sched C" && row.line === "27b").map(row => row.value.toFixed())).toEqual(["10800.045"]);
    const trace = result.lines.find(row => row.form === "Schedule C Wagering Worksheet");
    expect(trace?.inputs["Wagering losses"].toString()).toBe("10000.25");
    expect(trace?.inputs["Otherwise deductible wagering expenses"].toString()).toBe("1999.8");
    expect(JSON.stringify(result.lines)).not.toContain(original.ledgerReference);
  });

  it.each([
    ["900.00", "1000.00", "0", "900", "0"],
    ["900.01", "1000.00", "0", "900", "0.01"],
    ["899.99", "1000.00", "0", "899.99", "0"],
    ["1000", "0", "100.05", "90.045", "909.955"],
    ["0", "1000", "100", "0", "0"],
    ["1000", "0", "0", "0", "1000"],
    ["999999999999.99", "999999999998.11", "0.03", "899999999998.326", "100000000001.664"],
  ])("caps the 90 percent pool at actual gains %s", (gross, losses, expenses, allowed, profit) => {
    const input = TaxYearInputSchema.parse({ ...fixture, scheduleC: { ...scheduleC, professionalWagering: {
      ...original, grossTaxableWageringGains: gross, wageringLosses: losses, otherwiseDeductibleWageringExpenses: expenses,
    } } });
    const result = calculateScheduleC(input);
    expect(result.totalExpenses.toFixed()).toBe(allowed);
    expect(result.netProfit.toFixed()).toBe(profit);
  });

  it("requires the exact current original and separate source classifications", () => {
    for (const change of [
      { taxYear: 2025 }, { ledgerReference: " " }, { fullCalendarYearConfirmed: false }, { completeDomesticProfessionalActivityConfirmed: false },
      { noOtherActivityOrDuplicatedAmountsConfirmed: undefined }, { wageringLosses: undefined },
      { wageringLosses: "-0.01" }, { otherwiseDeductibleWageringExpenses: "0.001" }, { grossTaxableWageringGains: "1e3" },
      { unsupportedLossCarryforward: "1" },
    ]) {
      expect(TaxYearInputSchema.safeParse({ ...fixture, scheduleC: { ...scheduleC, professionalWagering: { ...original, ...change } } }).success).toBe(false);
    }
    for (const change of [
      { taxpayer: { ...taxpayer, taxYear: 2025 } },
      { taxpayer: { ...taxpayer, filingStatus: "married_filing_jointly" } },
      { scheduleC: { ...scheduleC, accountHolder: undefined } },
      { scheduleC: { ...scheduleC, accountingMethod: "accrual" } },
      { scheduleC: { ...scheduleC, grossReceipts: "12000.15" } },
      { scheduleC: { ...scheduleC, otherIncome: "1" } },
      { scheduleC: { ...scheduleC, expenses: { otherExpenses: "1999.80" } } },
      { scheduleC: { ...scheduleC, homeOffice: { method: "simplified", squareFeet: 1 } } },
      { scheduleA: { gamblingLosses: "0.01" } },
      { formW2G: [{ payer: "Fictional payer", reportableWinnings: "10", federalWithheld: "2" }] },
      { form1099Nec: [{ payer: "Fictional client", nonemployeeCompensation: "1" }] },
    ]) {
      const input = TaxYearInputSchema.parse({ ...fixture, ...change });
      expect(() => calculateScheduleC(input, input.scheduleC)).toThrow(/professional wagering/i);
    }
    const input = TaxYearInputSchema.parse(fixture);
    expect(() => calculateScheduleC(input, { accountHolder: "primary", grossReceipts: "1" })).toThrow(/professional wagering/i);
    expect(() => calculateScheduleC(input, { ...input.scheduleC,
      professionalWagering: { ...original, grossTaxableWageringGains: "1" },
    })).toThrow(/retained ledger facts/i);
    const replay = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input)));
    expect(calculateScheduleC(replay).netProfit.toFixed()).toBe("1200.105");
  });

  it("preserves the legacy no-override entry for an ordinary Schedule C", () => {
    const input = TaxYearInputSchema.parse({ ...fixture, scheduleC: { grossReceipts: "2" }, form1099Nec: [
      { payer: "Fictional client", nonemployeeCompensation: "1" },
    ] });
    expect(calculateScheduleC(input).grossReceipts.toFixed()).toBe("1");
    expect(calculateScheduleC(input, input.scheduleC).grossReceipts.toFixed()).toBe("2");
  });

  it("carries only Schedule C profit into Schedule SE and leaves the full-year gate closed", () => {
    const input = TaxYearInputSchema.parse(fixture);
    const result = calculateScheduleSE(input, FEDERAL_2026_CONSTANTS);
    expect(result.netNonfarmProfit.toFixed()).toBe("1200.105");
    // Round 1200.105 × .9235 to 1108; $137 Social Security plus $32 Medicare.
    expect(result.totalSETax.toFixed()).toBe("169");
    expect(() => calculateFederalTax(input)).toThrow(/2026.*incomplete/i);
  });
});
