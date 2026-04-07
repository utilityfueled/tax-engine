/**
 * Edge case tests for Form 6252 — Installment Sale Income.
 * Spec: spec/federal/form-6252.yaml
 *
 * Covers boundary conditions: zero contract price, 100% gross profit
 * percentage, excess liabilities over basis, Section 121 exclusion
 * consuming entire gain, recapture exceeding installment income,
 * related party acceleration, and aggregation with mixed gain characters.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm6252, aggregateForm6252Results } from "@/engine/forms/form-6252.js";
import type { Form6252Input } from "@/models/inputs.js";

function sale(
  overrides: Partial<Form6252Input> &
    Pick<Form6252Input, "sellingPrice" | "costBasis" | "isYearOfSale">
): Form6252Input {
  return {
    description: overrides.description ?? "Test property",
    propertyType: overrides.propertyType ?? "other",
    gainCharacter: overrides.gainCharacter ?? "long_term_capital",
    isYearOfSale: overrides.isYearOfSale,
    sellingPrice: overrides.sellingPrice,
    assumedLiabilities: overrides.assumedLiabilities ?? "0",
    costBasis: overrides.costBasis,
    depreciation: overrides.depreciation ?? "0",
    sellingExpenses: overrides.sellingExpenses ?? "0",
    depreciationRecapture: overrides.depreciationRecapture ?? "0",
    section121Exclusion: overrides.section121Exclusion ?? "0",
    paymentsReceived: overrides.paymentsReceived ?? "0",
    priorYearPayments: overrides.priorYearPayments ?? "0",
    remainingOrdinaryRecapture: overrides.remainingOrdinaryRecapture ?? "0",
    relatedParty: overrides.relatedParty,
  };
}

describe("Form 6252 edge cases", () => {
  // ═══════════════════════════════════════════════════════════
  // Zero and boundary contract price
  // ═══════════════════════════════════════════════════════════

  describe("zero and boundary contract price", () => {
    it("Form 6252 Line 19 - gross profit percentage is 0 when contract price is zero", () => {
      // Selling price equals assumed liabilities, no excess → contract price = 0
      const result = calculateForm6252(sale({
        sellingPrice: "100000",
        costBasis: "100000",
        assumedLiabilities: "100000",
        isYearOfSale: true,
      }));
      // Line 7 = 100000 - 100000 = 0, Line 17 = max(0, 100000 - 100000) = 0
      // Line 18 = 0 + 0 = 0 → GP% = 0
      expect(result.line18).toEqual(new Decimal(0));
      expect(result.line19).toEqual(new Decimal(0));
      expect(result.line24).toEqual(new Decimal(0));
    });

    it("Form 6252 Line 19 - gross profit percentage capped at 100%", () => {
      // Scenario where gross profit would nominally exceed contract price
      // Liabilities greatly exceed basis → excess liabilities create deemed payment
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "50000",
        assumedLiabilities: "180000",
        isYearOfSale: true,
        paymentsReceived: "10000",
      }));
      // Line 7 = 200000 - 180000 = 20000
      // Line 13 = 50000 (basis)
      // Line 16 = max(0, 200000 - 50000) = 150000
      // Line 17 = max(0, 180000 - 50000) = 130000
      // Line 18 = 20000 + 130000 = 150000
      // Line 19 = min(150000/150000, 1) = 1
      expect(result.line19).toEqual(new Decimal(1));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Excess liabilities over basis
  // ═══════════════════════════════════════════════════════════

  describe("excess liabilities over basis", () => {
    it("Form 6252 Line 17 - zero when liabilities equal basis", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        assumedLiabilities: "100000",
        isYearOfSale: true,
        paymentsReceived: "50000",
      }));
      // Line 13 = 100000, Line 6 = 100000 → Line 17 = max(0, 100000 - 100000) = 0
      expect(result.line17).toEqual(new Decimal(0));
    });

    it("Form 6252 Line 17 - one dollar excess when liabilities exceed basis by $1", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        assumedLiabilities: "100001",
        isYearOfSale: true,
        paymentsReceived: "50000",
      }));
      expect(result.line17).toEqual(new Decimal(1));
    });

    it("Form 6252 Line 20 - deemed payment from excess liabilities only in year of sale", () => {
      // Year of sale: Line 20 = Line 17
      const yearOfSale = calculateForm6252(sale({
        sellingPrice: "300000",
        costBasis: "50000",
        assumedLiabilities: "200000",
        isYearOfSale: true,
        paymentsReceived: "20000",
      }));
      expect(yearOfSale.line20).toEqual(yearOfSale.line17);
      expect(yearOfSale.line20.greaterThan(0)).toBe(true);

      // Subsequent year: Line 20 = 0
      const subsequentYear = calculateForm6252(sale({
        sellingPrice: "300000",
        costBasis: "50000",
        assumedLiabilities: "200000",
        isYearOfSale: false,
        paymentsReceived: "20000",
      }));
      expect(subsequentYear.line20).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Section 121 exclusion
  // ═══════════════════════════════════════════════════════════

  describe("Section 121 exclusion on installment sale", () => {
    it("Form 6252 Line 15 - Section 121 exclusion eliminates entire gross gain", () => {
      // $250K exclusion on a property with $200K gain
      const result = calculateForm6252(sale({
        sellingPrice: "400000",
        costBasis: "200000",
        isYearOfSale: true,
        section121Exclusion: "250000",
        paymentsReceived: "100000",
      }));
      // Gross gain = 400000 - 200000 = 200000
      // Section 121 = min(250000, 200000) = 200000
      expect(result.line15).toEqual(new Decimal(200000));
      // Gross profit = max(0, 200000 - 200000) = 0
      expect(result.line16).toEqual(new Decimal(0));
      // No income recognized
      expect(result.line24).toEqual(new Decimal(0));
    });

    it("Form 6252 Line 15 - Section 121 exclusion reduces gross profit partially", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "750000",
        costBasis: "200000",
        isYearOfSale: true,
        section121Exclusion: "500000",
        paymentsReceived: "100000",
      }));
      // Gross gain = 550000, exclusion = 500000, gross profit = 50000
      expect(result.line14).toEqual(new Decimal(550000));
      expect(result.line15).toEqual(new Decimal(500000));
      expect(result.line16).toEqual(new Decimal(50000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Recapture rules
  // ═══════════════════════════════════════════════════════════

  describe("recapture spread over installment years", () => {
    it("Form 6252 Line 25 - entire installment income is ordinary when recapture exceeds income", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "10000",
        remainingOrdinaryRecapture: "50000",
      }));
      // GP% = 100000/200000 = 0.5
      // Line 24 = 10000 × 0.5 = 5000
      // Line 25 = min(50000, 5000) = 5000 (all ordinary)
      // Line 26 = 5000 - 5000 = 0
      expect(result.line24).toEqual(new Decimal(5000));
      expect(result.line25).toEqual(new Decimal(5000));
      expect(result.line26).toEqual(new Decimal(0));
      // Remaining recapture = 50000 - 5000 = 45000
      expect(result.remainingOrdinaryRecapture).toEqual(new Decimal(45000));
    });

    it("Form 6252 Line 25 - recapture exactly equals installment income", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "20000",
        remainingOrdinaryRecapture: "10000",
      }));
      // Line 24 = 20000 × 0.5 = 10000
      // Line 25 = min(10000, 10000) = 10000
      expect(result.line24).toEqual(new Decimal(10000));
      expect(result.line25).toEqual(new Decimal(10000));
      expect(result.line26).toEqual(new Decimal(0));
      expect(result.remainingOrdinaryRecapture).toEqual(new Decimal(0));
    });

    it("Form 6252 Line 25 - recapture partially absorbed, remainder is capital gain", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "40000",
        remainingOrdinaryRecapture: "10000",
      }));
      // Line 24 = 40000 × 0.5 = 20000
      // Line 25 = min(10000, 20000) = 10000
      // Line 26 = 20000 - 10000 = 10000
      expect(result.line24).toEqual(new Decimal(20000));
      expect(result.line25).toEqual(new Decimal(10000));
      expect(result.line26).toEqual(new Decimal(10000));
      expect(result.remainingOrdinaryRecapture).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Related party acceleration
  // ═══════════════════════════════════════════════════════════

  describe("related party acceleration", () => {
    it("Form 6252 Line 34 - zero acceleration when payments exceed related party price", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "50000",
        priorYearPayments: "100000",
        relatedParty: { secondDispositionPrice: "120000", exceptionApplies: false },
      }));
      // Line 22 + Line 23 = 50000 + 100000 = 150000
      // Line 32 = min(120000, 200000) = 120000
      // Line 34 = max(0, 120000 - 150000) = 0
      expect(result.line34).toEqual(new Decimal(0));
      expect(result.line35).toEqual(new Decimal(0));
    });

    it("Form 6252 Line 34 - acceleration when related party resells at full contract price", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "20000",
        priorYearPayments: "30000",
        relatedParty: { secondDispositionPrice: "200000", exceptionApplies: false },
      }));
      // Line 22 = 20000, Line 23 = 30000, total = 50000
      // Line 32 = min(200000, 200000) = 200000
      // Line 34 = max(0, 200000 - 50000) = 150000
      expect(result.line34).toEqual(new Decimal(150000));
      // Line 35 = 150000 × 0.5 = 75000
      expect(result.line35).toEqual(new Decimal(75000));
    });

    it("Form 6252 Line 34 - no acceleration when exception applies", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "10000",
        relatedParty: { secondDispositionPrice: "200000", exceptionApplies: true },
      }));
      // Exception applies → no Part III computation
      expect(result.line34).toEqual(new Decimal(0));
      expect(result.line35).toEqual(new Decimal(0));
    });

    it("Form 6252 Line 36 - accelerated recapture splits between ordinary and capital", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "80000",
        isYearOfSale: false,
        paymentsReceived: "10000",
        priorYearPayments: "0",
        remainingOrdinaryRecapture: "30000",
        relatedParty: { secondDispositionPrice: "180000", exceptionApplies: false },
      }));
      // GP = 200000 - 80000 = 120000, CP = 200000
      // GP% = 120000/200000 = 0.6
      // Line 24 = 10000 × 0.6 = 6000
      // Line 25 = min(30000, 6000) = 6000 (ordinary)
      // Remaining recapture after Part II = 30000 - 6000 = 24000
      // Line 32 = min(180000, 200000) = 180000
      // Line 34 = max(0, 180000 - 10000) = 170000
      // Line 35 = round(170000 × 0.6) = 102000
      // Line 36 = min(24000, 102000) = 24000 (ordinary from acceleration)
      // Line 37 = 102000 - 24000 = 78000 (capital from acceleration)
      expect(result.line25).toEqual(new Decimal(6000));
      expect(result.line36).toEqual(new Decimal(24000));
      expect(result.line37).toEqual(new Decimal(78000));
      expect(result.totalOrdinaryIncome).toEqual(new Decimal(30000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Subsequent year (not year of sale)
  // ═══════════════════════════════════════════════════════════

  describe("subsequent year payments", () => {
    it("Form 6252 Line 24 - zero income when no payment received in subsequent year", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "0",
      }));
      // GP% = 0.5, payment = 0 → income = 0
      expect(result.line24).toEqual(new Decimal(0));
      expect(result.line25).toEqual(new Decimal(0));
      expect(result.line26).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Depreciation recapture adds to basis
  // ═══════════════════════════════════════════════════════════

  describe("depreciation recapture increases basis", () => {
    it("Form 6252 Line 13 - depreciation recapture increases installment sale basis", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "120000",
        depreciation: "40000",
        depreciationRecapture: "40000",
        isYearOfSale: true,
        paymentsReceived: "50000",
      }));
      // Line 10 = 120000 - 40000 = 80000
      // Line 13 = 80000 + 0 + 40000 = 120000
      // Line 14 = 200000 - 120000 = 80000 (gross gain reduced by recapture in basis)
      expect(result.line10).toEqual(new Decimal(80000));
      expect(result.line13).toEqual(new Decimal(120000));
      expect(result.line14).toEqual(new Decimal(80000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Aggregation
  // ═══════════════════════════════════════════════════════════

  describe("aggregation of multiple installment sales", () => {
    it("Form 6252 aggregation - mixed gain characters route correctly", () => {
      const stSale = calculateForm6252(sale({
        sellingPrice: "100000",
        costBasis: "70000",
        isYearOfSale: true,
        paymentsReceived: "50000",
        gainCharacter: "short_term_capital",
      }));

      const ltSale = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "120000",
        isYearOfSale: true,
        paymentsReceived: "60000",
        gainCharacter: "long_term_capital",
      }));

      const s1231Sale = calculateForm6252(sale({
        sellingPrice: "300000",
        costBasis: "200000",
        isYearOfSale: true,
        paymentsReceived: "80000",
        gainCharacter: "section_1231",
      }));

      const agg = aggregateForm6252Results([stSale, ltSale, s1231Sale]);

      // Short-term: GP = 30000, CP = 100000, GP% = 0.3, income = 50000 × 0.3 = 15000
      expect(agg.shortTermCapitalGain).toEqual(new Decimal(15000));
      // Long-term: GP = 80000, CP = 200000, GP% = 0.4, income = 60000 × 0.4 = 24000
      expect(agg.longTermCapitalGain).toEqual(new Decimal(24000));
      // Section 1231: GP = 100000, CP = 300000, GP% = 1/3, income = round(80000 × 1/3) = 26667
      expect(agg.section1231Gain).toEqual(new Decimal(26667));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Selling expenses reducing gross profit
  // ═══════════════════════════════════════════════════════════

  describe("selling expenses", () => {
    it("Form 6252 Line 13 - selling expenses increase basis and reduce gross profit", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        sellingExpenses: "20000",
        isYearOfSale: true,
        paymentsReceived: "50000",
      }));
      // Line 10 = 100000, Line 11 = 20000, Line 12 = 0
      // Line 13 = 100000 + 20000 + 0 = 120000
      // Line 14 = 200000 - 120000 = 80000
      // Line 16 = 80000 (no exclusion)
      // Line 18 = 200000 (no excess liabilities), GP% = 80000/200000 = 0.4
      // Line 24 = 50000 × 0.4 = 20000
      expect(result.line11).toEqual(new Decimal(20000));
      expect(result.line13).toEqual(new Decimal(120000));
      expect(result.line14).toEqual(new Decimal(80000));
      expect(result.line16).toEqual(new Decimal(80000));
      expect(result.line24).toEqual(new Decimal(20000));
    });

    it("Form 6252 Line 14 - selling expenses eliminating entire gain produce zero installment income", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "100000",
        costBasis: "80000",
        sellingExpenses: "20000",
        isYearOfSale: true,
        paymentsReceived: "50000",
      }));
      // Line 13 = 80000 + 20000 = 100000
      // Line 14 = 100000 - 100000 = 0
      expect(result.line14).toEqual(new Decimal(0));
      expect(result.line16).toEqual(new Decimal(0));
      expect(result.line24).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Loss sale (selling price below basis)
  // ═══════════════════════════════════════════════════════════

  describe("loss sale", () => {
    it("Form 6252 Line 16 - negative gross gain floored to zero gross profit and zero income", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "80000",
        costBasis: "100000",
        isYearOfSale: true,
        paymentsReceived: "40000",
      }));
      // Line 14 = 80000 - 100000 = -20000
      // Line 16 = max(0, -20000) = 0
      expect(result.line14).toEqual(new Decimal(-20000));
      expect(result.line16).toEqual(new Decimal(0));
      expect(result.line19).toEqual(new Decimal(0));
      expect(result.line24).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Gross profit percentage rounding
  // ═══════════════════════════════════════════════════════════

  describe("GP% non-terminating decimal", () => {
    it("Form 6252 Line 24 - repeating GP% of 1/3 rounds installment income to nearest dollar", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "90000",
        costBasis: "60000",
        isYearOfSale: true,
        paymentsReceived: "10000",
      }));
      // GP = 30000, CP = 90000, GP% = 30000/90000 = 0.333...
      // Line 24 = round(10000 × 0.333...) = round(3333.33...) = 3333
      expect(result.line24).toEqual(new Decimal(3333));
    });

    it("Form 6252 Line 24 - rounding at exactly $0.50 rounds up (ROUND_HALF_UP)", () => {
      // We need payments × GP% to equal exactly X.5
      // GP = 1, CP = 2, GP% = 0.5. Payments = 1 → 0.5 → rounds to 1
      const result = calculateForm6252(sale({
        sellingPrice: "2",
        costBasis: "1",
        isYearOfSale: true,
        paymentsReceived: "1",
      }));
      // GP = 1, CP = 2, GP% = 0.5
      // Line 24 = round(1 × 0.5) = round(0.5) = 1 (ROUND_HALF_UP)
      expect(result.line19).toEqual(new Decimal("0.5"));
      expect(result.line24).toEqual(new Decimal(1));
    });

    it("Form 6252 Line 24 - rounding just below $0.50 rounds down", () => {
      // GP% = 0.5, payments = 3 → 1.5 → rounds to 2
      // GP% = 0.49..., need something that produces X.49
      // GP = 49, CP = 100, GP% = 0.49. Payments = 1 → 0.49 → rounds to 0
      const result = calculateForm6252(sale({
        sellingPrice: "100",
        costBasis: "51",
        isYearOfSale: true,
        paymentsReceived: "1",
      }));
      // GP = 49, CP = 100, GP% = 0.49
      // Line 24 = round(1 × 0.49) = round(0.49) = 0
      expect(result.line19).toEqual(new Decimal("0.49"));
      expect(result.line24).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Year of sale with excess liabilities AND cash payments
  // ═══════════════════════════════════════════════════════════

  describe("year of sale combined deemed and cash payments", () => {
    it("Form 6252 Line 22 - year of sale combines excess liability deemed payment with cash received", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "300000",
        costBasis: "100000",
        assumedLiabilities: "200000",
        isYearOfSale: true,
        paymentsReceived: "50000",
      }));
      // Line 7 = 300000 - 200000 = 100000
      // Line 13 = 100000 (basis)
      // Line 17 = max(0, 200000 - 100000) = 100000
      // Line 18 = 100000 + 100000 = 200000
      // Line 16 = 300000 - 100000 = 200000
      // GP% = 200000/200000 = 1.0
      // Line 20 = 100000 (deemed), Line 21 = 50000 (cash)
      // Line 22 = 100000 + 50000 = 150000
      // Line 24 = round(150000 × 1.0) = 150000
      expect(result.line20).toEqual(new Decimal(100000));
      expect(result.line21).toEqual(new Decimal(50000));
      expect(result.line22).toEqual(new Decimal(150000));
      expect(result.line24).toEqual(new Decimal(150000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Section 121 exclusion exactly equals gross gain
  // ═══════════════════════════════════════════════════════════

  describe("Section 121 exact boundary", () => {
    it("Form 6252 Line 15 - Section 121 exclusion exactly matches gross gain yields zero income", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "500000",
        costBasis: "250000",
        isYearOfSale: true,
        section121Exclusion: "250000",
        paymentsReceived: "100000",
      }));
      // Line 14 = 500000 - 250000 = 250000
      // Line 15 = min(250000, 250000) = 250000
      // Line 16 = max(0, 0) = 0
      expect(result.line14).toEqual(new Decimal(250000));
      expect(result.line15).toEqual(new Decimal(250000));
      expect(result.line16).toEqual(new Decimal(0));
      expect(result.line24).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Related party: zero recapture means all capital gain
  // ═══════════════════════════════════════════════════════════

  describe("related party with zero recapture", () => {
    it("Form 6252 Line 37 - acceleration with zero remaining recapture routes entirely to capital gain", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "10000",
        priorYearPayments: "0",
        remainingOrdinaryRecapture: "0",
        relatedParty: { secondDispositionPrice: "200000", exceptionApplies: false },
      }));
      // GP% = 0.5
      // Line 24 = 10000 × 0.5 = 5000
      // Line 25 = min(0, 5000) = 0
      // Line 26 = 5000 - 0 = 5000
      // Line 34 = max(0, 200000 - 10000) = 190000
      // Line 35 = round(190000 × 0.5) = 95000
      // Line 36 = min(0, 95000) = 0
      // Line 37 = 95000 - 0 = 95000
      expect(result.line25).toEqual(new Decimal(0));
      expect(result.line26).toEqual(new Decimal(5000));
      expect(result.line36).toEqual(new Decimal(0));
      expect(result.line37).toEqual(new Decimal(95000));
      expect(result.totalOrdinaryIncome).toEqual(new Decimal(0));
      expect(result.totalCapitalGain).toEqual(new Decimal(100000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Related party: second disposition at $0
  // ═══════════════════════════════════════════════════════════

  describe("related party second disposition at zero", () => {
    it("Form 6252 Line 32 - related party sells for $0 produces zero acceleration", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "100000",
        isYearOfSale: false,
        paymentsReceived: "20000",
        relatedParty: { secondDispositionPrice: "0", exceptionApplies: false },
      }));
      // Line 32 = min(0, 200000) = 0
      // Line 34 = max(0, 0 - 20000) = 0
      expect(result.line34).toEqual(new Decimal(0));
      expect(result.line35).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Contract price of $1
  // ═══════════════════════════════════════════════════════════

  describe("minimal contract price", () => {
    it("Form 6252 Line 18 - contract price of $1 with $1 gain yields 100% GP%", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "1",
        costBasis: "0",
        isYearOfSale: true,
        paymentsReceived: "1",
      }));
      // GP = 1, CP = 1, GP% = 1.0
      // Line 24 = 1 × 1.0 = 1
      expect(result.line18).toEqual(new Decimal(1));
      expect(result.line19).toEqual(new Decimal(1));
      expect(result.line24).toEqual(new Decimal(1));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Remaining recapture tracking through Part III
  // ═══════════════════════════════════════════════════════════

  describe("remaining recapture after Part III", () => {
    it("Form 6252 remainingOrdinaryRecapture - decremented by both Part II and Part III recapture", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "80000",
        isYearOfSale: false,
        paymentsReceived: "20000",
        priorYearPayments: "0",
        remainingOrdinaryRecapture: "100000",
        relatedParty: { secondDispositionPrice: "200000", exceptionApplies: false },
      }));
      // GP = 120000, CP = 200000, GP% = 0.6
      // Line 24 = 20000 × 0.6 = 12000
      // Line 25 = min(100000, 12000) = 12000 (Part II recapture)
      // Remaining after Part II = 100000 - 12000 = 88000
      // Line 34 = max(0, 200000 - 20000) = 180000
      // Line 35 = round(180000 × 0.6) = 108000
      // Line 36 = min(88000, 108000) = 88000 (Part III recapture)
      // Final remaining = 88000 - 88000 = 0
      expect(result.line25).toEqual(new Decimal(12000));
      expect(result.line36).toEqual(new Decimal(88000));
      expect(result.remainingOrdinaryRecapture).toEqual(new Decimal(0));
      expect(result.totalOrdinaryIncome).toEqual(new Decimal(100000));
    });

    it("Form 6252 remainingOrdinaryRecapture - partially consumed leaves balance for future years", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "400000",
        costBasis: "200000",
        isYearOfSale: false,
        paymentsReceived: "10000",
        priorYearPayments: "350000",
        remainingOrdinaryRecapture: "50000",
        relatedParty: { secondDispositionPrice: "400000", exceptionApplies: false },
      }));
      // GP = 200000, CP = 400000, GP% = 0.5
      // Line 24 = 10000 × 0.5 = 5000
      // Line 25 = min(50000, 5000) = 5000
      // Remaining after Part II = 45000
      // Line 33 = 10000 + 350000 = 360000
      // Line 34 = max(0, 400000 - 360000) = 40000
      // Line 35 = round(40000 × 0.5) = 20000
      // Line 36 = min(45000, 20000) = 20000
      // Final remaining = 45000 - 20000 = 25000
      expect(result.line25).toEqual(new Decimal(5000));
      expect(result.line36).toEqual(new Decimal(20000));
      expect(result.remainingOrdinaryRecapture).toEqual(new Decimal(25000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Aggregation: single sale and all-ordinary income
  // ═══════════════════════════════════════════════════════════

  describe("aggregation edge cases", () => {
    it("Form 6252 aggregation - single sale returns identical totals", () => {
      const single = calculateForm6252(sale({
        sellingPrice: "150000",
        costBasis: "100000",
        isYearOfSale: true,
        paymentsReceived: "30000",
        gainCharacter: "long_term_capital",
      }));
      const agg = aggregateForm6252Results([single]);

      expect(agg.longTermCapitalGain).toEqual(single.totalCapitalGain);
      expect(agg.totalOrdinaryIncome).toEqual(single.totalOrdinaryIncome);
      expect(agg.shortTermCapitalGain).toEqual(new Decimal(0));
      expect(agg.section1231Gain).toEqual(new Decimal(0));
    });

    it("Form 6252 aggregation - recapture absorbing all income across multiple sales", () => {
      const sale1 = calculateForm6252(sale({
        sellingPrice: "100000",
        costBasis: "60000",
        isYearOfSale: false,
        paymentsReceived: "20000",
        remainingOrdinaryRecapture: "50000",
        gainCharacter: "long_term_capital",
      }));

      const sale2 = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "150000",
        isYearOfSale: false,
        paymentsReceived: "40000",
        remainingOrdinaryRecapture: "30000",
        gainCharacter: "section_1231",
      }));

      const agg = aggregateForm6252Results([sale1, sale2]);

      // Sale 1: GP = 40000, CP = 100000, GP% = 0.4
      // Income = 20000 × 0.4 = 8000, recapture = min(50000, 8000) = 8000, cap gain = 0
      expect(sale1.line25).toEqual(new Decimal(8000));
      expect(sale1.line26).toEqual(new Decimal(0));

      // Sale 2: GP = 50000, CP = 200000, GP% = 0.25
      // Income = 40000 × 0.25 = 10000, recapture = min(30000, 10000) = 10000, cap gain = 0
      expect(sale2.line25).toEqual(new Decimal(10000));
      expect(sale2.line26).toEqual(new Decimal(0));

      // All income is ordinary, zero capital gains
      expect(agg.totalOrdinaryIncome).toEqual(new Decimal(18000));
      expect(agg.longTermCapitalGain).toEqual(new Decimal(0));
      expect(agg.section1231Gain).toEqual(new Decimal(0));
    });

    it("Form 6252 aggregation - depreciation recapture totals from multiple year-of-sale properties", () => {
      const sale1 = calculateForm6252(sale({
        sellingPrice: "200000",
        costBasis: "120000",
        depreciation: "40000",
        depreciationRecapture: "40000",
        isYearOfSale: true,
        paymentsReceived: "50000",
        gainCharacter: "long_term_capital",
      }));

      const sale2 = calculateForm6252(sale({
        sellingPrice: "150000",
        costBasis: "90000",
        depreciation: "25000",
        depreciationRecapture: "25000",
        isYearOfSale: true,
        paymentsReceived: "30000",
        gainCharacter: "section_1231",
      }));

      const agg = aggregateForm6252Results([sale1, sale2]);

      // Total §1245/§1250 recapture (Line 12)
      expect(agg.totalDepreciationRecapture).toEqual(new Decimal(65000));
    });
  });
});
