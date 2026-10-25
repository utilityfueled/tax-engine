/** Spec: spec/federal/form-8801.yaml. Hand-derived official Form8801 lines. */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8801, type Form8801Input } from "@/engine/forms/form-8801.js";

const d = (value: string | number) => new Decimal(value);
function fixture(overrides: Partial<Form8801Input> = {}): Form8801Input {
  return {
    taxYear: 2026, priorYear: 2025, sourceFactsConfirmed: true,
    priorYearFilingStatus: "single", priorYearTaxableIncome: d(200000),
    priorYearForm6251Line1And2e: d(200000), priorYearExclusionItemAdjustments: d(10000),
    priorYearMinimumTaxCreditNOLDeduction: d(0), priorYearMinimumTaxForeignTaxCredit: d(0),
    priorYearForm6251Line10: d(35000), priorYearRegularTax: d(35000), priorYearAMT: d(500),
    unusedMinimumTaxCreditCarryforward: d(0), priorYearUnallowedQualifiedElectricVehicleCredit: d(0),
    priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
    currentYearRegularTaxBeforeCredits: d(40000), currentYearRegularTaxAfterCredits: d(40000), currentYearTMT: d(35000),
    ...overrides,
  };
}
function line(result: ReturnType<typeof calculateForm8801>, number: string): string | undefined {
  return result.lines.find(entry => entry.form === "Form 8801" && entry.line === number)?.value.toString();
}

describe("Form8801 actual source years and worksheets", () => {
  it("uses actual prior return lines and the 2025 tables for a 2026 credit", () => {
    const result = calculateForm8801(fixture({ priorYearTaxableIncome: undefined, priorYearRegularTax: undefined }));
    expect(result.taxYear).toBe(2026);
    expect(result.priorYear).toBe(2025);
    expect(result.sourceFactsVerified).toBe(true);
    expect(line(result, "1")).toBe("200000");
    expect(line(result, "2")).toBe("10000");
    expect(line(result, "3")).toBe("0");
    expect(line(result, "4")).toBe("210000");
    expect(line(result, "5")).toBe("88100");
    expect(line(result, "6")).toBe("626350");
    expect(result.exclusionOnlyTMT.toString()).toBe("31694");
    expect(result.creditAllowed.toString()).toBe("500");
    const historical = calculateForm8801(fixture({ taxYear: 2025, priorYear: 2024 }));
    expect(historical.exemption.toString()).toBe("85700");
    expect(historical.exclusionOnlyTMT.toString()).toBe("32318");
    for (const [status, exemption, threshold] of [["married_filing_jointly", "137000", "1252700"], ["qualifying_surviving_spouse", "137000", "1252700"], ["head_of_household", "88100", "626350"], ["married_filing_separately", "68500", "626350"]] as const) {
      const actual = calculateForm8801(fixture({ priorYearFilingStatus: status }));
      expect(actual.exemption.toString()).toBe(exemption);
      expect(line(actual, "6")).toBe(threshold);
    }
  });

  it("phases out the exemption and uses the prior-year AMT breakpoints", () => {
    const reduced = calculateForm8801(fixture({ priorYearForm6251Line1And2e: d(690000) }));
    expect(reduced.exemption.toString()).toBe("69687");
    expect(reduced.exclusionOnlyTMT.toString()).toBe("171706");
    for (const [status, amount, tax] of [["single", "327200", "62166"], ["single", "327202", "62167"], ["married_filing_separately", "188050", "31083"], ["married_filing_separately", "188052", "31084"]] as const) {
      expect(calculateForm8801(fixture({ priorYearFilingStatus: status, priorYearForm6251Line1And2e: d(amount), priorYearExclusionItemAdjustments: d(0) })).exclusionOnlyTMT.toString()).toBe(tax);
    }
  });

  it("applies the MFS additional amount at its prior-year boundaries", () => {
    for (const [income, amti] of [["900350", "900350"], ["900352", "900353"], ["920350", "925350"], ["1174350", "1242850"], ["1200000", "1268500"]] as const) {
      const result = calculateForm8801(fixture({ priorYearFilingStatus: "married_filing_separately", priorYearForm6251Line1And2e: d(income), priorYearExclusionItemAdjustments: d(0) }));
      expect(result.exclusionOnlyAMTI.toString()).toBe(amti);
    }
    const irsExample = calculateForm8801(fixture({ taxYear: 2025, priorYear: 2024, priorYearFilingStatus: "married_filing_separately", priorYearForm6251Line1And2e: d(895950), priorYearExclusionItemAdjustments: d(0) }));
    expect(irsExample.exclusionOnlyAMTI.toString()).toBe("900950");
  });

  it("subtracts actual MTCNOLD and applies the nonresident real-property floor", () => {
    const nol = calculateForm8801(fixture({ priorYearMinimumTaxCreditNOLDeduction: d(30000) }));
    expect(nol.exclusionOnlyAMTI.toString()).toBe("180000");
    expect(nol.exclusionOnlyTMT.toString()).toBe("23894");
    expect(calculateForm8801(fixture({ priorYearForm6251Line1And2e: d(-10000), priorYearExclusionItemAdjustments: d(-1000) })).exclusionOnlyAMTI.toString()).toBe("0");
    const nr = calculateForm8801(fixture({ priorYearForm6251Line1And2e: d(70000), priorYearExclusionItemAdjustments: d(0), priorYearFiledForm1040NR: true, priorYearNetUSRealPropertyGain: d(50000) }));
    expect(nr.amtBaseOnExclusions.toString()).toBe("50000");
    expect(nr.exclusionOnlyTMT.toString()).toBe("13000");
  });

  it("subtracts actual MTFTCE before the prior Form6251 comparison tax", () => {
    const result = calculateForm8801(fixture({ priorYearMinimumTaxForeignTaxCredit: d(1000), priorYearForm6251Line10: d(20000), priorYearAMT: d(12000) }));
    expect(line(result, "11")).toBe("31694");
    expect(line(result, "12")).toBe("1000");
    expect(line(result, "13")).toBe("30694");
    expect(line(result, "14")).toBe("20000");
    expect(line(result, "15")).toBe("10694");
    expect(result.creditAllowed.toString()).toBe("1306");
    expect(() => calculateForm8801(fixture({ priorYearMinimumTaxForeignTaxCredit: d(31695) }))).toThrow(/foreign.*credit.*exceed/i);
  });

  it("retains a negative line18 to reduce existing carryforward", () => {
    const result = calculateForm8801(fixture({ priorYearForm6251Line10: d(20000), unusedMinimumTaxCreditCarryforward: d(12000) }));
    expect(line(result, "16")).toBe("500");
    expect(line(result, "17")).toBe("11694");
    expect(line(result, "18")).toBe("-11194");
    expect(result.minTaxCreditFromPriorYear.toString()).toBe("-11194");
    expect(line(result, "19")).toBe("12000");
    expect(line(result, "21")).toBe("806");
    expect(result.creditAllowed.toString()).toBe("806");
    expect(result.carryforwardToNextYear.toString()).toBe("0");
    const exhausted = calculateForm8801(fixture({ priorYearForm6251Line10: d(20000), unusedMinimumTaxCreditCarryforward: d(10000) }));
    expect(line(exhausted, "21")).toBe("-1194");
    expect(exhausted.totalAvailableCredit.toString()).toBe("0");
    expect(exhausted.creditAllowed.toString()).toBe("0");
    expect(exhausted.carryforwardToNextYear.toString()).toBe("0");
  });

  it("combines the actual legacy electric vehicle credit and after-credit limit", () => {
    const result = calculateForm8801(fixture({ priorYearUnallowedQualifiedElectricVehicleCredit: d(75), currentYearRegularTaxAfterCredits: d(35200) }));
    expect(line(result, "20")).toBe("75");
    expect(line(result, "21")).toBe("575");
    expect(line(result, "22")).toBe("35200");
    expect(line(result, "23")).toBe("35000");
    expect(result.creditAllowed.toString()).toBe("200");
    expect(result.carryforwardToNextYear.toString()).toBe("375");
    expect(result.lines.find(entry => entry.line === "25")?.formula).toContain("Schedule 3 line 6b");
  });

  it("follows every PartIII line using actual regular-tax worksheet sources", () => {
    const result = calculateForm8801(fixture({
      priorYearForm6251Line1And2e: d(850000), priorYearExclusionItemAdjustments: d(0), priorYearCapitalGainsRequired: true,
      priorYearCapitalGainsWorksheet: { method: "schedule_d", preferentialIncome: d(600000), section1250Gain: d(15000), scheduleDTaxWorksheetLine10: d(615000), ordinaryIncomeForZeroRate: d(250000), ordinaryIncomeForFifteenRate: d(235000) },
    }));
    const expected: Record<string, string> = {
      "27": "817813", "28": "600000", "29": "15000", "30": "615000", "31": "615000", "32": "202813", "33": "52731", "34": "48350", "35": "250000", "36": "0", "37": "600000", "38": "0", "39": "600000", "40": "533400", "41": "0", "42": "235000", "43": "235000", "44": "298400", "45": "298400", "46": "44760", "47": "298400", "48": "301600", "49": "60320", "50": "802813", "51": "15000", "52": "3750", "53": "161561", "54": "224206", "55": "161561",
    };
    for (const [number, value] of Object.entries(expected)) expect(line(result, number), `line${number}`).toBe(value);
    expect(result.exclusionOnlyTMT.toString()).toBe("161561");
    const qd = calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { method: "qualified_dividends", preferentialIncome: d(30000), ordinaryIncomeForZeroRate: d(180000), ordinaryIncomeForFifteenRate: d(180000) } }));
    expect(line(qd, "38")).toBe("0");
    expect(qd.exclusionOnlyTMT.toString()).toBe("28394");
  });

  it("keeps special capital gains out of the ordinary preferential brackets", () => {
    const result = calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { method: "schedule_d", preferentialIncome: d(0), section1250Gain: d(15000), scheduleDTaxWorksheetLine10: d(20000), ordinaryIncomeForZeroRate: d(180000), ordinaryIncomeForFifteenRate: d(180000) } }));
    // Collectibles remain in ordinary AMT base; only the actual1250 amount gets25%.
    expect(line(result, "32")).toBe("106900");
    expect(line(result, "52")).toBe("3750");
    expect(result.exclusionOnlyTMT.toString()).toBe("31544");
  });

  it("computes the foreign earned income worksheet from actual excluded income", () => {
    const result = calculateForm8801(fixture({ priorYearFiledForm2555: true, priorYearForeignEarnedIncome: { form2555Lines45And50: d(210000), disallowedDeductions: d(10000) } }));
    expect(result.exclusionOnlyTMT.toString()).toBe("33350");
    const zeroBase = calculateForm8801(fixture({ priorYearForm6251Line1And2e: d(0), priorYearExclusionItemAdjustments: d(0), priorYearFiledForm2555: true, priorYearForeignEarnedIncome: { form2555Lines45And50: d(100000), disallowedDeductions: d(200000) } }));
    expect(zeroBase.exclusionOnlyTMT.toString()).toBe("0");
    const adjusted = fixture({ priorYearFiledForm2555: true, priorYearCapitalGainsRequired: true, priorYearForeignEarnedIncome: { form2555Lines45And50: d(210000), disallowedDeductions: d(10000) }, priorYearCapitalGainsWorksheet: { method: "qualified_dividends", preferentialIncome: d(30000), ordinaryIncomeForZeroRate: d(400000), ordinaryIncomeForFifteenRate: d(400000) } });
    expect(() => calculateForm8801(adjusted)).toThrow(/capital.*adjust/i);
    const confirmed = calculateForm8801({ ...adjusted, priorYearForeignEarnedIncome: { form2555Lines45And50: d(210000), disallowedDeductions: d(10000), capitalGainAdjustmentsConfirmed: true } });
    expect(confirmed.exclusionOnlyTMT.toString()).toBe("29450");
  });

  it("applies zero-rate capacity from the actual regular worksheet across both prior years", () => {
    const worksheet = { method: "qualified_dividends" as const, preferentialIncome: d(30000), ordinaryIncomeForZeroRate: d(40000), ordinaryIncomeForFifteenRate: d(40000) };
    const current = calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: worksheet }));
    expect(line(current, "38")).toBe("8350");
    expect(line(current, "46")).toBe("3248");
    expect(current.exclusionOnlyTMT.toString()).toBe("27142");
    const historical = calculateForm8801(fixture({ taxYear: 2025, priorYear: 2024, priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: worksheet }));
    expect(line(historical, "38")).toBe("7025");
    expect(historical.exclusionOnlyTMT.toString()).toBe("27964");
    const allZeroRate = calculateForm8801(fixture({ priorYearForm6251Line1And2e: d(95000), priorYearExclusionItemAdjustments: d(0), priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { ...worksheet, ordinaryIncomeForZeroRate: d(0), ordinaryIncomeForFifteenRate: d(0) } }));
    expect(line(allZeroRate, "47")).toBe("6900");
    expect(allZeroRate.exclusionOnlyTMT.toString()).toBe("0");
  });

  it("uses the actual ScheduleD gain cap and preserves ordinary AMT for collectibles", () => {
    const result = calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { method: "schedule_d", preferentialIncome: d(20000), section1250Gain: d(30000), scheduleDTaxWorksheetLine10: d(40000), ordinaryIncomeForZeroRate: d(180000), ordinaryIncomeForFifteenRate: d(160000) } }));
    expect(line(result, "30")).toBe("40000");
    expect(line(result, "51")).toBe("20000");
    expect(line(result, "52")).toBe("5000");
    const collectibles = calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { method: "schedule_d", preferentialIncome: d(0), section1250Gain: d(0), scheduleDTaxWorksheetLine10: d(50000), ordinaryIncomeForZeroRate: d(200000), ordinaryIncomeForFifteenRate: d(197300) } }));
    expect(line(collectibles, "53")).toBe("31694");
    expect(collectibles.exclusionOnlyTMT.toString()).toBe("31694");
  });

  it("rejects invalid special-worksheet combinations and original defaulted facts", () => {
    expect(() => calculateForm8801(fixture({ sourceFactsComplete: false }))).toThrow(/complete original/i);
    expect(() => calculateForm8801(fixture({ priorYearNetUSRealPropertyGain: d(1) }))).toThrow(/applicability/i);
    expect(() => calculateForm8801(fixture({ priorYearForeignEarnedIncome: { form2555Lines45And50: d(0), disallowedDeductions: d(0) } }))).toThrow(/applicability/i);
    expect(() => calculateForm8801(fixture({ priorYearQualifiedDividends: d(10), priorYearNetLTCG: d("NaN") }))).toThrow(/finite/i);
    const worksheet = { method: "schedule_d" as const, preferentialIncome: d(100), section1250Gain: d(0), scheduleDTaxWorksheetLine10: d(100), ordinaryIncomeForZeroRate: d(200), ordinaryIncomeForFifteenRate: d(200) };
    expect(() => calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { ...worksheet, scheduleDTaxWorksheetLine10: d(99) } }))).toThrow(/gain cap/i);
    expect(() => calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { ...worksheet, ordinaryIncomeForFifteenRate: d(201) } }))).toThrow(/line21/i);
    expect(() => calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { ...worksheet, method: "qualified_dividends", section1250Gain: d(1), scheduleDTaxWorksheetLine10: undefined } }))).toThrow(/excludes Schedule D/i);
    expect(() => calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { ...worksheet, method: "qualified_dividends" } }))).toThrow(/excludes Schedule D/i);
  });

  it("rejects missing and contradictory actual source facts", () => {
    for (const key of ["priorYear", "sourceFactsConfirmed", "priorYearForm6251Line1And2e", "priorYearMinimumTaxCreditNOLDeduction", "priorYearMinimumTaxForeignTaxCredit", "priorYearForm6251Line10", "priorYearUnallowedQualifiedElectricVehicleCredit", "priorYearFiledForm2555", "priorYearFiledForm1040NR", "priorYearCapitalGainsRequired", "unusedMinimumTaxCreditCarryforward", "currentYearRegularTaxAfterCredits"] as const) {
      expect(() => calculateForm8801(fixture({ [key]: undefined })), key).toThrow(/Form 8801/i);
    }
    expect(() => calculateForm8801(fixture({ taxYear: 2027 }))).toThrow(/year/i);
    expect(() => calculateForm8801(fixture({ priorYear: 2024 }))).toThrow(/year/i);
    expect(() => calculateForm8801(fixture({ sourceFactsConfirmed: false }))).toThrow(/confirm/i);
    expect(() => calculateForm8801(fixture({ priorYearFiledForm1040NR: true }))).toThrow(/real.property/i);
    expect(() => calculateForm8801(fixture({ priorYearFiledForm2555: true }))).toThrow(/foreign.*income/i);
    expect(() => calculateForm8801(fixture({ priorYearCapitalGainsRequired: true }))).toThrow(/capital.*worksheet/i);
    expect(() => calculateForm8801(fixture({ priorYearQualifiedDividends: d(100) }))).toThrow(/capital/i);
    expect(() => calculateForm8801(fixture({ priorYearAMT: d(-1) }))).toThrow(/nonnegative/i);
    expect(() => calculateForm8801(fixture({ priorYearAMT: d("NaN") }))).toThrow(/finite/i);
    expect(() => calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { method: "schedule_d", preferentialIncome: d(100), ordinaryIncomeForZeroRate: d(0), ordinaryIncomeForFifteenRate: d(0) } }))).toThrow(/Schedule D/i);
    expect(() => calculateForm8801(fixture({ priorYearCapitalGainsRequired: true, priorYearCapitalGainsWorksheet: { method: "qualified_dividends", preferentialIncome: d(100), ordinaryIncomeForZeroRate: d(0), ordinaryIncomeForFifteenRate: d(10) } }))).toThrow(/same/i);
  });
});
