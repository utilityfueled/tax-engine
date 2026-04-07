/**
 * Tests for New York IT-201 Credits (lines 40-46, 59, 65).
 * Spec: spec/state/ny-it201-credits.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT201Credits,
  computeHouseholdCredit,
  computeNYSalesUseTaxFromChart,
  computeNYEarnedIncomeCredit,
  type NYIT201CreditsInput,
} from "@/engine/state/ny-it201-credits.js";

const d = (value: string | number) => new Decimal(value);

function credits2025(overrides: Partial<NYIT201CreditsInput> = {}) {
  const baseInput: NYIT201CreditsInput = {
    nyAgi: 50000,
    nyStateTax: 3000,
    filingStatus: "single",
    numberOfDependents: 0,
    taxYear: 2025,
    ...overrides,
  };

  return calculateNYIT201Credits({
    ...baseInput,
    federalAgi: overrides.federalAgi ?? baseInput.nyAgi,
  });
}

describe("NY IT-201 Credits", () => {
  /* ========== Household Credit (Line 40) ========== */

  describe("Line 40 - Household credit", () => {
    it("Line 40 - household credit uses federal AGI table rows and filing-status-specific household size rules", () => {
      const result = credits2025({
        nyAgi: 50000,
        federalAgi: 10000,
        nyStateTax: 200,
      });
      expect(result.householdCredit.toString()).toBe("45");
    });

    it("Line 40 - single filer federal AGI $15,001 gets $25 household credit", () => {
      const result = credits2025({ nyAgi: 15001, federalAgi: 15001, nyStateTax: 200 });
      expect(result.householdCredit.toString()).toBe("25");
    });

    it("Line 40 - married filing separately uses table 3 instead of the single table", () => {
      const result = credits2025({
        filingStatus: "married_filing_separately",
        nyAgi: 12000,
        federalAgi: 12000,
        nyStateTax: 200,
        numberOfDependents: 0,
      });
      expect(result.householdCredit.toString()).toBe("38");
    });

    it("Line 40 - MFJ filer uses table 2 household-size columns, not a flat dependent add-on", () => {
      const result = credits2025({
        filingStatus: "married_filing_jointly",
        nyAgi: 12000,
        federalAgi: 12000,
        nyStateTax: 200,
        numberOfDependents: 2,
      });
      expect(result.householdCredit.toString()).toBe("105");
    });

    it("Line 40 - head of household counts taxpayer plus dependents only for table 2", () => {
      const result = credits2025({
        filingStatus: "head_of_household",
        nyAgi: 21000,
        federalAgi: 21000,
        nyStateTax: 200,
        numberOfDependents: 2,
      });
      expect(result.householdCredit.toString()).toBe("80");
    });

    it("Line 40 - qualifying surviving spouse uses table 2 with no spouse count unless filing jointly", () => {
      const result = credits2025({
        filingStatus: "qualifying_surviving_spouse",
        nyAgi: 26000,
        federalAgi: 26000,
        nyStateTax: 200,
        numberOfDependents: 0,
      });
      expect(result.householdCredit.toString()).toBe("40");
    });

    it("Line 40 - household sizes above 7 use the column-7 increment rule", () => {
      const result = credits2025({
        filingStatus: "married_filing_jointly",
        nyAgi: 5000,
        federalAgi: 5000,
        nyStateTax: 500,
        numberOfDependents: 7,
      });
      expect(result.householdCredit.toString()).toBe("210");
    });

    it("Line 40 - federal AGI above the table ceiling yields no household credit", () => {
      const result = credits2025({
        filingStatus: "married_filing_jointly",
        nyAgi: 40000,
        federalAgi: 40000,
        nyStateTax: 3000,
        numberOfDependents: 2,
      });
      expect(result.householdCredit.toString()).toBe("0");
    });

    it("Line 40 - household credit cannot exceed tax on line 39", () => {
      const result = credits2025({
        nyAgi: 5000,
        federalAgi: 5000,
        nyStateTax: 30,
      });
      expect(result.householdCredit.toString()).toBe("30");
    });

    it("Line 40 - zero tax means zero household credit", () => {
      const result = credits2025({
        nyAgi: 5000,
        federalAgi: 5000,
        nyStateTax: 0,
      });
      expect(result.householdCredit.toString()).toBe("0");
    });

    it("Line 40 - negative federal AGI still falls in the lowest single table row", () => {
      const result = credits2025({
        nyAgi: -1000,
        federalAgi: -1000,
        nyStateTax: 200,
      });
      expect(result.householdCredit.toString()).toBe("75");
    });
  });

  /* ========== Passthrough credits (Lines 41-42) ========== */

  describe("Lines 41-42 - Passthrough credits", () => {
    it("Line 41 - resident credit passes through", () => {
      const result = credits2025({ residentCredit: 500 });
      expect(result.residentCredit.toString()).toBe("500");
    });

    it("Line 42 - other credits pass through", () => {
      const result = credits2025({ otherNYStateCredits: 300 });
      expect(result.otherNYStateCredits.toString()).toBe("300");
    });

    it("Lines 41-42 - default to zero when not provided", () => {
      const result = credits2025();
      expect(result.residentCredit.toString()).toBe("0");
      expect(result.otherNYStateCredits.toString()).toBe("0");
    });
  });

  /* ========== Total credits and net tax (Lines 43-44) ========== */

  describe("Lines 43-44 - Total credits and net tax", () => {
    it("Line 43 - total credits is sum of lines 40-42", () => {
      const result = credits2025({
        nyAgi: 10000,
        nyStateTax: 1000,
        residentCredit: 100,
        otherNYStateCredits: 50,
      });
      // Household credit = $45 for single AGI $10K
      expect(result.totalNYStateCredits.toString()).toBe("195"); // 45 + 100 + 50
    });

    it("Line 44 - net tax is zero when credits exceed tax", () => {
      const result = credits2025({
        nyAgi: 5000,
        nyStateTax: 50,
        residentCredit: 100,
      });
      // Household credit limited to $50 (tax), resident credit = $100
      // Total credits = $50 + $100 = $150, but non-refundable credits can't exceed tax
      // Actually: household credit = min(75, 50) = 50
      // Total credits = 50 + 100 = 150
      // Net tax = max(0, 50 - 150) = 0
      expect(result.netNYStateTax.toString()).toBe("0");
    });

    it("Line 44 - net tax = tax minus credits when credits are less", () => {
      const result = credits2025({
        nyAgi: 10000,
        nyStateTax: 1000,
      });
      // Household credit = $45
      // Net tax = 1000 - 45 = 955
      expect(result.netNYStateTax.toString()).toBe("955");
    });
  });

  /* ========== Other taxes, line 46 subtotal, and line 59 sales/use tax ========== */

  describe("Lines 45-46 and 59 - Other taxes, state subtotal, and sales/use tax", () => {
    it("Line 45 - other state taxes pass through", () => {
      const result = credits2025({ otherStateTaxes: 200 });
      expect(result.otherStateTaxes.toString()).toBe("200");
    });

    it("Line 59 - sales/use tax passes through", () => {
      const result = credits2025({ salesUseTax: 25 });
      expect(result.salesUseTax.toString()).toBe("25");
    });

    it("Line 59 - chart lookup uses federal AGI brackets and month proration", () => {
      const result = credits2025({
        salesUseTaxChart: {
          federalAgi: 90000,
          monthsOfPermanentPlaceOfAbode: 6,
        },
      });

      // Full-year chart amount is $18, prorated for 6 months -> $9
      expect(result.salesUseTax.toString()).toBe("9");
    });

    it("Line 59 - chart lookup requires federal AGI from either the return input or the chart override", () => {
      expect(() =>
        calculateNYIT201Credits({
          nyAgi: 50000,
          nyStateTax: 3000,
          filingStatus: "single",
          numberOfDependents: 0,
          taxYear: 2025,
          salesUseTaxChart: {},
        })
      ).toThrow("NY IT-201 line 59 sales/use tax chart requires federal AGI");
    });

    it("Line 59 - exact amount overrides chart lookup when both are provided", () => {
      const result = credits2025({
        salesUseTax: 41,
        salesUseTaxChart: {
          federalAgi: 90000,
        },
      });

      expect(result.salesUseTax.toString()).toBe("41");
    });

    it("Line 59 - chart high-income amount uses 0.0175% of federal AGI capped at $125", () => {
      expect(
        computeNYSalesUseTaxFromChart({
          federalAgi: 300000,
        }).toString()
      ).toBe("53");

      expect(
        computeNYSalesUseTaxFromChart({
          federalAgi: 900000,
        }).toString()
      ).toBe("125");
    });

    it("Line 46 - total New York State taxes includes net tax plus other taxes", () => {
      const result = credits2025({
        nyAgi: 50000,
        nyStateTax: 3000,
        otherStateTaxes: 100,
        salesUseTax: 25,
      });
      // Household credit = $0 (AGI > $28,000)
      // Net tax = 3000 - 0 = 3000
      // Line 46 total = 3000 + 100 = 3100; line 59 sales/use tax is separate
      expect(result.totalNYStateTaxes.toString()).toBe("3100");
      expect(result.salesUseTax.toString()).toBe("25");
    });
  });

  /* ========== Empire State Child Credit (Line 63) ========== */

  describe("Line 63 - Empire State child credit", () => {
    it("Line 63 - Empire State child credit passes through from IT-213", () => {
      const result = credits2025({ empireStateChildCredit: 660 });
      expect(result.empireStateChildCredit.toString()).toBe("660");
    });

    it("Line 63 - defaults to zero when not provided", () => {
      const result = credits2025();
      expect(result.empireStateChildCredit.toString()).toBe("0");
    });

    it("Line 63 - ESCC with multiple children", () => {
      const result = credits2025({ empireStateChildCredit: 1320 });
      expect(result.empireStateChildCredit.toString()).toBe("1320");
    });
  });

  /* ========== NY Earned Income Credit (Line 65) ========== */

  describe("Line 65 - NY Earned Income Credit", () => {
    it("Line 65 - household credit reduces the allowable NY EIC", () => {
      const result = credits2025({
        nyAgi: 10000,
        federalAgi: 10000,
        nyStateTax: 1000,
        federalEic: 3584,
      });
      // Base NY EIC = round(3584 × 0.30) = $1,075
      // Household credit at federal AGI $10,000 single = $45
      // Allowable NY EIC = $1,075 - $45 = $1,030
      expect(result.nyEarnedIncomeCredit.toString()).toBe("1030");
    });

    it("Line 65 - Worksheet B caps the household-credit subtraction after resident and accumulation credits", () => {
      const result = credits2025({
        nyAgi: 25000,
        federalAgi: 25000,
        nyStateTax: 20,
        residentCredit: 12,
        accumulationDistributionCredit: 6,
        federalEic: 3000,
      });

      // Tentative NYS EIC = round(3000 × 0.30) = $900
      // Worksheet B line 5 = max(0, 20 - 12 - 6) = $2
      // Household credit at federal AGI $25,000 single = $25, but line 15 uses the smaller $2
      expect(result.householdCredit.toString()).toBe("20");
      expect(result.nyEarnedIncomeCredit.toString()).toBe("898");
    });

    it("Line 65 - joint federal NY-MFS allocation limits the claimed credit to line 17", () => {
      const result = credits2025({
        nyAgi: 40000,
        federalAgi: 40000,
        nyStateTax: 1500,
        filingStatus: "married_filing_separately",
        federalEic: 3000,
        jointFederalReturnForMfsAllocation: true,
        line17AllocatedNYSEic: 275,
      });

      expect(result.householdCredit.toString()).toBe("0");
      expect(result.nyEarnedIncomeCredit.toString()).toBe("275");
    });

    it("Line 65 - NY EIC is zero when no federal EIC", () => {
      const result = credits2025();
      expect(result.nyEarnedIncomeCredit.toString()).toBe("0");
    });

    it("Line 65 - NY EIC rounds to nearest dollar", () => {
      const result = credits2025({ federalEic: 1000 });
      // 1000 × 0.30 = 300
      expect(result.nyEarnedIncomeCredit.toString()).toBe("300");
    });

    it("Line 65 - NY EIC with small federal EIC", () => {
      const result = credits2025({ federalEic: 11 });
      // 11 × 0.30 = 3.30, rounds to $3
      expect(result.nyEarnedIncomeCredit.toString()).toBe("3");
    });

    it("Line 65 - household credit can reduce the regular NY EIC to zero", () => {
      const result = credits2025({
        nyAgi: 5000,
        federalAgi: 5000,
        nyStateTax: 500,
        federalEic: 100,
      });
      // Base NY EIC = round(100 × 0.30) = $30
      // Household credit at federal AGI $5,000 single = $75
      expect(result.nyEarnedIncomeCredit.toString()).toBe("0");
    });

    it("Line 65 - NY EIC rounding: $7,430 federal EIC", () => {
      const result = credits2025({ federalEic: 7430 });
      // 7430 × 0.30 = 2229
      expect(result.nyEarnedIncomeCredit.toString()).toBe("2229");
    });

    it("Line 65 - noncustodial parent EIC uses 2.5x multiplier", () => {
      const result = credits2025({
        federalEic: 600,
        isNoncustodialParentEic: true,
      });
      // 600 × 2.5 = 1500
      expect(result.nyEarnedIncomeCredit.toString()).toBe("1500");
    });

    it("Line 65 - noncustodial parent EIC with zero federal EIC is zero", () => {
      const result = credits2025({
        federalEic: 0,
        isNoncustodialParentEic: true,
      });
      expect(result.nyEarnedIncomeCredit.toString()).toBe("0");
    });

    it("Line 65 - NY EIC is refundable (not limited by tax)", () => {
      const result = credits2025({
        nyStateTax: 0,
        federalEic: 5000,
      });
      // EIC = 5000 × 0.30 = 1500, even though tax is zero
      expect(result.nyEarnedIncomeCredit.toString()).toBe("1500");
    });
  });

  /* ========== Integration tests ========== */

  describe("Integration - full credit flow", () => {
    it("Low-income single filer with household credit and EIC", () => {
      const result = credits2025({
        filingStatus: "single",
        nyAgi: 20000,
        nyStateTax: 500,
        federalEic: 2000,
      });
      expect(result.householdCredit.toString()).toBe("25"); // $15,001-$25,000
      expect(result.totalNYStateCredits.toString()).toBe("25");
      expect(result.netNYStateTax.toString()).toBe("475"); // 500 - 25
      expect(result.totalNYStateTaxes.toString()).toBe("475");
      expect(result.nyEarnedIncomeCredit.toString()).toBe("575"); // 2000 × 0.30 - 25 household credit
    });

    it("MFJ family with dependents, household credit, and EIC", () => {
      const result = credits2025({
        filingStatus: "married_filing_jointly",
        nyAgi: 25000,
        nyStateTax: 800,
        numberOfDependents: 3,
        federalEic: 6600,
      });
      // Table 2, $22,001-$25,000 row, household size 5 = $90
      expect(result.householdCredit.toString()).toBe("90");
      expect(result.netNYStateTax.toString()).toBe("710"); // 800 - 90
      expect(result.nyEarnedIncomeCredit.toString()).toBe("1890"); // 6600 × 0.30 - 90 household credit
    });

    it("High-income filer: no household credit, no EIC", () => {
      const result = credits2025({
        filingStatus: "single",
        nyAgi: 200000,
        nyStateTax: 12000,
      });
      expect(result.householdCredit.toString()).toBe("0");
      expect(result.nyEarnedIncomeCredit.toString()).toBe("0");
      expect(result.netNYStateTax.toString()).toBe("12000");
      expect(result.totalNYStateTaxes.toString()).toBe("12000");
    });

    it("MFJ family with ESCC and EIC", () => {
      const result = credits2025({
        filingStatus: "married_filing_jointly",
        nyAgi: 50000,
        nyStateTax: 2000,
        empireStateChildCredit: 1320, // 2 children from IT-213
        federalEic: 3000,
      });
      expect(result.empireStateChildCredit.toString()).toBe("1320");
      expect(result.nyEarnedIncomeCredit.toString()).toBe("900"); // 3000 × 0.30
      expect(result.totalNYStateTaxes.toString()).toBe("2000"); // no household credit (AGI > $32K)
    });

    it("Audit trail records all credit lines", () => {
      const result = credits2025({
        nyAgi: 10000,
        nyStateTax: 1000,
        salesUseTax: 12,
        empireStateChildCredit: 660,
        federalEic: 3000,
      });
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("40");
      expect(lineNumbers).toContain("43");
      expect(lineNumbers).toContain("44");
      expect(lineNumbers).toContain("46");
      expect(lineNumbers).toContain("59");
      expect(lineNumbers).toContain("63");
      expect(lineNumbers).toContain("65");
    });
  });

  /* ========== Direct helper tests ========== */

  describe("computeHouseholdCredit helper", () => {
    it("returns table credit directly for simple case", () => {
      const credit = computeHouseholdCredit({
        federalAgi: d(10000),
        filingStatus: "single",
        numberOfDependents: 0,
        nyStateTax: d(1000),
        taxYear: 2025,
      });
      expect(credit.toString()).toBe("45");
    });
  });

  describe("computeNYEarnedIncomeCredit helper", () => {
    it("computes 30% of federal EIC", () => {
      const credit = computeNYEarnedIncomeCredit({
        federalEic: d(4000),
        isNoncustodialParentEic: false,
      });
      expect(credit.toString()).toBe("1200");
    });

    it("computes 2.5x for noncustodial parent", () => {
      const credit = computeNYEarnedIncomeCredit({
        federalEic: d(400),
        isNoncustodialParentEic: true,
      });
      expect(credit.toString()).toBe("1000");
    });
  });
});
