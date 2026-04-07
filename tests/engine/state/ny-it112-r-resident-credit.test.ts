/**
 * Tests for NY IT-112-R: Resident Credit for Taxes Paid to Another State.
 * Validates credit computation, income ratio, proportionate NY tax,
 * multi-jurisdiction handling, and edge cases.
 * Spec: spec/state/ny-it112-r-resident-credit.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateNYIT112R,
  type NYIT112RInput,
  type NYIT112ROtherJurisdiction,
} from "@/engine/state/ny-it112-r-resident-credit.js";

/* ---------- Helpers ---------- */

function d(v: number | string): Decimal {
  return new Decimal(v);
}

function baseInput(overrides: Partial<NYIT112RInput> = {}): NYIT112RInput {
  return {
    totalNYIncome: 100000,
    nyStateTax: 5000,
    nyHouseholdCredit: 0,
    jurisdictions: [
      {
        stateCode: "NJ",
        sourcedIncome: 60000,
        taxPaidByTaxpayer: 2500,
      },
    ],
    ...overrides,
  };
}

function nj(overrides: Partial<NYIT112ROtherJurisdiction> = {}): NYIT112ROtherJurisdiction {
  return {
    stateCode: "NJ",
    sourcedIncome: 60000,
    taxPaidByTaxpayer: 2500,
    ...overrides,
  };
}

/* ---------- Line 22A: Total NY income ---------- */

describe("NY IT-112-R Resident Credit", () => {
  describe("Line 22A - total NY income", () => {
    it("total NY income equals NY AGI", () => {
      const result = calculateNYIT112R(baseInput());
      expect(result.totalNYIncome.equals(d(100000))).toBe(true);
    });

    it("accepts string and number inputs", () => {
      const result = calculateNYIT112R(baseInput({ totalNYIncome: "85000" }));
      expect(result.totalNYIncome.equals(d(85000))).toBe(true);
    });
  });

  /* ---------- Line 22B: Sourced income ---------- */

  describe("Line 22B - sourced income from other state", () => {
    it("records sourced income for jurisdiction", () => {
      const result = calculateNYIT112R(baseInput());
      expect(result.jurisdictionResults[0].sourcedIncome.equals(d(60000))).toBe(true);
    });

    it("handles large sourced income exceeding NY AGI", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 50000,
        jurisdictions: [nj({ sourcedIncome: 75000 })],
      }));
      // Col B > Col A is valid per IT-112-R instructions
      expect(result.jurisdictionResults[0].sourcedIncome.equals(d(75000))).toBe(true);
    });
  });

  /* ---------- Line 24: Tax imposed ---------- */

  describe("Line 24 - tax paid to other state", () => {
    it("tax paid equals taxpayer amount when no PTET", () => {
      const result = calculateNYIT112R(baseInput());
      expect(result.jurisdictionResults[0].taxImposed.equals(d(2500))).toBe(true);
    });

    it("tax paid includes PTET from entity", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ taxPaidByTaxpayer: 2000, ptetPaidByEntity: 500 })],
      }));
      // 2000 + 500 = 2500
      expect(result.jurisdictionResults[0].taxImposed.equals(d(2500))).toBe(true);
    });

    it("zero tax paid produces zero credit", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ taxPaidByTaxpayer: 0 })],
      }));
      expect(result.jurisdictionResults[0].taxImposed.equals(d(0))).toBe(true);
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(0))).toBe(true);
    });

    it("negative tax paid (PTET refund exceeds liability) yields zero credit", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ taxPaidByTaxpayer: -500, ptetPaidByEntity: 0 })],
      }));
      expect(result.jurisdictionResults[0].taxImposed.equals(d(-500))).toBe(true);
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Line 25: NY State tax payable ---------- */

  describe("Line 25 - NY State tax minus household credit", () => {
    it("no household credit: tax payable equals state tax", () => {
      const result = calculateNYIT112R(baseInput({ nyStateTax: 5000, nyHouseholdCredit: 0 }));
      expect(result.nyStateTaxPayable.equals(d(5000))).toBe(true);
    });

    it("with household credit: tax payable reduced", () => {
      const result = calculateNYIT112R(baseInput({ nyStateTax: 5000, nyHouseholdCredit: 45 }));
      expect(result.nyStateTaxPayable.equals(d(4955))).toBe(true);
    });

    it("household credit exceeding tax: payable floored at zero", () => {
      const result = calculateNYIT112R(baseInput({ nyStateTax: 30, nyHouseholdCredit: 45 }));
      expect(result.nyStateTaxPayable.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Line 26: Income ratio ---------- */

  describe("Line 26 - income ratio rounded to 4 decimals", () => {
    it("standard ratio: 60000 / 100000 = 0.6000", () => {
      const result = calculateNYIT112R(baseInput());
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("0.6"))).toBe(true);
    });

    it("ratio truncated to 4 decimal places (not rounded)", () => {
      // 33333 / 100000 = 0.33333... → truncated to 0.3333
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ sourcedIncome: 33333 })],
      }));
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("0.3333"))).toBe(true);
    });

    it("ratio can exceed 1.0 when Col B > Col A", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 15000,
        jurisdictions: [nj({ sourcedIncome: 25000 })],
      }));
      // 25000 / 15000 = 1.6666... → truncated to 1.6666
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("1.6666"))).toBe(true);
    });

    it("zero total NY income: ratio is zero", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 0,
        jurisdictions: [nj({ sourcedIncome: 50000 })],
      }));
      expect(result.jurisdictionResults[0].incomeRatio.equals(d(0))).toBe(true);
    });

    it("negative total NY income: ratio is zero", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: -5000,
        jurisdictions: [nj({ sourcedIncome: 50000 })],
      }));
      expect(result.jurisdictionResults[0].incomeRatio.equals(d(0))).toBe(true);
    });

    it("negative sourced income: ratio is zero", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ sourcedIncome: -3000 })],
      }));
      expect(result.jurisdictionResults[0].incomeRatio.equals(d(0))).toBe(true);
    });

    it("exact ratio: 50000 / 100000 = 0.5000", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ sourcedIncome: 50000 })],
      }));
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("0.5"))).toBe(true);
    });

    it("very small ratio: 100 / 500000 = 0.0002", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 500000,
        jurisdictions: [nj({ sourcedIncome: 100 })],
      }));
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("0.0002"))).toBe(true);
    });

    it("equal amounts: 100000 / 100000 = 1.0000", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ sourcedIncome: 100000 })],
      }));
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("1"))).toBe(true);
    });
  });

  /* ---------- Line 27: Proportionate NY tax ---------- */

  describe("Line 27 - proportionate NY tax", () => {
    it("proportionate tax = tax payable × ratio", () => {
      const result = calculateNYIT112R(baseInput());
      // 5000 × 0.6 = 3000
      expect(result.jurisdictionResults[0].proportionateNYTax.equals(d(3000))).toBe(true);
    });

    it("ratio > 1 can produce proportionate tax exceeding payable", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 15000,
        nyStateTax: 1000,
        jurisdictions: [nj({ sourcedIncome: 25000 })],
      }));
      // 1000 × 1.6666 = 1666.6
      expect(result.jurisdictionResults[0].proportionateNYTax.equals(d("1666.6"))).toBe(true);
    });

    it("zero tax payable: proportionate tax is zero", () => {
      const result = calculateNYIT112R(baseInput({
        nyStateTax: 45,
        nyHouseholdCredit: 45,
        jurisdictions: [nj()],
      }));
      expect(result.jurisdictionResults[0].proportionateNYTax.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Line 28: Allowable credit per jurisdiction ---------- */

  describe("Line 28 - credit is lesser of tax paid or proportionate NY tax", () => {
    it("other state tax < proportionate NY tax: credit = other state tax", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 8000,
        jurisdictions: [nj({ sourcedIncome: 60000, taxPaidByTaxpayer: 2000 })],
      }));
      // Proportionate tax = 8000 × 0.6 = 4800
      // Credit = min(2000, 4800) = 2000
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(2000))).toBe(true);
    });

    it("other state tax > proportionate NY tax: credit = proportionate tax", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 3000,
        jurisdictions: [nj({ sourcedIncome: 60000, taxPaidByTaxpayer: 5000 })],
      }));
      // Proportionate tax = 3000 × 0.6 = 1800
      // Credit = min(5000, 1800) = 1800
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(1800))).toBe(true);
    });

    it("credit floored at zero (negative inputs)", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ sourcedIncome: -1000, taxPaidByTaxpayer: 500 })],
      }));
      // Negative sourced income → ratio 0 → proportionate tax 0 → credit 0
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(0))).toBe(true);
    });

    it("both values equal: credit equals both", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 5000,
        jurisdictions: [nj({ sourcedIncome: 60000, taxPaidByTaxpayer: 3000 })],
      }));
      // Proportionate tax = 5000 × 0.6 = 3000
      // Credit = min(3000, 3000) = 3000
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(3000))).toBe(true);
    });
  });

  /* ---------- Line 30: Total credit from multiple states ---------- */

  describe("Line 30 - total credit from multiple states", () => {
    it("single jurisdiction: total credit equals that jurisdiction's credit", () => {
      const result = calculateNYIT112R(baseInput());
      expect(result.totalCredit.equals(result.jurisdictionResults[0].allowableCredit)).toBe(true);
    });

    it("two jurisdictions: credits summed", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 150000,
        nyStateTax: 8000,
        jurisdictions: [
          { stateCode: "NJ", sourcedIncome: 60000, taxPaidByTaxpayer: 2000 },
          { stateCode: "CT", sourcedIncome: 30000, taxPaidByTaxpayer: 1500 },
        ],
      }));

      // NJ: ratio = 60000/150000 = 0.4, prop tax = 8000 × 0.4 = 3200, credit = min(2000, 3200) = 2000
      // CT: ratio = 30000/150000 = 0.2, prop tax = 8000 × 0.2 = 1600, credit = min(1500, 1600) = 1500
      // Total = 2000 + 1500 = 3500
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(2000))).toBe(true);
      expect(result.jurisdictionResults[1].allowableCredit.equals(d(1500))).toBe(true);
      expect(result.totalCredit.equals(d(3500))).toBe(true);
    });

    it("three jurisdictions summed correctly", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 200000,
        nyStateTax: 12000,
        jurisdictions: [
          { stateCode: "NJ", sourcedIncome: 50000, taxPaidByTaxpayer: 2000 },
          { stateCode: "CT", sourcedIncome: 30000, taxPaidByTaxpayer: 1200 },
          { stateCode: "PA", sourcedIncome: 20000, taxPaidByTaxpayer: 600 },
        ],
      }));

      // NJ: ratio = 0.25, prop = 3000, credit = min(2000, 3000) = 2000
      // CT: ratio = 0.15, prop = 1800, credit = min(1200, 1800) = 1200
      // PA: ratio = 0.1, prop = 1200, credit = min(600, 1200) = 600
      // Total = 3800
      expect(result.totalCredit.equals(d(3800))).toBe(true);
    });

    it("no jurisdictions: total credit is zero", () => {
      const result = calculateNYIT112R(baseInput({ jurisdictions: [] }));
      expect(result.totalCredit.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Lines 31-34: Application and final credit ---------- */

  describe("Line 34 - final credit limited to remaining tax", () => {
    it("credit less than remaining tax: full credit allowed", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 5000,
        nyHouseholdCredit: 0,
        jurisdictions: [nj({ sourcedIncome: 60000, taxPaidByTaxpayer: 2500 })],
      }));
      // Credit = 2500 (tax paid < proportionate 3000)
      // Remaining tax = 5000 - 0 = 5000
      // Final = min(2500, 5000) = 2500
      expect(result.finalCredit.equals(d(2500))).toBe(true);
    });

    it("credit exceeds remaining tax: limited to remaining tax", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 2000,
        nyHouseholdCredit: 0,
        otherCreditsBeforeResident: 500,
        jurisdictions: [nj({ sourcedIncome: 80000, taxPaidByTaxpayer: 5000 })],
      }));
      // Prop tax = 2000 × 0.8 = 1600, credit = min(5000, 1600) = 1600
      // Remaining = 2000 - 0 - 500 = 1500
      // Final = min(1600, 1500) = 1500
      expect(result.finalCredit.equals(d(1500))).toBe(true);
    });

    it("household credit reduces remaining tax", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 5000,
        nyHouseholdCredit: 45,
        jurisdictions: [nj({ sourcedIncome: 60000, taxPaidByTaxpayer: 10000 })],
      }));
      // Tax payable = 5000 - 45 = 4955, prop = 4955 × 0.6 = 2973
      // Credit = min(10000, 2973) = 2973
      // Remaining = 5000 - 45 - 0 = 4955
      // Final = min(2973, 4955) = 2973
      expect(result.finalCredit.equals(d(2973))).toBe(true);
    });

    it("other credits before resident reduce remaining tax further", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 5000,
        nyHouseholdCredit: 0,
        otherCreditsBeforeResident: 3000,
        jurisdictions: [nj({ sourcedIncome: 60000, taxPaidByTaxpayer: 3000 })],
      }));
      // Prop tax = 5000 × 0.6 = 3000, credit = 3000
      // Remaining = 5000 - 0 - 3000 = 2000
      // Final = min(3000, 2000) = 2000
      expect(result.finalCredit.equals(d(2000))).toBe(true);
    });

    it("other credits exceed tax: zero remaining, no resident credit", () => {
      const result = calculateNYIT112R(baseInput({
        nyStateTax: 100,
        nyHouseholdCredit: 45,
        otherCreditsBeforeResident: 200,
        jurisdictions: [nj({ sourcedIncome: 60000, taxPaidByTaxpayer: 2000 })],
      }));
      // Remaining = max(0, 100 - 45 - 200) = 0
      // Final = min(anything, 0) = 0
      expect(result.finalCredit.equals(d(0))).toBe(true);
    });

    it("Line 31 - IT-201-ATT line 21 tax increases the resident-credit limitation", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 100,
        otherTaxesBeforeCredits: 50,
        otherCreditsBeforeResident: 20,
        jurisdictions: [nj({ sourcedIncome: 100000, taxPaidByTaxpayer: 120 })],
      }));

      // Line 31 = 100 + 50 = 150
      // Line 32 = 20
      // Line 33 = 130
      // Line 30 = min(120, 100) = 100 before the line-31 limitation
      // Final = min(100, 130) = 100
      expect(result.taxDueBeforeCredits.equals(d(150))).toBe(true);
      expect(result.remainingTaxLiability.equals(d(130))).toBe(true);
      expect(result.finalCredit.equals(d(100))).toBe(true);
    });

    it("final credit rounded to nearest dollar", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 100000,
        nyStateTax: 5000,
        jurisdictions: [{
          stateCode: "NJ",
          sourcedIncome: 33333,
          taxPaidByTaxpayer: 10000,
        }],
      }));
      // Ratio = 0.3333, prop tax = 5000 × 0.3333 = 1666.5
      // Credit = min(10000, 1666.5) = 1666.5 → rounded to 1667
      expect(result.finalCredit.equals(d(1667))).toBe(true);
    });
  });

  /* ---------- Realistic scenarios ---------- */

  describe("Realistic scenarios", () => {
    it("NY resident commuting to NJ for work ($100K wages)", () => {
      const result = calculateNYIT112R({
        totalNYIncome: 100000,
        nyStateTax: 4556,
        nyHouseholdCredit: 0,
        jurisdictions: [{
          stateCode: "NJ",
          sourcedIncome: 100000,
          taxPaidByTaxpayer: 3550,
        }],
      });

      // All income sourced to NJ, ratio = 1.0000
      // Prop tax = 4556 × 1.0 = 4556
      // Credit = min(3550, 4556) = 3550
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("1"))).toBe(true);
      expect(result.finalCredit.equals(d(3550))).toBe(true);
    });

    it("NY resident with rental income in PA and wages in CT", () => {
      const result = calculateNYIT112R({
        totalNYIncome: 180000,
        nyStateTax: 10200,
        nyHouseholdCredit: 0,
        jurisdictions: [
          {
            stateCode: "CT",
            sourcedIncome: 120000,
            taxPaidByTaxpayer: 6100,
          },
          {
            stateCode: "PA",
            sourcedIncome: 8000,
            taxPaidByTaxpayer: 245,
          },
        ],
      });

      // CT: ratio = 120000/180000 = 0.6666, prop = 10200 × 0.6666 = 6799.32
      // credit = min(6100, 6799.32) = 6100
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("0.6666"))).toBe(true);
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(6100))).toBe(true);

      // PA: ratio = 8000/180000 = 0.0444, prop = 10200 × 0.0444 = 452.88
      // credit = min(245, 452.88) = 245
      expect(result.jurisdictionResults[1].incomeRatio.equals(d("0.0444"))).toBe(true);
      expect(result.jurisdictionResults[1].allowableCredit.equals(d(245))).toBe(true);

      // Total = 6100 + 245 = 6345
      expect(result.totalCredit.equals(d(6345))).toBe(true);
      expect(result.finalCredit.equals(d(6345))).toBe(true);
    });

    it("low-income filer with small NJ tax and household credit", () => {
      const result = calculateNYIT112R({
        totalNYIncome: 25000,
        nyStateTax: 400,
        nyHouseholdCredit: 25,
        jurisdictions: [{
          stateCode: "NJ",
          sourcedIncome: 20000,
          taxPaidByTaxpayer: 150,
        }],
      });

      // Tax payable = 400 - 25 = 375
      // Ratio = 20000/25000 = 0.8
      // Prop tax = 375 × 0.8 = 300
      // Credit = min(150, 300) = 150
      // Remaining = 400 - 25 = 375
      // Final = min(150, 375) = 150
      expect(result.nyStateTaxPayable.equals(d(375))).toBe(true);
      expect(result.finalCredit.equals(d(150))).toBe(true);
    });

    it("high-income filer where proportionate tax limits the credit", () => {
      const result = calculateNYIT112R({
        totalNYIncome: 500000,
        nyStateTax: 28000,
        nyHouseholdCredit: 0,
        jurisdictions: [{
          stateCode: "CA",
          sourcedIncome: 100000,
          taxPaidByTaxpayer: 9300,
        }],
      });

      // Ratio = 100000/500000 = 0.2
      // Prop tax = 28000 × 0.2 = 5600
      // Credit = min(9300, 5600) = 5600 (CA's higher rate limited by NY proportion)
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(5600))).toBe(true);
      expect(result.finalCredit.equals(d(5600))).toBe(true);
    });

    it("PTET paid by S corp to NJ on behalf of taxpayer", () => {
      const result = calculateNYIT112R({
        totalNYIncome: 200000,
        nyStateTax: 12000,
        nyHouseholdCredit: 0,
        jurisdictions: [{
          stateCode: "NJ",
          sourcedIncome: 150000,
          taxPaidByTaxpayer: 3000,
          ptetPaidByEntity: 5000,
        }],
      });

      // Tax imposed = 3000 + 5000 = 8000
      // Ratio = 150000/200000 = 0.75
      // Prop tax = 12000 × 0.75 = 9000
      // Credit = min(8000, 9000) = 8000
      expect(result.jurisdictionResults[0].taxImposed.equals(d(8000))).toBe(true);
      expect(result.finalCredit.equals(d(8000))).toBe(true);
    });

    it("DC resident credit for NYC worker working from NY home", () => {
      const result = calculateNYIT112R({
        totalNYIncome: 85000,
        nyStateTax: 3800,
        nyHouseholdCredit: 0,
        jurisdictions: [{
          stateCode: "DC",
          sourcedIncome: 85000,
          taxPaidByTaxpayer: 4200,
        }],
      });

      // Ratio = 1.0, Prop = 3800
      // Credit = min(4200, 3800) = 3800 (limited by NY tax)
      expect(result.finalCredit.equals(d(3800))).toBe(true);
    });
  });

  /* ---------- Edge cases ---------- */

  describe("Edge cases", () => {
    it("zero NY State tax: no credit regardless of other state tax", () => {
      const result = calculateNYIT112R(baseInput({
        nyStateTax: 0,
        jurisdictions: [nj({ taxPaidByTaxpayer: 5000 })],
      }));
      expect(result.finalCredit.equals(d(0))).toBe(true);
    });

    it("zero sourced income but positive tax paid: no credit", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [nj({ sourcedIncome: 0, taxPaidByTaxpayer: 1000 })],
      }));
      // Ratio = 0, proportionate tax = 0, credit = 0
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(0))).toBe(true);
    });

    it("sourced income exceeding total NY income", () => {
      const result = calculateNYIT112R(baseInput({
        totalNYIncome: 40000,
        nyStateTax: 2000,
        jurisdictions: [nj({ sourcedIncome: 60000, taxPaidByTaxpayer: 3500 })],
      }));
      // Ratio = 60000/40000 = 1.5 → truncated to 1.5
      // Prop tax = 2000 × 1.5 = 3000
      // Credit = min(3500, 3000) = 3000
      expect(result.jurisdictionResults[0].incomeRatio.equals(d("1.5"))).toBe(true);
      expect(result.jurisdictionResults[0].allowableCredit.equals(d(3000))).toBe(true);
      expect(result.finalCredit.equals(d(2000))).toBe(true); // limited to remaining tax
    });

    it("very large PTET producing large credit", () => {
      const result = calculateNYIT112R({
        totalNYIncome: 1000000,
        nyStateTax: 65000,
        nyHouseholdCredit: 0,
        jurisdictions: [{
          stateCode: "NJ",
          sourcedIncome: 800000,
          taxPaidByTaxpayer: 10000,
          ptetPaidByEntity: 50000,
        }],
      });
      // Tax imposed = 60000
      // Ratio = 0.8, Prop = 65000 × 0.8 = 52000
      // Credit = min(60000, 52000) = 52000
      expect(result.finalCredit.equals(d(52000))).toBe(true);
    });

    it("MFS scenario: only one spouse's tax applies", () => {
      // This is handled by the caller (only include the relevant spouse's data)
      const result = calculateNYIT112R({
        totalNYIncome: 75000,
        nyStateTax: 3200,
        nyHouseholdCredit: 0,
        jurisdictions: [{
          stateCode: "CT",
          sourcedIncome: 50000,
          taxPaidByTaxpayer: 2100,
        }],
      });
      // Ratio = 50000/75000 = 0.6666
      // Prop = 3200 × 0.6666 = 2133.12
      // Credit = min(2100, 2133.12) = 2100
      expect(result.finalCredit.equals(d(2100))).toBe(true);
    });

    it("state + local combined on single IT-112-R", () => {
      // When state and local taxes in same jurisdiction, use larger income amount
      // and combine both taxes
      const result = calculateNYIT112R({
        totalNYIncome: 120000,
        nyStateTax: 6000,
        nyHouseholdCredit: 0,
        jurisdictions: [{
          stateCode: "PA",
          sourcedIncome: 80000, // larger of state/local amounts
          taxPaidByTaxpayer: 3200, // combined state + local income tax
        }],
      });
      // Ratio = 80000/120000 = 0.6666
      // Prop = 6000 × 0.6666 = 3999.6
      // Credit = min(3200, 3999.6) = 3200
      expect(result.finalCredit.equals(d(3200))).toBe(true);
    });
  });

  /* ---------- Audit trail ---------- */

  describe("Audit trail", () => {
    it("produces audit lines for all key computations", () => {
      const result = calculateNYIT112R(baseInput());
      const lineMap = new Map(result.lines.map(l => [`${l.form}:${l.line}`, l]));

      expect(lineMap.has("NY-IT112R:22A")).toBe(true);
      expect(lineMap.has("NY-IT112R:25")).toBe(true);
      expect(lineMap.has("NY-IT112R:22B")).toBe(true);
      expect(lineMap.has("NY-IT112R:24")).toBe(true);
      expect(lineMap.has("NY-IT112R:26")).toBe(true);
      expect(lineMap.has("NY-IT112R:27")).toBe(true);
      expect(lineMap.has("NY-IT112R:28")).toBe(true);
      expect(lineMap.has("NY-IT112R:30")).toBe(true);
      expect(lineMap.has("NY-IT112R:31")).toBe(true);
      expect(lineMap.has("NY-IT112R:33")).toBe(true);
      expect(lineMap.has("NY-IT112R:34")).toBe(true);
    });

    it("audit line values are correct", () => {
      const result = calculateNYIT112R(baseInput());
      const line34 = result.lines.find(l => l.form === "NY-IT112R" && l.line === "34");
      expect(line34).toBeDefined();
      expect(line34!.value.equals(result.finalCredit)).toBe(true);
    });

    it("multi-jurisdiction produces per-state audit lines", () => {
      const result = calculateNYIT112R(baseInput({
        jurisdictions: [
          { stateCode: "NJ", sourcedIncome: 50000, taxPaidByTaxpayer: 2000 },
          { stateCode: "CT", sourcedIncome: 30000, taxPaidByTaxpayer: 1500 },
        ],
      }));

      const descriptions = result.lines.map(l => l.description);
      expect(descriptions.some(d => d.includes("NJ"))).toBe(true);
      expect(descriptions.some(d => d.includes("CT"))).toBe(true);
    });
  });
});
