/** Spec: spec/federal/form-8889-source.yaml */
import { describe, expect, it } from "vitest";
import { calculateForm8889 } from "@/engine/forms/form-8889.js";
import { calculateForm1099SA, mergeForm1099SAIntoForm8889Input } from "@/engine/forms/form-1099-sa.js";
import { Form8889Schema } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const taxpayer = { ...simpleW2Fixture.taxpayer, taxYear: 2026 };
const constants = FEDERAL_2026_CONSTANTS;
const partialYear = { accountOwner: "primary", coverageByMonth: [...Array(6).fill("none"), ...Array(6).fill("self_only")], contributionsMade: "4000" };

describe("actual HSA source elections", () => {
  it("honors the actual monthly-method choice and preserves it through distribution merging", () => {
    const input = Form8889Schema.parse({ ...partialYear, useLastMonthRule: false });
    const merged = mergeForm1099SAIntoForm8889Input(input, calculateForm1099SA([]), taxpayer)!;
    const result = calculateForm8889(taxpayer, merged, constants);
    expect(result.line3.toString()).toBe("2200");
    expect(result.line13.toString()).toBe("2200");
    const annual = calculateForm8889(taxpayer, Form8889Schema.parse({ ...partialYear, useLastMonthRule: true }), constants);
    expect(annual.line3.toString()).toBe("4400");
    expect(annual.line13.toString()).toBe("4000");
  });

  it("requires an actual 2026 last-month-rule choice when it changes the limit", () => {
    expect(() => calculateForm8889(taxpayer, Form8889Schema.parse(partialYear), constants)).toThrow(/last.month.rule.*choice/i);
    const fullYear = Form8889Schema.parse({ ...partialYear, coverageByMonth: Array(12).fill("self_only") });
    expect(calculateForm8889(taxpayer, fullYear, constants).line13.toString()).toBe("4000");
    const noDecember = Form8889Schema.parse({ ...partialYear, coverageByMonth: [...Array(6).fill("self_only"), ...Array(6).fill("none")] });
    expect(calculateForm8889(taxpayer, noDecember, constants).line3.toString()).toBe("2200");
    expect(calculateForm8889(simpleW2Fixture.taxpayer, Form8889Schema.parse(partialYear), getConstants(2025)).line3.toString()).toBe("4300");
  });

  it("does not suppress known 2026 testing-period recapture when the redetermined limit is missing", () => {
    const unknown = Form8889Schema.parse({ lastMonthRuleContributions: "8550" });
    expect(() => calculateForm8889(taxpayer, unknown, constants)).toThrow(/redetermined/i);
    // Publication969 Example1: December2025 family coverage,8550-712.50.
    const actual = Form8889Schema.parse({ lastMonthRuleContributions: "8550", lastMonthRuleRedeterminedLimit: "712.50" });
    const result = calculateForm8889(taxpayer, actual, constants);
    expect(result.line18.toString()).toBe("7837.5");
    expect(result.line21.toString()).toBe("783.75");
    const excused = Form8889Schema.parse({ lastMonthRuleContributions: "8550", testingPeriodFailureDueToDeathOrDisability: true });
    expect(calculateForm8889(taxpayer, excused, constants).line18.toString()).toBe("0");
  });

  it("taxes both recapture sources using the printed line 20 base", () => {
    for (const year of [2025, 2026]) {
      const input = Form8889Schema.parse({ lastMonthRuleContributions: "3000.10", lastMonthRuleRedeterminedLimit: "300.10", recaptureQualifiedFundingDistribution: "1500.10" });
      const result = calculateForm8889({ ...taxpayer, taxYear: year }, input, (year === 2026 ? constants : getConstants(year)));
      expect(result.line18.toString()).toBe("2700");
      expect(result.line20.toString()).toBe("4200.1");
      expect(result.line21.toString()).toBe("420.01");
      const fundingOnly = calculateForm8889({ ...taxpayer, taxYear: year }, Form8889Schema.parse({ recaptureQualifiedFundingDistribution: "1500.10" }), (year === 2026 ? constants : getConstants(year)));
      expect(fundingOnly.line21.toString()).toBe("150.01");
      const excused = calculateForm8889({ ...taxpayer, taxYear: year }, Form8889Schema.parse({ ...input, testingPeriodFailureDueToDeathOrDisability: true }), (year === 2026 ? constants : getConstants(year)));
      expect(excused.line21.toString()).toBe("0");
    }
  });
});
