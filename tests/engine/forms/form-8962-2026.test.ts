/** Spec: spec/federal/form-8962.yaml; actual source contract: 2026/ptc-source-facts.yaml. */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8962, type Form8962Input, type Form8962Facts } from "@/engine/forms/form-8962.js";

type Facts = Form8962Facts;
function fixture(options: { year?: number; income?: string; months?: number; facts?: Partial<Facts>; premium?: string; slcsp?: string; aptc?: string } = {}): Form8962Input & { facts: Facts } {
  const taxYear = options.year ?? 2026;
  const rows = Array.from({ length: options.months ?? 12 }, (_, index) => ({
    month: index + 1, enrolleePremium: options.premium ?? "600", slcsp: options.slcsp ?? "600",
    advancePremiumTaxCredit: options.aptc ?? "400", coverageEligible: true, incomeBasedSepEnrollment: false,
  }));
  return {
    taxYear, filingStatus: "single", taxFamilySize: 1, modifiedAGI: new Decimal(options.income ?? "31300"),
    facts: {
      taxFamilySize: 1, fplRegion: "contiguous", taxpayerModifiedAGI: options.income ?? "31300",
      requiredFilingDependentsModifiedAGI: "0", householdFactsConfirmed: true,
      canBeClaimedAsDependent: false, belowPovertyException: "none", coverageFactsConfirmed: true,
      allocationRequired: false, alternativeMarriageCalculationElected: false,
      selfEmployedHealthInsuranceCoordinationRequired: false, qsehraAffected: false,
      lawfulPresenceReconciliationRequired: false, monthlyReconciliation: rows, ...options.facts,
    },
    form1095A: [{ taxYear, sourceFactsComplete: true, marketplace: "Federal Marketplace", policyNumber: "SOURCE-1", monthlyPremiums: rows.map(row => ({ ...row })) }],
  };
}
function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("Fixture must contain its declared first row");
  return item;
}
const value = (result: ReturnType<typeof calculateForm8962>, line: string) => result.lines.find(entry => entry.line === line)?.value.toString();

describe("Form 8962 2026 source-backed reconciliation", () => {
  it("uses actual household income and regional prior-year poverty guidelines", () => {
    const regional = [ ["contiguous", "21150"], ["alaska", "26430"], ["hawaii", "24320"] ] as const;
    for (const [fplRegion, poverty] of regional) {
      const result = calculateForm8962(fixture({ facts: { taxFamilySize: 2, fplRegion, taxpayerModifiedAGI: "40000", requiredFilingDependentsModifiedAGI: "5000" } }));
      expect(result.familySize).toBe(2);
      expect(result.modifiedAGI.toString()).toBe("45000");
      expect(value(result, "2a")).toBe("40000");
      expect(value(result, "2b")).toBe("5000");
      expect(value(result, "4")).toBe(poverty);
      expect(result.sourceFactsVerified).toBe(true);
    }
    for (const [fplRegion, poverty] of [["contiguous", "20440"], ["alaska", "25540"], ["hawaii", "23500"]] as const) {
      expect(value(calculateForm8962(fixture({ year: 2025, facts: { taxFamilySize: 2, fplRegion } })), "4")).toBe(poverty);
    }
  });

  it("combines signed taxpayer and required-filing dependent MAGI before flooring household income", () => {
    const result = calculateForm8962(fixture({ facts: { taxpayerModifiedAGI: "-1000", requiredFilingDependentsModifiedAGI: "32300" } }));
    expect(value(result, "3")).toBe("31300");
    expect(value(result, "2a")).toBe("-1000");
    expect(value(calculateForm8962(fixture({ facts: { taxpayerModifiedAGI: "-3000", requiredFilingDependentsModifiedAGI: "1000" } })), "3")).toBe("0");
  });

  it("drops the percentage fraction and rounds the applicable figure to four decimals", () => {
    const result = calculateForm8962(fixture({ year: 2025, income: "30000" }));
    expect(result.fplPercentage.greaterThan(199)).toBe(true);
    expect(result.fplPercentageForTable.toString()).toBe("199");
    expect(result.contributionRate.toString()).toBe("0.0196");
    expect(value(result, "5")).toBe("199");
    expect(value(result, "7")).toBe("0.0196");
    expect(value(result, "8a")).toBe("588");
    expect(value(result, "8b")).toBe("49");
    const at301 = calculateForm8962(fixture({ year: 2025, income: "45330.60" }));
    expect(at301.contributionRate.toString()).toBe("0.0603");
  });

  it.each([
    ["100", "0.021"], ["132", "0.021"], ["133", "0.0314"], ["149", "0.0413"],
    ["150", "0.0419"], ["199", "0.0655"], ["200", "0.066"], ["249", "0.084"],
    ["250", "0.0844"], ["299", "0.0993"], ["300", "0.0996"], ["400", "0.0996"],
  ])("uses Rev. Proc. 2025-25 at %s percent FPL", (percentage, rate) => {
    const income = new Decimal("15650").times(percentage).div(100).toString();
    expect(calculateForm8962(fixture({ income })).contributionRate.toString()).toBe(rate);
  });

  it("applies 2026 income limits and only actual eligibility exceptions", () => {
    expect(calculateForm8962(fixture({ income: "62600", slcsp: "1000", premium: "1000" })).ptcAllowed.toString()).toBe("5765");
    const above = calculateForm8962(fixture({ income: "62601", slcsp: "1000", premium: "1000" }));
    expect(above.ptcAllowed.toString()).toBe("0");
    expect(value(above, "5")).toBe("401");
    expect(above.excessAPTCRepayment.toString()).toBe("4800");
    expect(calculateForm8962(fixture({ income: "15000" })).ptcAllowed.toString()).toBe("0");
    expect(calculateForm8962(fixture({ year: 2025, income: "14000", facts: { belowPovertyException: "lawfully_present_ineligible_medicaid" } })).ptcAllowed.toString()).toBe("7200");
    expect(calculateForm8962(fixture({ income: "14000", facts: { belowPovertyException: "lawfully_present_ineligible_medicaid" } })).ptcAllowed.toString()).toBe("0");
    const exception = fixture({ income: "14000", facts: { belowPovertyException: "marketplace_estimate", marketplaceEstimatedIncomeWithinEligibilityRange: true, marketplaceInformationAccurate: true } });
    expect(calculateForm8962(exception).ptcAllowed.toString()).toBe("6906");
    expect(calculateForm8962({ ...exception, facts: { ...exception.facts, marketplaceInformationAccurate: false } }).ptcAllowed.toString()).toBe("0");
    const noAdvances = fixture({ income: "14000", aptc: "0", facts: { belowPovertyException: "marketplace_estimate", marketplaceEstimatedIncomeWithinEligibilityRange: true, marketplaceInformationAccurate: true } });
    expect(calculateForm8962(noAdvances).ptcAllowed.toString()).toBe("0");
    const mfs = { ...fixture(), filingStatus: "married_filing_separately" as const };
    expect(() => calculateForm8962(mfs)).toThrow(/separate.*exception/i);
    expect(calculateForm8962({ ...mfs, facts: { ...mfs.facts, marriedFilingSeparatelyExceptionConfirmed: false } }).ptcAllowed.toString()).toBe("0");
    expect(calculateForm8962({ ...mfs, facts: { ...mfs.facts, marriedFilingSeparatelyExceptionConfirmed: true } }).ptcAllowed.toString()).toBe("5134");
    expect(calculateForm8962(fixture({ facts: { canBeClaimedAsDependent: true } })).ptcAllowed.toString()).toBe("0");
  });

  it("uses one rounded monthly contribution for multiple policies", () => {
    const input = fixture({ months: 6 });
    input.form1095A = [
      { ...first(input.form1095A), monthlyPremiums: first(input.form1095A).monthlyPremiums.map(row => ({ ...row, enrolleePremium: "300", advancePremiumTaxCredit: "200" })) },
      { ...first(input.form1095A), policyNumber: "SOURCE-2", monthlyPremiums: first(input.form1095A).monthlyPremiums.map(row => ({ ...row, enrolleePremium: "300", advancePremiumTaxCredit: "200" })) },
    ];
    const result = calculateForm8962(input);
    expect(result.calculationMethod).toBe("monthly");
    expect(value(result, "8b")).toBe("172");
    expect(value(result, "12b")).toBe("600"); // Same household benchmark appears on both source forms.
    expect(value(result, "12c")).toBe("172");
    expect(value(result, "12e")).toBe("428");
    expect(value(result, "12f")).toBe("400");
    expect(result.annualSLCSP.toString()).toBe("3600");
    expect(result.ptcAllowed.toString()).toBe("2568");
    expect(result.netPTC.toString()).toBe("168");
    expect(value(result, "11a")).toBeUndefined();
  });

  it("selects the annual method only for unchanged full-year source policies", () => {
    const annual = calculateForm8962(fixture());
    expect(annual.calculationMethod).toBe("annual");
    expect(annual.ptcAllowed.toString()).toBe("5134");
    expect(value(annual, "11c")).toBe("2066");
    expect(value(annual, "11f")).toBe("4800");
    expect(value(annual, "12a")).toBeUndefined();
    const variable = fixture();
    first(first(variable.form1095A).monthlyPremiums).enrolleePremium = "601";
    first(variable.facts.monthlyReconciliation).enrolleePremium = "601";
    const monthly = calculateForm8962(variable);
    expect(monthly.calculationMethod).toBe("monthly");
    expect(monthly.ptcAllowed.toString()).toBe("5136");
    const replacements = fixture();
    replacements.form1095A = [
      { ...first(replacements.form1095A), monthlyPremiums: first(replacements.form1095A).monthlyPremiums.slice(0, 6) },
      { ...first(replacements.form1095A), policyNumber: "REPLACEMENT", monthlyPremiums: first(replacements.form1095A).monthlyPremiums.slice(6) },
    ];
    expect(calculateForm8962(replacements).calculationMethod).toBe("monthly");
  });

  it("repays all excess 2026 advances without the historical income-based caps", () => {
    const current = calculateForm8962(fixture({ income: "18000", slcsp: "200", aptc: "500" }));
    expect(current.ptcAllowed.toString()).toBe("2022");
    expect(current.excessAPTCRepayment.toString()).toBe("3978");
    expect(current.repaymentCap).toBeNull();
    expect(value(current, "28")).toBeUndefined();
    const historical = calculateForm8962(fixture({ year: 2025, income: "18000", slcsp: "200", aptc: "500" }));
    expect(historical.excessAPTCRepayment.toString()).toBe("375");
    expect(historical.repaymentCap?.toString()).toBe("375");
  });

  it("records distinct excess, repayment limit and repayment lines", () => {
    const result = calculateForm8962(fixture({ year: 2025, income: "18000", slcsp: "200", aptc: "500" }));
    expect(value(result, "27")).toBe("3600");
    expect(value(result, "28")).toBe("375");
    expect(value(result, "29")).toBe("375");
    expect(result.lines.find(line => line.line === "29")?.formula).toContain("Schedule 2 line 1a");
    expect(calculateForm8962(fixture()).lines.find(line => line.line === "26")?.formula).toContain("Schedule 3 line 9");
  });

  it("preserves ineligible coverage and disallows income-only special enrollment from 2026", () => {
    for (const reason of ["coverageEligible", "incomeBasedSepEnrollment"] as const) {
      const input = fixture({ months: 1 });
      first(input.facts.monthlyReconciliation)[reason] = reason === "incomeBasedSepEnrollment";
      expect(calculateForm8962(input).ptcAllowed.toString()).toBe("0");
      expect(calculateForm8962(input).excessAPTCRepayment.toString()).toBe("400");
    }
    const prior = fixture({ year: 2025, months: 1 });
    first(prior.facts.monthlyReconciliation).incomeBasedSepEnrollment = true;
    expect(calculateForm8962(prior).ptcAllowed.greaterThan(0)).toBe(true);
  });

  it("reconciles actual QSEHRA benefits using the selected calculation method", () => {
    const annual = fixture({ facts: { qsehraAffected: true } });
    annual.facts.monthlyReconciliation = annual.facts.monthlyReconciliation.map(row => ({ ...row, qsehraAffordable: false, qsehraMonthlyPermittedBenefit: "100" }));
    expect(calculateForm8962(annual).ptcAllowed.toString()).toBe("3934");
    first(annual.facts.monthlyReconciliation).qsehraAffordable = true;
    // Worksheet Q: annual tentative credit 5134 / 12; first month removed,
    // then eleven actual $100 monthly benefits; annual result rounds once.
    expect(calculateForm8962(annual).ptcAllowed.toString()).toBe("3606");
    const halfYear = fixture({ slcsp: "600.10", facts: { qsehraAffected: true } });
    halfYear.facts.monthlyReconciliation = halfYear.facts.monthlyReconciliation.map(row => ({ ...row, qsehraAffordable: row.month <= 6, qsehraMonthlyPermittedBenefit: "0" }));
    // Annual tentative $5135 / 2 = $2567.50, rounds up exactly.
    expect(calculateForm8962(halfYear).ptcAllowed.toString()).toBe("2568");
    const monthly = fixture({ months: 1, facts: { qsehraAffected: true } });
    first(monthly.facts.monthlyReconciliation).qsehraAffordable = false;
    first(monthly.facts.monthlyReconciliation).qsehraMonthlyPermittedBenefit = "100";
    expect(calculateForm8962(monthly).ptcAllowed.toString()).toBe("328");
    first(monthly.facts.monthlyReconciliation).qsehraMonthlyPermittedBenefit = "1000";
    expect(calculateForm8962(monthly).ptcAllowed.toString()).toBe("0");
    delete first(monthly.facts.monthlyReconciliation).qsehraAffordable;
    expect(() => calculateForm8962(monthly)).toThrow(/QSEHRA/);
  });

  it("rejects unresolved special worksheets and missing source facts", () => {
    expect(() => calculateForm8962({ ...fixture(), facts: undefined })).toThrow(/2026.*facts/i);
    for (const flag of ["allocationRequired", "alternativeMarriageCalculationElected", "selfEmployedHealthInsuranceCoordinationRequired", "lawfulPresenceReconciliationRequired"] as const) {
      expect(() => calculateForm8962(fixture({ facts: { [flag]: true } }))).toThrow(/worksheet/i);
    }
    for (const flag of ["householdFactsConfirmed", "coverageFactsConfirmed"] as const) {
      expect(() => calculateForm8962(fixture({ facts: { [flag]: false } }))).toThrow(/confirmed/i);
    }
    for (const key of ["taxFamilySize", "fplRegion", "taxpayerModifiedAGI", "requiredFilingDependentsModifiedAGI", "monthlyReconciliation", "canBeClaimedAsDependent", "qsehraAffected", "belowPovertyException"] as const) {
      const unknown = fixture();
      expect(() => calculateForm8962({ ...unknown, facts: { ...unknown.facts, [key]: undefined } })).toThrow(/Form 8962/);
    }
    expect(() => calculateForm8962(fixture({ income: "14000", facts: { belowPovertyException: "marketplace_estimate" } }))).toThrow(/estimate/);
    const missing = fixture();
    first(missing.form1095A).sourceFactsComplete = false;
    expect(() => calculateForm8962(missing)).toThrow(/original|source/i);
    expect(() => calculateForm8962({ ...fixture(), taxYear: 2027 })).toThrow(/year/i);
  });

  it("rejects inconsistent duplicate or incomplete source reconciliation", () => {
    const duplicate = fixture();
    duplicate.form1095A.push(first(duplicate.form1095A));
    expect(() => calculateForm8962(duplicate)).toThrow(/duplicate/i);
    const duplicateMonth = fixture();
    first(duplicateMonth.form1095A).monthlyPremiums.push(first(first(duplicateMonth.form1095A).monthlyPremiums));
    expect(() => calculateForm8962(duplicateMonth)).toThrow(/duplicate/i);
    const wrongYear = fixture(); first(wrongYear.form1095A).taxYear = 2025;
    expect(() => calculateForm8962(wrongYear)).toThrow(/year/i);
    const incorrectAdvance = fixture(); first(incorrectAdvance.facts.monthlyReconciliation).advancePremiumTaxCredit = "401";
    expect(() => calculateForm8962(incorrectAdvance)).toThrow(/advance|APTC/i);
    const missing = fixture(); missing.facts.monthlyReconciliation.pop();
    expect(() => calculateForm8962(missing)).toThrow(/month/i);
    const negative = fixture(); first(negative.facts.monthlyReconciliation).slcsp = "-1";
    expect(() => calculateForm8962(negative)).toThrow(/nonnegative/i);
    const nan = fixture({ income: "NaN" });
    expect(() => calculateForm8962(nan)).toThrow(/finite/i);
    const overPremium = fixture(); first(overPremium.facts.monthlyReconciliation).enrolleePremium = "601";
    expect(() => calculateForm8962(overPremium)).toThrow(/premium/i);
  });
});
