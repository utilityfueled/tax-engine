// Spec: spec/federal/indexed-2026.yaml
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { FEDERAL_2026_INDEXED } from "@/models/federal-2026-indexed.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { calculateTaxFromBrackets } from "@/utils/tax-math.js";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";

const d = (value: string) => new Decimal(value);
const rules = FEDERAL_2026_INDEXED;
describe("2026 indexed parameters", () => {
  it("records 2026 standard deductions without mutating 2025", () => {
    expect(Object.fromEntries(Object.entries(rules.standardDeduction).map(([key, value]) => [key, value.toString()])))
      .toEqual({ single: "16100", married_filing_jointly: "32200", married_filing_separately: "16100", head_of_household: "24150", qualifying_surviving_spouse: "32200" });
    expect(rules.dependentStandardDeduction.minimum.toString()).toBe("1350");
    expect(rules.dependentStandardDeduction.earnedIncomeAddition.toString()).toBe("450");
    expect(rules.additionalStandardDeduction.marriedOrSurvivingSpouse.toString()).toBe("1650");
    expect(rules.additionalStandardDeduction.unmarried.toString()).toBe("2050");
    expect(getConstants(2025).standardDeduction.single.toString()).toBe("15750");
  });

  // Literal expected totals transcribed from Rev. Proc. 2025-32 tables 1-4,
  // rounded to whole dollars; the final three rows exercise cents at a breakpoint.
  describe("matches independently transcribed IRS rate schedule totals", () => {
  it.each([
    ["single", "12400", "1240"], ["single", "50400", "5800"],
    ["single", "105700", "17966"], ["single", "201775", "41024"],
    ["single", "256225", "58448"], ["single", "640600", "192979"],
    ["married_filing_jointly", "24800", "2480"], ["married_filing_jointly", "100800", "11600"],
    ["married_filing_jointly", "211400", "35932"], ["married_filing_jointly", "403550", "82048"],
    ["married_filing_jointly", "512450", "116896"], ["married_filing_jointly", "768700", "206584"],
    ["married_filing_separately", "384350", "103292"],
    ["qualifying_surviving_spouse", "768700", "206584"],
    ["head_of_household", "17700", "1770"], ["head_of_household", "67450", "7740"],
    ["head_of_household", "105700", "16155"], ["head_of_household", "201750", "39207"],
    ["head_of_household", "256200", "56631"], ["head_of_household", "640600", "191171"],
    ["single", "-1", "0"], ["single", "0", "0"],
    ["single", "50402.27", "5800"], ["single", "50402.28", "5801"],
    ["single", "50399.99", "5800"],
  ] as [FilingStatus, string, string][])("matches independently transcribed IRS rate schedule totals (%s, %s)", (status, income, tax) => {
    expect(calculateTaxFromBrackets(d(income), rules.taxBrackets[status]).toString()).toBe(tax);
  });

  });

  it("records distinct capital gains and EIC table amounts", () => {
    for (const [status, zero, fifteen] of [
      ["single", "49450", "545500"], ["married_filing_jointly", "98900", "613700"],
      ["married_filing_separately", "49450", "306850"], ["head_of_household", "66200", "579600"],
      ["qualifying_surviving_spouse", "98900", "613700"],
    ] as const) {
      expect(rules.capitalGainsRates.zero.threshold[status].toString()).toBe(zero);
      expect(rules.capitalGainsRates.fifteen.threshold[status].toString()).toBe(fifteen);
    }
    const values = (amounts: Record<number, Decimal>) => Object.values(amounts).map(amount => amount.toString());
    expect(values(rules.eitc.maximumCredit)).toEqual(["664", "4427", "7316", "8231"]);
    expect(values(rules.eitc.completedPhaseOutSingleHoH)).toEqual(["19540", "51593", "58629", "62974"]);
    expect(values(rules.eitc.completedPhaseOutMFJ)).toEqual(["26820", "58863", "65899", "70244"]);
    expect(rules.eitc.investmentIncomeLimit.toString()).toBe("12200");
  });

  describe("applies 2026 AMT phase-out and rounding boundaries", () => {
  it.each([
    ["single", "499999", "90100"], ["single", "500000", "90100"],
    ["single", "500000.99", "90100"], ["single", "500001", "90099"],
    ["single", "680198", "1"], ["single", "680199", "0"], ["single", "680201", "0"],
    ["head_of_household", "600000", "40100"],
    ["married_filing_jointly", "1000000", "140200"], ["married_filing_jointly", "1200000", "40200"],
    ["married_filing_jointly", "1280400", "0"], ["qualifying_surviving_spouse", "1000002", "140199"],
    ["married_filing_separately", "500000", "70100"], ["married_filing_separately", "640200", "0"],
  ] as [FilingStatus, string, string][])("applies 2026 AMT phase-out and rounding boundaries (%s, %s)", (filingStatus, amti, exemption) => {
    const result = calculateForm6251({ taxableIncome: d(amti), saltDeduction: d("0"), regularTax: d("0"), filingStatus, isItemizing: true }, rules);
    expect(result.exemption.toString()).toBe(exemption);
    expect(result.lines.some(line => line.form === "Form 6251")).toBe(true);
  });

  });

  it("keeps the partial pack frozen and unavailable for full returns", () => {
    expect(rules.selfEmploymentTax.socialSecurityWageBase.toString()).toBe("184500");
    expect(rules.amt.rate26Limit.single.toString()).toBe("244500");
    expect(rules.amt.rate26Limit.married_filing_separately.toString()).toBe("122250");
    expect(Object.isFrozen(rules.taxBrackets.single[0])).toBe(true);
    expect(() => { rules.amt.exemption.single = d("1"); }).toThrow();
    expect(() => getConstants(2026)).toThrow(/incomplete/i);
  });
});
