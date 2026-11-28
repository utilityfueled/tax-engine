import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/public-federal-return.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { ordinaryExpenseSources, scheduleCSourceFixture } from "../../fixtures/schedule-c-source-facts.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

// Exercise the federal calculation without enabling the public 2026 rule pack.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

function business(taxYear: number, allInvestmentAtRisk: boolean | undefined, grossReceipts = "1000", supplies = "7000") {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
    w2s: simpleW2Fixture.w2s.map(w2 => ({ ...w2, socialSecurityTips: "0" })),
    scheduleC: { grossReceipts, expenses: { supplies }, materiallyParticipated: true, allInvestmentAtRisk },
  });
}

it("holds a 2026 business loss when the original at-risk answer is false", () => {
  const input = business(2026, false);
  expect(() => calculateScheduleC(input, input.scheduleC)).toThrow(/Schedule C.*Form 6198/i);
});

it("holds a retained 2026 business loss at the one-argument standalone boundary", () => {
  expect(() => calculateScheduleC(business(2026, false))).toThrow(/Schedule C.*Form 6198/i);
});

it("uses the retained 2026 business at that boundary when the result is a profit", () => {
  expect(calculateScheduleC(business(2026, false, "7000", "1000")).netProfit.toFixed()).toBe("6000");
});

it.each([[2025, false], [2026, true], [2026, undefined]] as const)(
  "preserves the existing standalone default for year %s and at-risk answer %s",
  (year, atRisk) => expect(calculateScheduleC(business(year, atRisk)).netProfit.toFixed()).toBe("0"),
);

it("holds the loss before it reaches federal AGI", () => {
  expect(() => calculateFederalTax(business(2026, false))).toThrow(/Schedule C.*Form 6198/i);
});

it("holds a cent loss beyond the default Decimal working precision", () => {
  const input = business(2026, false, "100000000000000000000.00", "100000000000000000000.01");
  expect(() => calculateScheduleC(input, input.scheduleC)).toThrow(/Schedule C.*Form 6198/i);
});

function summaryDepreciation(grossReceipts: string) {
  return TaxYearInputSchema.parse({
    ...business(2026, false, grossReceipts, "0"),
    form4562: { taxYear: 2026, otherDepreciation: "100000000000000000000", macrsPre2025AssetsDepreciation: "0.01" },
  });
}

it("holds a cent loss transferred from Form 4562 line 22", () => {
  const input = summaryDepreciation("100000000000000000000");
  expect(() => calculateScheduleC(input)).toThrow(/Schedule C.*Form 6198/i);
});

it("admits true zero after the exact Form 4562 line 22 transfer", () => {
  const result = calculateScheduleC(summaryDepreciation("100000000000000000000.01"));
  expect(result.form4562?.line22.toFixed()).toBe("100000000000000000000.01");
  expect(result.depreciationAndSection179Deduction.toFixed()).toBe("100000000000000000000.01");
  expect(result.netProfit.toFixed()).toBe("0");
});

it("holds a dollar loss from two separately rounded MACRS asset deductions", () => {
  const asset = { placedInServiceDate: "2026-03-01", recoveryPeriod: "5", method: "200DB" } as const;
  const input = TaxYearInputSchema.parse({
    ...business(2026, false, "200000000000000000000", "0"),
    form4562: { taxYear: 2026, assets: [{ ...asset, costBasis: "1000000000000000000000" }, { ...asset, costBasis: "5" }] },
  });
  expect(() => calculateScheduleC(input)).toThrow(/Schedule C.*Form 6198/i);
});

it("preserves a cent profit after adding each actual expense once", () => {
  const input = business(2026, false, "100000000000000000000.02", "100000000000000000000.00");
  const scheduleC = { ...input.scheduleC, expenses: { ...input.scheduleC?.expenses, advertising: "0.01" } };
  const result = calculateScheduleC(input, scheduleC);
  expect(result.totalExpenses.toFixed()).toBe("100000000000000000000.01");
  expect(result.netProfit.toFixed()).toBe("0.01");
});

function actualPartV(year: 2025 | 2026, allInvestmentAtRisk: boolean, receipts: string) {
  const input = scheduleCSourceFixture(year);
  return TaxYearInputSchema.parse({
    ...input,
    scheduleC: {
      ...input.scheduleC, grossReceipts: receipts, allInvestmentAtRisk,
      expenses: { businessInterest: "0", otherExpenses: "0", bankCharges: "100000000000000000000", telephone: "0.01" },
      sourceFacts: {
        ...input.scheduleC?.sourceFacts, interest: undefined,
        ordinaryExpenses: {
          ...ordinaryExpenseSources, remainingOtherExpenses: "0",
          rows: [
            { category: "bankCharges", amount: "100000000000000000000", sourceReference: "Actual bank record", sourceFactsConfirmed: true },
            { category: "telephone", amount: "0.01", sourceReference: "Actual phone record", sourceFactsConfirmed: true },
          ],
        },
      },
    },
  });
}

it("holds a cent loss from separately confirmed Part V source rows", () => {
  expect(() => calculateScheduleC(actualPartV(2026, false, "100000000000000000000"))).toThrow(/Schedule C.*Form 6198/i);
});

it("uses exact Part V once when the rare high-significance amounts break even", () => {
  const result = calculateScheduleC(actualPartV(2026, false, "100000000000000000000.01"));
  expect(result.expenseBreakdown["Other expenses"].toFixed()).toBe("100000000000000000000.01");
  expect(result.netProfit.toFixed()).toBe("0");
});

it.each([[2025, false], [2026, true]] as const)("preserves Part V arithmetic outside the guard in %s with at-risk answer %s", (year, atRisk) => {
  const input = actualPartV(year, atRisk, "100000000000000000000");
  expect(calculateScheduleC(input, input.scheduleC).netProfit.toFixed()).toBe("0");
});

it("rejects a cent mismatch in the actual interest split before treating the business as break-even", () => {
  const input = scheduleCSourceFixture(2026);
  const scheduleC = input.scheduleC!;
  const interest = scheduleC.sourceFacts!.interest!;
  scheduleC.allInvestmentAtRisk = false;
  scheduleC.grossReceipts = "100000000000000000000";
  scheduleC.expenses = { ...scheduleC.expenses, businessInterest: "100000000000000000000", otherExpenses: "0" };
  Object.assign(interest, {
    mortgageInterest: "100000000000000000000", vehicleLoanInterest: "0.01", otherInterest: "0",
    otherExpensesExcludingInterest: "0", reclassification: undefined,
  });
  expect(() => calculateScheduleC(input)).toThrow(/interest split does not reconcile exactly/i);
});

it.each([
  [2026, false, "1000", "1000", "0"],
  [2026, false, "7000", "1000", "6000"],
  [2026, true, "1000", "7000", "-6000"],
  [2026, undefined, "1000", "7000", "-6000"],
  [2025, false, "1000", "7000", "-6000"],
] as const)("preserves Schedule C for year %s and at-risk answer %s on receipts %s and supplies %s", (year, atRisk, receipts, supplies, net) => {
  const input = business(year, atRisk, receipts, supplies);
  expect(calculateScheduleC(input, input.scheduleC).netProfit.toFixed()).toBe(net);
});

it("preserves federal AGI for the same 2026 loss with all investment at risk", () => {
  expect(calculateFederalTax(business(2026, true)).agi.toFixed()).toBe("79000");
});
