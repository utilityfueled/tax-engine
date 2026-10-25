import { describe, expect, it } from "vitest";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import { d } from "@/utils/decimal.js";
import { charityReportingFixture } from "../../fixtures/charity-reporting.js";
import { charitableSourceDigest } from "@/utils/charitable-source-digest.js";
import { CryptoIncomeInputSchema } from "@/models/inputs.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";

describe("ScheduleA actual charity reporting", () => {
  // Spec: schedule-a-charity-reporting.yaml exact-percentage-capacity.
  it("preserves exact percentage capacities and carry before reported line rounding", () => {
    for (const [kind, expectedAllowed, expectedCarry] of [
      ["cash", "600.294", "9400.696"],
      ["ordinary", "500.245", "9500.745"],
      ["publicCapital", "300.147", "9700.843"],
      ["privateCapital", "200.098", "9800.892"],
    ] as const) {
      const input = charityReportingFixture();
      input.priorYear.charitableCarryforward = "0";
      input.priorYear.charitableCarryforwardByYear = [];
      input.donations = [{ ...input.donations[kind === "cash" ? 0 : 1],
        amount: "10000.99", isLongTermCapitalGain: kind.endsWith("Capital"),
        isPrivateFoundation: kind === "privateCapital",
      }];
      const result = calculateScheduleA(input, d("1000.49"), "single", getConstants(2025));
      expect(result.cashCharitable.plus(result.nonCashCharitable).toString()).toBe(expectedAllowed);
      expect(result.charitableCarryforward.toString()).toBe(expectedCarry);
      expect(result.charitableTotal.toString()).toBe(d(expectedAllowed).toDecimalPlaces(0).toString());
      expect(result.cashCharitable.plus(result.nonCashCharitable).plus(result.charitableCarryforward).toString()).toBe("10000.99");
    }
  });
  // Spec: schedule-a-charity-reporting.yaml exact-category-result.
  it("retains current category worksheet cents separately from reported charity lines", () => {
    const input = charityReportingFixture();
    input.taxpayer.taxYear = 2026;
    input.priorYear.charitableCarryforward = "0";
    input.priorYear.charitableCarryforwardByYear = [];
    input.donations = input.donations.map((row, index) => ({ ...row,
      dateOfDonation: "2026-05-01", amount: index === 0 ? "100.49" : "200.49",
      supportingOrganization: false, donorAdvisedFund: false,
    }));
    const result = calculateScheduleA(input, d("10000"), "single", FEDERAL_2026_CONSTANTS);
    expect(result.cashCharitable.toString()).toBe("100.49");
    expect(result.nonCashCharitable.toString()).toBe("150.49");
    expect(result.charitableCurrentCash.toString()).toBe("100");
    expect(result.charitableCurrentNoncash.toString()).toBe("150");
    expect(result.charitableTotal.toString()).toBe("250");
  });
  // Spec: schedule-a-charity-reporting.yaml source-omission.
  it("preserves omitted legacy crypto donations without inventing confirmed sources", () => {
    const input = charityReportingFixture();
    const cryptoIncome = CryptoIncomeInputSchema.parse({});
    Reflect.deleteProperty(cryptoIncome, "donations");
    const legacy = { ...input, cryptoIncome };
    expect(() => calculateFederalTax(legacy)).not.toThrow();
    expect(legacy.cryptoIncome).not.toHaveProperty("donations");
    expect(charitableSourceDigest(legacy)).not.toBe(charitableSourceDigest({ ...legacy, cryptoIncome: { ...cryptoIncome, donations: [] } }));
  });
  // Spec: schedule-a-charity-reporting.yaml11–14.
  it("reports current and prior charity groups separately after exact computation", () => {
    const input = charityReportingFixture();
    const result = calculateScheduleA(input, d("100000"), "single", getConstants(2025));
    expect(result.cashCharitable.toString()).toBe("21234.98");
    expect(result.nonCashCharitable.toString()).toBe("10000.51");
    for (const [line, expected] of Object.entries({ "11": "20000", "12": "10001", "13": "1234", "14": "31235" })) {
      const audits = result.lines.filter(row => row.form === "Sched A" && row.line === line);
      expect(audits).toHaveLength(1);
      expect(audits[0].value.toString()).toBe(expected);
    }
    expect(result.charitableCurrentCash.toString()).toBe("20000");
    expect(result.charitableCurrentNoncash.toString()).toBe("10001");
    expect(result.charitablePriorYearUsed.toString()).toBe("1234");
    expect(result.charitableTotal.toString()).toBe("31235");
    expect(result.totalItemized.toString()).toBe("31235");
  });
  // Spec: schedule-a-charity-reporting.yaml rounding.
  it("rounds each completed charity line without changing original source cents", () => {
    const input = charityReportingFixture(); input.priorYear.charitableCarryforward = "0"; input.priorYear.charitableCarryforwardByYear = [];
    input.donations[0].amount = "100.49"; input.donations[1].amount = "200.49";
    const original = structuredClone(input);
    const result = calculateFederalTax(input);
    expect(result.scheduleA.cashCharitable.toString()).toBe("100.49");
    expect(result.scheduleA.nonCashCharitable.toString()).toBe("200.49");
    expect(result.scheduleA.charitableTotal.toString()).toBe("300");
    expect(result.scheduleA.totalItemized.toString()).toBe("300");
    expect(input).toEqual(original);
    input.donations = [0, 1].map(() => ({ ...input.donations[0], amount: "0.49" }));
    const grouped = calculateScheduleA(input, d("100000"), "single", getConstants(2025));
    expect(grouped.cashCharitable.toString()).toBe("0.98");
    expect(grouped.charitableCurrentCash.toString()).toBe("1");
  });
});
