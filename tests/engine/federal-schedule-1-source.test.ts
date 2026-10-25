// Spec: spec/federal/schedule-1-return.yaml
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateSchedule1 } from "@/engine/schedules/schedule-1.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

import { completeInput, schedule1SourceInput } from "../fixtures/schedule1-source.js";

function amount(result: ReturnType<typeof calculateFederalTax>, form: string, line: string) {
  const matches = result.allLines.filter(entry => entry.form === form && entry.line === line);
  expect(matches).toHaveLength(1);
  return matches[0].value.toString();
}
describe("Canonical Schedule1 return sources", () => {
  it("excludes capital gains from Schedule1 and includes housing in line25", () => {
    const result = calculateSchedule1(simpleW2Fixture, {
      capitalGainLoss: d("5000"), schedCNetProfit: d("1000"), form2555HousingDeduction: d("2000"),
    });
    expect(result.capitalGainLoss.toString()).toBe("5000");
    expect(result.totalAdditionalIncome.toString()).toBe("1000");
    expect(result.otherAdjustmentsTotal.toString()).toBe("2000");
    expect(result.totalAdjustments.toString()).toBe("2000");
    expect(result.lines.find(entry => entry.form === "Sched 1" && entry.line === "9")?.value.toString()).toBe("0");
  });
  it("preserves the housing deduction addback while completing line25", () => {
    const input = completeInput({ w2s: [{ ...simpleW2Fixture.w2s[0], wages: "95000" }],
      adjustments: { studentLoanInterest: "2500" } });
    const result = calculateSchedule1(input, { form2555HousingDeduction: d("5000") });
    // Pub970 MAGI adds housing back:95000, so2500 * (1 -10000/15000)=833.33→833.
    expect(result.otherAdjustmentsTotal.toString()).toBe("5000");
    expect(result.studentLoanInterest.toString()).toBe("833");
    expect(result.totalAdjustments.toString()).toBe("5833");
  });
  it("reconciles business farm rental and other sources to one1040line8", () => {
    const result = calculateFederalTax(schedule1SourceInput());
    expect(amount(result, "Sched 1", "3")).toBe("10000");
    expect(amount(result, "Sched 1", "5")).toBe("3000");
    expect(amount(result, "Sched 1", "6")).toBe("2000");
    expect(amount(result, "Sched 1", "8v")).toBe("100");
    expect(amount(result, "Sched 1", "8z")).toBe("600");
    expect(result.allLines.some(entry => entry.form === "Sched 1" && entry.line === "8q")).toBe(false);
    expect(amount(result, "Sched 1", "9")).toBe("700");
    expect(amount(result, "Sched 1", "10")).toBe("15700");
    expect(amount(result, "1040", "8")).toBe("15700");
    expect(result.otherIncome.toString()).toBe("15700");
    expect(result.schedule1?.totalAdditionalIncome.toString()).toBe("15700");
    expect(result.capitalGainLoss.toString()).toBe("5000");
    expect(result.totalIncome.toString()).toBe("105700");
    expect(amount(result, "Sched 1", "24k")).toBe("700");
    expect(amount(result, "Sched 1", "25")).toBe("700");
    expect(amount(result, "Sched 1", "26")).toBe(result.adjustmentsToIncome.toString());
    expect(result.schedule1?.totalAdjustments.eq(result.adjustmentsToIncome)).toBe(true);
    expect(result.totalIncome.minus(result.adjustmentsToIncome).eq(result.agi)).toBe(true);
  });
  it("retains suspended rental losses consistently in income and AGI", () => {
    const result = calculateFederalTax(completeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "150000", federalWithheld: "50000" }],
      rentalProperties: [{ description: "Synthetic rental", propertyType: "single_family", rentalDays: 365, personalUseDays: 0, rents: "10000", repairs: "20000", isActiveParticipant: true }],
    }));
    expect(result.agi.toString()).toBe("150000");
    expect(result.totalIncome.toString()).toBe("150000");
    expect(amount(result, "Sched 1", "5")).toBe("0");
    expect(amount(result, "1040", "8")).toBe("0");
    expect(amount(result, "1040", "9")).toBe("150000");
    expect(amount(result, "1040", "11")).toBe("150000");
  });
  it("retains one final NOL line in both Schedule1 and1040", () => {
    const result = calculateFederalTax(completeInput({
      form1099Misc: [{ payer: "Synthetic source", otherIncome: "1000" }],
      priorYear: { nolCarryforward: "5000" },
    }));
    expect(amount(result, "Sched 1", "8a")).toBe("-5000");
    expect(amount(result, "Sched 1", "9")).toBe("-4000");
    expect(amount(result, "Sched 1", "10")).toBe("-4000");
    expect(amount(result, "1040", "8")).toBe("-4000");
    expect(amount(result, "1040", "9")).toBe("81000");
    expect(amount(result, "1040", "11")).toBe("81000");
    expect(result.schedule1?.nolDeduction.toString()).toBe("5000");
    expect(result.totalIncome.toString()).toBe("81000");
  });
});
