// Spec: spec/federal/schedule-se-farm-optional.yaml.
import { describe, expect, it } from "vitest";
import { calculateScheduleSEFarmOptional } from "@/engine/schedules/schedule-se-farm-optional.js";

type FarmInput = Parameters<typeof calculateScheduleSEFarmOptional>[0];

function confirmedFarm(grossIncome: string, netProfit: string): FarmInput {
  return {
    taxYear: 2026,
    accountHolder: "primary",
    electionRequested: true,
    scheduleF: {
      sourceTaxYear: 2026,
      accountHolder: "primary",
      sourceReference: "Synthetic 2026 Schedule F original",
      sourceAmountsCompleteConfirmed: true,
      fullCalendarYearConfirmed: true,
      domesticSoleProprietorConfirmed: true,
      agriculturalLaborConfirmed: true,
      accountingMethod: "cash",
      grossIncome,
      netProfit,
    },
    noCrpPaymentsConfirmed: true,
    noOtherSelfEmploymentConfirmed: true,
    noChurchEmployeeIncomeConfirmed: true,
    noSeTaxExemptionConfirmed: true,
  };
}

describe("2026 Schedule SE farm optional method estimator", () => {
  it("requires the election and actual same-owner 2026 Schedule F facts", () => {
    const input = confirmedFarm("1000", "0");
    expect(() => calculateScheduleSEFarmOptional({ ...input, electionRequested: false })).toThrow(/affirmative election/i);
    expect(() => calculateScheduleSEFarmOptional({ ...input, electionRequested: undefined } as unknown as FarmInput))
      .toThrow(/affirmative election/i);
    expect(() => calculateScheduleSEFarmOptional({ ...input, taxYear: 2025 })).toThrow(/2026/i);

    const invalidSourceFacts: Array<Partial<FarmInput["scheduleF"]>> = [
      { sourceTaxYear: 2025 },
      { accountHolder: "spouse" },
      { sourceReference: " " },
      { sourceAmountsCompleteConfirmed: false },
      { sourceAmountsCompleteConfirmed: undefined },
      { fullCalendarYearConfirmed: false },
      { domesticSoleProprietorConfirmed: false },
      { agriculturalLaborConfirmed: false },
      { accountingMethod: "accrual" },
    ];
    for (const sourceFacts of invalidSourceFacts) {
      expect(() => calculateScheduleSEFarmOptional({ ...input, scheduleF: { ...input.scheduleF, ...sourceFacts } }))
        .toThrow(/complete.*same-owner.*schedule f/i);
    }
    const spouseInput: FarmInput = {
      ...input, accountHolder: "spouse", scheduleF: { ...input.scheduleF, accountHolder: "spouse" },
    };
    expect(calculateScheduleSEFarmOptional(spouseInput).accountHolder).toBe("spouse");
  });

  it("requires confirmed absence of unsupported self-employment facts", () => {
    const input = confirmedFarm("1000", "0");
    const confirmations = [
      "noCrpPaymentsConfirmed", "noOtherSelfEmploymentConfirmed", "noChurchEmployeeIncomeConfirmed", "noSeTaxExemptionConfirmed",
    ] as const;
    for (const confirmation of confirmations) {
      expect(() => calculateScheduleSEFarmOptional({ ...input, [confirmation]: false })).toThrow(/requires confirmation/i);
      expect(() => calculateScheduleSEFarmOptional({ ...input, [confirmation]: undefined } as unknown as FarmInput))
        .toThrow(/requires confirmation/i);
    }
  });

  it("rejects unknown, nonmoney and inconsistent amounts instead of defaulting to zero", () => {
    const invalidAmounts = [undefined, null, 100, "", " ", "NaN", "Infinity", "1e2", "1.001", "100\n", "1,000"];
    for (const amount of invalidAmounts) {
      for (const line of ["grossIncome", "netProfit"] as const) {
        const input = confirmedFarm("1000", "0");
        const scheduleF = { ...input.scheduleF, [line]: amount } as FarmInput["scheduleF"];
        expect(() => calculateScheduleSEFarmOptional({ ...input, scheduleF })).toThrow(/actual.*dollars and cents/i);
      }
    }
    expect(() => calculateScheduleSEFarmOptional(confirmedFarm("1000", "1000.01"))).toThrow(/net profit.*gross/i);
  });

  it("checks the inclusive gross and exclusive net limits at exact cents", () => {
    expect(calculateScheduleSEFarmOptional(confirmedFarm("11340", "8186")).line15.toFixed()).toBe("7560");
    expect(calculateScheduleSEFarmOptional(confirmedFarm("11340.01", "8185.99")).line15.toFixed()).toBe("7560");
    expect(() => calculateScheduleSEFarmOptional(confirmedFarm("11340.01", "8186"))).toThrow(/ineligible/i);
    expect(() => calculateScheduleSEFarmOptional(confirmedFarm("11340.01", "8186.01"))).toThrow(/ineligible/i);
  });

  it("caps a high-gross farm made eligible by net profit", () => {
    const result = calculateScheduleSEFarmOptional(confirmedFarm("23000", "-450.20"));
    expect(result.line14Cap.toFixed()).toBe("7560");
    expect(result.line15.toFixed()).toBe("7560");
    expect(result.line4b.toFixed()).toBe("7560");
  });

  it("keeps nonterminating cents and floors a negative gross amount", () => {
    expect(calculateScheduleSEFarmOptional(confirmedFarm("11339.99", "8186")).line15.toFixed())
      .toBe("7559.9933333333333333");
    expect(calculateScheduleSEFarmOptional(confirmedFarm("0.03", "-500")).line15.toFixed()).toBe("0.02");
    expect(calculateScheduleSEFarmOptional(confirmedFarm("0", "0")).line15.toFixed()).toBe("0");
    expect(calculateScheduleSEFarmOptional(confirmedFarm("-8", "-8.09")).line15.toFixed()).toBe("0");
  });

  it("reconciles optional lines 15 and 4b to the 2026 IRS processing illustration", () => {
    // IRM Figure 3.11.3-100 shows 6,920 on lines 15 and 4b. Only the outputs
    // are supplied; 10,380 is the inferred gross and 4,000 is a fixture profit.
    const input = confirmedFarm("10380", "4000");
    const result = calculateScheduleSEFarmOptional(input);
    expect(result.lines.map(({ line, value }) => [line, value.toFixed()])).toEqual([["15", "6920"], ["4b", "6920"]]);
    expect(result.line15.toFixed()).toBe("6920");
    expect(result.line4b.toFixed()).toBe("6920");
    expect(JSON.stringify(result)).not.toContain(input.scheduleF.sourceReference);
  });

  it("replays the Publication 225 (2025) optional earnings example on the final 2026 rules", () => {
    const result = calculateScheduleSEFarmOptional(confirmedFarm("540", "460"));
    expect(result.line15.toFixed()).toBe("360");
    expect(result.line4b.toFixed()).toBe("360");
  });
});
