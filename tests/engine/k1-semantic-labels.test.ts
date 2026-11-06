import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePartnerBasisSchedule } from "@/engine/forms/partner-basis-schedule.js";
import { ScheduleK1Schema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

// Specs: schedule-k-1.yaml semantic-charity-investment-labels;
// partner-basis-schedule.yaml semantic-deduction-labels.
function sources() {
  return (["partnership", "s_corporation"] as const).map((entityType, index) =>
    ScheduleK1Schema.parse({
      entityType,
      partnershipName: `Synthetic entity ${index + 1}`,
      partnershipEIN: index === 0 ? "12-3456789" : "98-7654321",
      ordinaryIncome: "0",
      beginningBasis: "10000",
      charitableCash: "100.11",
      charitableCapitalGain30: "200.22",
      charitableCapitalGain20: "300.33",
      investmentInterestExpense: "400.44",
      investmentIncome: "1000",
    }),
  );
}

describe("K1 semantic deduction labels", () => {
  it("retains semantic K1 amounts without asserting invented mixed-entity source codes", () => {
    const input = { ...structuredClone(simpleW2Fixture), scheduleK1: sources() };
    const original = structuredClone(input);
    const result = calculateFederalTax(input);
    const charity = result.allLines.find(row => row.form === "K-1" && row.line === "13");
    const investment = result.allLines.find(row => row.form === "K-1" && row.line === "inv");
    expect(charity?.description).toBe("K-1 semantic charitable amounts routed to Schedule A");
    expect(charity?.formula).toBe("Cash (60%) + capital gain property (30%) + capital gain property (20%)");
    expect(charity?.value).toEqual(new Decimal("1201.32"));
    expect(charity?.inputs).toEqual({
      "Cash (60% AGI limit)": new Decimal("200.22"),
      "Capital gain property (30% AGI limit)": new Decimal("400.44"),
      "Capital gain property (20% AGI limit)": new Decimal("600.66"),
    });
    expect(investment?.inputs["Investment interest expense (semantic amount → Line 1)"])
      .toEqual(new Decimal("800.88"));
    expect(investment?.inputs).not.toHaveProperty("Box 13 Code D (investment interest expense → Line 1)");
    expect(result.allLines.find(row => row.form === "Sched A" && row.line === "11")?.value)
      .toEqual(new Decimal(200));
    expect(result.allLines.find(row => row.form === "Sched A" && row.line === "12")?.value)
      .toEqual(new Decimal(1001));
    expect(input).toEqual(original);
  });

  it("preserves basis category amounts for partnership and S corporation semantic inputs", () => {
    for (const source of sources()) {
      const original = structuredClone(source);
      const result = calculatePartnerBasisSchedule(source);
      const charity = result.lossCategories.find(row => row.key === "charitable");
      const interest = result.lossCategories.find(row => row.key === "investmentInterest");
      expect(charity?.description).toBe("Charitable contributions (semantic cash and capital-gain categories)");
      expect(interest?.description).toBe("Investment interest expense (semantic amount)");
      expect(charity?.total).toEqual(new Decimal("600.66"));
      expect(interest?.total).toEqual(new Decimal("400.44"));
      // The investment-income information is not another basis income item.
      expect(result.endingBasis).toEqual(new Decimal("8998.90"));
      expect(source).toEqual(original);
    }
  });
});
