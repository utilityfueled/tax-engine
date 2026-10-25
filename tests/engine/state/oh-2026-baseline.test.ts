// Spec: spec/state/oh-2026-baseline.yaml.
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateOhio2026Baseline, type Ohio2026BaselineInput } from "@/engine/state/oh-2026-baseline.js";
import { OHIO_2026_BASELINE } from "@/models/ohio-2026-baseline.js";
import { OHIO_TAX_CONSTANTS } from "@/models/constants.js";
import { calculateOhioIT1040, OH_IT_1040_CONSTANTS } from "@/engine/state/oh-it-1040.js";

const facts = (changes: Partial<Ohio2026BaselineInput> = {}): Ohio2026BaselineInput => ({
  taxYear: 2026, filingStatus: "single", ohioAdjustedGrossIncome: "60000",
  businessIncomeDeduction: "0", taxableBusinessIncome: "0", eligibleExemptions: 1,
  precedingCredits: "0", primaryQualifyingIncome: "60000",
  ...changes,
});

describe("Ohio enacted 2026 baseline candidate", () => {
  it("retains independent immutable provenance and closed historical registries", () => {
    expect(OHIO_2026_BASELINE.metadata).toMatchObject({ taxYear: 2026, ruleVersion: "oh-2026.1-baseline-draft", calculationStatus: "incomplete", reviewStatus: "independent-review-pending", filingQualified: false });
    expect(OHIO_2026_BASELINE.metadata.sources.length).toBe(5);
    for (const source of OHIO_2026_BASELINE.metadata.sources) {
      expect(source.retrievedAt).toBe("2026-10-25");
      expect(source.section).not.toBe(""); expect(source.revision).not.toBe("");
    }
    expect(Object.isFrozen(OHIO_2026_BASELINE)).toBe(true);
    expect(Object.isFrozen(OHIO_2026_BASELINE.exemptionTiers[0].amount)).toBe(true);
    expect(() => { OHIO_2026_BASELINE.exemptionTiers[0].amount = new Decimal(1); }).toThrow();
    expect(OHIO_TAX_CONSTANTS[2026]).toBeUndefined();
    expect(OH_IT_1040_CONSTANTS[2026]).toBeUndefined();
    expect(() => calculateOhioIT1040({ taxYear: 2026, filingStatus: "single", federalAgi: "60000", exemptions: 1 })).toThrow(/not available/);
    expect(OHIO_TAX_CONSTANTS[2025].it1040.nonbusinessBrackets[1].baseTax.toFixed()).toBe("342");
    expect(OHIO_TAX_CONSTANTS[2025].it1040.exemptionMagiLimit?.toFixed()).toBe("750000");
  });

  it("uses actual MAGI at every indexed exemption boundary", () => {
    for (const [income, amount] of [["40000", "2400"], ["40000.01", "2150"], ["80000", "2150"], ["80000.01", "1900"], ["499999.99", "1900"], ["500000", "0"], ["500000.01", "0"]]) {
      const result = calculateOhio2026Baseline(facts({ ohioAdjustedGrossIncome: income, eligibleExemptions: 2 }));
      expect(result.exemptionPerPerson.toFixed(), income).toBe(amount);
    }
    const business = calculateOhio2026Baseline(facts({ ohioAdjustedGrossIncome: "250000", businessIncomeDeduction: "250000" }));
    expect(business.modifiedAdjustedGrossIncome.toFixed()).toBe("500000");
    expect(business.exemptions.toFixed()).toBe("0");
    const dependent = calculateOhio2026Baseline(facts({ eligibleExemptions: 0 }));
    expect(dependent.exemptions.toFixed()).toBe("0");
  });

  it("applies the enacted nonbusiness base and separate business rate", () => {
    for (const [income, expected] of [["-100", "0"], ["0", "0"], ["26050", "0"], ["26050.01", "332"], ["100000", "2366"], ["100001", "2366"], ["200000", "5116"]]) {
      const result = calculateOhio2026Baseline(facts({ ohioAdjustedGrossIncome: income, eligibleExemptions: 0 }));
      expect(result.nonbusinessTax.toFixed(), income).toBe(expected);
    }
    // 60000 -2150 =57850; (57850-26050)*.0275+332 =1206.50.
    const ordinary = calculateOhio2026Baseline(facts());
    expect(ordinary.taxableNonbusinessIncome.toFixed()).toBe("57850");
    expect(ordinary.nonbusinessTax.toFixed()).toBe("1207");
    // Post-deduction OhioAGI100000: 20000 taxable business at3%,80000 at2.75%+332.
    const business = calculateOhio2026Baseline(facts({ ohioAdjustedGrossIncome: "100000", taxableBusinessIncome: "20000", eligibleExemptions: 0 }));
    expect(business.nonbusinessTax.toFixed()).toBe("1816");
    expect(business.businessTax.toFixed()).toBe("600");
    expect(business.totalTax.toFixed()).toBe("2416");
    expect(business.lines.find(line => line.line === "8b")?.value.toFixed()).toBe("600");
    expect(business.filingQualified).toBe(false);
  });

  it("retains the completed eligible count for a jointly filing dependent", () => {
    // Actual refund-only joint return: primary is claimable, spouse is not.
    // RC5747.025(B) removes only the primary's exemption; completed count is1.
    const joint = facts({ filingStatus: "married_filing_jointly", ohioAdjustedGrossIncome: "1600",
      primaryQualifyingIncome: "800", spouseQualifyingIncome: "800",
      eligibleExemptions: 1 });
    expect(calculateOhio2026Baseline(joint).exemptions.toFixed()).toBe("2400");
    expect(calculateOhio2026Baseline({ ...joint, eligibleExemptions: 0 }).exemptions.toFixed()).toBe("0");
    expect(() => calculateOhio2026Baseline({ ...joint, eligibleExemptions: undefined } as unknown as Ohio2026BaselineInput)).toThrow(/exemption/);
  });

  it("applies unused exemptions to actual business income once", () => {
    for (const [agi, business, base, tax] of [
      ["5000", "5000", "3100", "93"], ["1000", "1000", "0", "0"],
      ["6000", "5000", "4100", "123"], ["6900", "5000", "5000", "150"],
      ["6900.01", "5000", "5000", "150"],
    ]) {
      const result = calculateOhio2026Baseline(facts({ ohioAdjustedGrossIncome: agi, businessIncomeDeduction: "250000", taxableBusinessIncome: business }));
      expect(result.businessTax.toFixed(), agi).toBe(tax);
      expect(result.lines.find(line => line.line === "6")?.value.toFixed(), agi).toBe(base);
    }
  });

  it("keeps actual joint eligibility distinct from percentage tiers", () => {
    const joint = facts({ filingStatus: "married_filing_jointly", spouseQualifyingIncome: "500", ohioAdjustedGrossIncome: "50000.01", precedingCredits: "200" });
    // MAGI50000.01 less2150 =47850.01. Tax932 less200;15% of732=109.80 ->110.
    const result = calculateOhio2026Baseline(joint);
    expect(result.jointCreditRate.toFixed()).toBe("0.15");
    expect(result.jointFilingCredit.toFixed()).toBe("110");
    expect(result.taxAfterJointCredit.toFixed()).toBe("622");
    for (const [income, expected] of [["499999.99", "650"], ["500000", "0"], ["500000.01", "0"]]) {
      expect(calculateOhio2026Baseline({ ...joint, ohioAdjustedGrossIncome: income, eligibleExemptions: 2, precedingCredits: "0" }).jointFilingCredit.toFixed()).toBe(expected);
    }
    expect(calculateOhio2026Baseline({ ...joint, spouseQualifyingIncome: "499.99" }).jointFilingCredit.toFixed()).toBe("0");
    expect(calculateOhio2026Baseline({ ...joint, primaryQualifyingIncome: "-1" }).jointFilingCredit.toFixed()).toBe("0");
    expect(calculateOhio2026Baseline({ ...joint, precedingCredits: "100000" }).jointFilingCredit.toFixed()).toBe("0");
    expect(calculateOhio2026Baseline(facts()).jointFilingCredit.toFixed()).toBe("0");
    expect(() => calculateOhio2026Baseline({ ...joint, spouseQualifyingIncome: undefined })).toThrow(/spouse/);
    for (const [income, rate] of [["25000", "0.2"], ["25000.01", "0.15"], ["50000", "0.15"],
      ["50000.01", "0.1"], ["75000", "0.1"], ["75000.01", "0.05"]]) {
      expect(calculateOhio2026Baseline({ ...joint, ohioAdjustedGrossIncome: income,
        eligibleExemptions: 0, precedingCredits: "0" }).jointCreditRate.toFixed(), income).toBe(rate);
    }
  });

  it("preserves cents and rejects missing invalid or wrong-year source amounts", () => {
    const large = calculateOhio2026Baseline(facts({ ohioAdjustedGrossIncome: "9007199254740993.25", eligibleExemptions: 0 }));
    expect(large.modifiedAdjustedGrossIncome.toFixed()).toBe("9007199254740993.25");
    expect(large.nonbusinessTax.toFixed()).toBe("247697979504993");
    for (const change of [
      { taxYear: 2025 }, { taxYear: 2027 }, { filingStatus: "invalid" },
      { eligibleExemptions: -1 }, { eligibleExemptions: 1.5 }, { eligibleExemptions: Number.MAX_SAFE_INTEGER + 1 },
      { eligibleExemptions: undefined }, { ohioAdjustedGrossIncome: undefined },
      { ohioAdjustedGrossIncome: "NaN" }, { ohioAdjustedGrossIncome: "Infinity" },
      { ohioAdjustedGrossIncome: 60000 }, { businessIncomeDeduction: "-1" },
      { taxableBusinessIncome: "-1" }, { precedingCredits: "-1" }, { primaryQualifyingIncome: undefined },
    ]) expect(() => calculateOhio2026Baseline({ ...facts(), ...change } as Ohio2026BaselineInput)).toThrow();
    expect(calculateOhio2026Baseline(facts({ ohioAdjustedGrossIncome: new Decimal("60000.01") })).modifiedAdjustedGrossIncome.toFixed()).toBe("60000.01");
  });
});
