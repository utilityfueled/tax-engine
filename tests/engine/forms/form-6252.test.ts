/**
 * Tests for Form 6252 — Installment Sale Income.
 * Spec: spec/federal/form-6252.yaml
 *
 * Covers: gross profit percentage, installment sale income, depreciation
 * recapture, excess liabilities, Section 121 exclusion, related party
 * acceleration, ordinary/capital gain split, aggregation, and edge cases.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm6252, aggregateForm6252Results } from "@/engine/forms/form-6252.js";
import type { Form6252Input } from "@/models/inputs.js";

function sale(overrides: Partial<Form6252Input> & Pick<Form6252Input, "sellingPrice" | "costBasis" | "isYearOfSale">): Form6252Input {
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

describe("Form 6252 Installment Sale Income", () => {
  // ═══════════════════════════════════════════════════════════
  // Part I: Gross Profit and Contract Price
  // ═══════════════════════════════════════════════════════════

  describe("Part I: Gross Profit and Contract Price", () => {
    it("Form 6252 Part I - selling price", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: true,
      }));
      expect(result.line5).toEqual(new Decimal(200000));
    });

    it("Form 6252 Part I - assumed liabilities", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: true,
        assumedLiabilities: "80000",
      }));
      expect(result.line6).toEqual(new Decimal(80000));
    });

    it("Form 6252 Part I - payment portion equals selling price minus assumed liabilities", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: true,
        assumedLiabilities: "80000",
      }));
      expect(result.line7).toEqual(new Decimal(120000));
    });

    it("Form 6252 Part I - adjusted basis is cost minus depreciation", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "150000", depreciation: "30000",
        isYearOfSale: true,
      }));
      expect(result.line10).toEqual(new Decimal(120000));
    });

    it("Form 6252 Part I - selling expenses", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", sellingExpenses: "12000",
        isYearOfSale: true,
      }));
      expect(result.line11).toEqual(new Decimal(12000));
    });

    it("Form 6252 Part I - depreciation recapture in year of sale", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "150000", depreciation: "30000",
        depreciationRecapture: "15000", isYearOfSale: true,
      }));
      // Recapture is added to basis (reduces gross profit spread over installments)
      expect(result.line12).toEqual(new Decimal(15000));
      // Basis = (150000-30000) + 0 + 15000 = 135000
      expect(result.line13).toEqual(new Decimal(135000));
    });

    it("Form 6252 Part I - installment sale basis combines adjusted basis, expenses, and recapture", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "300000", costBasis: "200000", depreciation: "40000",
        sellingExpenses: "18000", depreciationRecapture: "20000",
        isYearOfSale: true,
      }));
      // Adjusted basis: 200000 - 40000 = 160000
      // ISB: 160000 + 18000 + 20000 = 198000
      expect(result.line13).toEqual(new Decimal(198000));
    });

    it("Form 6252 Part I - gross gain before exclusion", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "300000", costBasis: "200000", isYearOfSale: true,
      }));
      // Gross gain = 300000 - 200000 = 100000
      expect(result.line14).toEqual(new Decimal(100000));
    });

    it("Form 6252 Part I - main home exclusion reduces gross profit", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "500000", costBasis: "200000", isYearOfSale: true,
        section121Exclusion: "250000",
      }));
      // Gross gain = 500000 - 200000 = 300000
      // Gross profit = 300000 - 250000 = 50000
      expect(result.line14).toEqual(new Decimal(300000));
      expect(result.line15).toEqual(new Decimal(250000));
      expect(result.line16).toEqual(new Decimal(50000));
    });

    it("Form 6252 Part I - exclusion capped at gross gain", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "300000", costBasis: "200000", isYearOfSale: true,
        section121Exclusion: "250000",
      }));
      // Gross gain = 100000, exclusion capped at 100000
      expect(result.line15).toEqual(new Decimal(100000));
      expect(result.line16).toEqual(new Decimal(0));
    });

    it("Form 6252 Part I - gross profit floored at zero", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "100000", costBasis: "100000", isYearOfSale: true,
      }));
      expect(result.line16).toEqual(new Decimal(0));
    });

    it("Form 6252 Part I - excess liabilities over basis", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "80000", isYearOfSale: true,
        assumedLiabilities: "120000",
      }));
      // ISB = 80000, assumed = 120000 → excess = 40000
      expect(result.line17).toEqual(new Decimal(40000));
    });

    it("Form 6252 Part I - no excess when liabilities under basis", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "150000", isYearOfSale: true,
        assumedLiabilities: "80000",
      }));
      // ISB = 150000, assumed = 80000 → excess = 0
      expect(result.line17).toEqual(new Decimal(0));
    });

    it("Form 6252 Part I - contract price includes excess liability", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "80000", isYearOfSale: true,
        assumedLiabilities: "120000",
      }));
      // Payment portion = 200000 - 120000 = 80000
      // Excess = 120000 - 80000 = 40000
      // Contract price = 80000 + 40000 = 120000
      expect(result.line18).toEqual(new Decimal(120000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Part II: Installment Sale Income
  // ═══════════════════════════════════════════════════════════

  describe("Part II: Installment Sale Income", () => {
    it("Form 6252 Part II - gross profit percentage for simple sale", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: true,
      }));
      // Gross profit = 100000, contract price = 200000 → 50%
      expect(result.line19).toEqual(new Decimal("0.5"));
    });

    it("Form 6252 Part II - gross profit percentage 100% when liabilities exceed basis", () => {
      // IRS Pub 537 example
      const result = calculateForm6252(sale({
        sellingPrice: "9000", costBasis: "5000", sellingExpenses: "600",
        assumedLiabilities: "6000", isYearOfSale: true,
      }));
      // Adjusted basis: 5000
      // ISB: 5000 + 600 = 5600
      // Gross profit: 9000 - 5600 = 3400 (wait, let me recalculate)
      // Actually: ISB = 5000 + 600 + 0 = 5600
      // Wait, cost minus depreciation = 5000, sellingExpenses = 600
      // line10 = 5000 - 0 = 5000
      // line13 = 5000 + 600 + 0 = 5600
      // line14 = 9000 - 5600 = 3400
      // line16 = 3400
      // line17 = max(0, 6000 - 5600) = 400
      // line7 = 9000 - 6000 = 3000
      // line18 = 3000 + 400 = 3400
      // GP% = 3400 / 3400 = 100%
      expect(result.line19).toEqual(new Decimal(1));
      expect(result.line16).toEqual(new Decimal(3400));
      expect(result.line18).toEqual(new Decimal(3400));
    });

    it("Form 6252 Part II - percentage is zero when contract price is zero", () => {
      // This happens if selling price equals assumed liabilities and basis is zero
      const result = calculateForm6252(sale({
        sellingPrice: "0", costBasis: "0", isYearOfSale: true,
      }));
      expect(result.line19).toEqual(new Decimal(0));
    });

    it("Form 6252 Part II - deemed payment from excess liabilities in year of sale", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "80000", isYearOfSale: true,
        assumedLiabilities: "120000", paymentsReceived: "10000",
      }));
      // Excess liabilities = 120000 - 80000 = 40000
      // Line 20 = 40000 (year of sale)
      expect(result.line20).toEqual(new Decimal(40000));
      // Total payments = 40000 + 10000 = 50000
      expect(result.line22).toEqual(new Decimal(50000));
    });

    it("Form 6252 Part II - no deemed payment in subsequent years", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "80000", isYearOfSale: false,
        assumedLiabilities: "120000", paymentsReceived: "10000",
      }));
      expect(result.line20).toEqual(new Decimal(0));
      expect(result.line22).toEqual(new Decimal(10000));
    });

    it("Form 6252 Part II - payments received", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "25000",
      }));
      expect(result.line21).toEqual(new Decimal(25000));
    });

    it("Form 6252 Part II - installment sale income is payments times GP%", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "40000",
      }));
      // GP% = 100000/200000 = 50%
      // Income = 40000 × 0.5 = 20000
      expect(result.line24).toEqual(new Decimal(20000));
    });

    it("Form 6252 Part II - installment sale income floored at zero", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "100000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "10000",
      }));
      // GP% = 0/100000 = 0 → income = 0
      expect(result.line24).toEqual(new Decimal(0));
    });

    it("Form 6252 Part II - year of sale with down payment and excess liabilities", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "80000", isYearOfSale: true,
        assumedLiabilities: "120000", paymentsReceived: "20000",
      }));
      // ISB: 80000
      // Excess: 120000 - 80000 = 40000
      // Contract price: (200000-120000) + 40000 = 120000
      // Gross profit: 200000 - 80000 = 120000
      // GP%: 120000/120000 = 100%
      // Total payments: 40000 + 20000 = 60000
      // Income: 60000 × 1.0 = 60000
      expect(result.line24).toEqual(new Decimal(60000));
    });

    it("Form 6252 Part II - section 1252/1254/1255 recapture recognized from payments", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "40000", remainingOrdinaryRecapture: "15000",
      }));
      // Income = 40000 × 50% = 20000
      // Recapture: min(15000, 20000) = 15000
      expect(result.line25).toEqual(new Decimal(15000));
      expect(result.line26).toEqual(new Decimal(5000));
      expect(result.remainingOrdinaryRecapture).toEqual(new Decimal(0));
    });

    it("Form 6252 Part II - recapture capped at installment income", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "10000", remainingOrdinaryRecapture: "50000",
      }));
      // Income = 10000 × 50% = 5000
      // Recapture: min(50000, 5000) = 5000
      expect(result.line25).toEqual(new Decimal(5000));
      expect(result.line26).toEqual(new Decimal(0));
      // Remaining: 50000 - 5000 = 45000
      expect(result.remainingOrdinaryRecapture).toEqual(new Decimal(45000));
    });

    it("Form 6252 Part II - capital gain is income minus ordinary recapture", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "40000", remainingOrdinaryRecapture: "0",
      }));
      // Income = 20000, no recapture → all capital gain
      expect(result.line25).toEqual(new Decimal(0));
      expect(result.line26).toEqual(new Decimal(20000));
    });

    it("Form 6252 Part II - prior year payments tracked cumulatively", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "25000", priorYearPayments: "50000",
      }));
      expect(result.line23).toEqual(new Decimal(50000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Part III: Related Party Installment Sale Income
  // ═══════════════════════════════════════════════════════════

  describe("Part III: Related Party", () => {
    it("Form 6252 Part III - related party selling price triggers acceleration", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "20000", priorYearPayments: "30000",
        relatedParty: { secondDispositionPrice: "180000" },
      }));
      // GP%: 50%
      // Contract price: 200000
      // Lesser: min(180000, 200000) = 180000
      // Total payments to date: 20000 + 30000 = 50000
      // Accelerated: 180000 - 50000 = 130000
      // Accelerated income: 130000 × 0.5 = 65000
      expect(result.line34).toEqual(new Decimal(130000));
      expect(result.line35).toEqual(new Decimal(65000));
    });

    it("Form 6252 Part III - acceleration capped at contract price", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "20000", priorYearPayments: "30000",
        relatedParty: { secondDispositionPrice: "500000" },
      }));
      // Lesser: min(500000, 200000) = 200000
      // Total payments: 50000
      // Accelerated: 200000 - 50000 = 150000
      expect(result.line34).toEqual(new Decimal(150000));
    });

    it("Form 6252 Part III - no acceleration when payments exceed lesser amount", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "50000", priorYearPayments: "160000",
        relatedParty: { secondDispositionPrice: "180000" },
      }));
      // Lesser: 180000
      // Total payments: 210000 > 180000 → accelerated = 0
      expect(result.line34).toEqual(new Decimal(0));
      expect(result.line35).toEqual(new Decimal(0));
    });

    it("Form 6252 Part III - exception prevents acceleration", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "20000", priorYearPayments: "30000",
        relatedParty: { secondDispositionPrice: "180000", exceptionApplies: true },
      }));
      // Exception → no Part III computation
      expect(result.line34).toEqual(new Decimal(0));
      expect(result.line35).toEqual(new Decimal(0));
    });

    it("Form 6252 Part III - accelerated income splits into ordinary and capital", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "0", priorYearPayments: "0",
        remainingOrdinaryRecapture: "30000",
        relatedParty: { secondDispositionPrice: "200000" },
      }));
      // GP%: 50%
      // Regular income: 0 (no payment)
      // Line 25: min(30000, 0) = 0
      // Remaining recapture after Part II: 30000
      // Accelerated: min(200000, 200000) - 0 = 200000
      // Accelerated income: 200000 × 50% = 100000
      // Line 36: min(30000, 100000) = 30000
      // Line 37: 100000 - 30000 = 70000
      expect(result.line36).toEqual(new Decimal(30000));
      expect(result.line37).toEqual(new Decimal(70000));
    });

    it("Form 6252 Part III - no related party produces zero acceleration", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "40000",
      }));
      expect(result.line34).toEqual(new Decimal(0));
      expect(result.line35).toEqual(new Decimal(0));
      expect(result.line36).toEqual(new Decimal(0));
      expect(result.line37).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Realistic Scenarios
  // ═══════════════════════════════════════════════════════════

  describe("Realistic Scenarios", () => {
    it("seller-financed real estate: year of sale with down payment", () => {
      // Sold rental property for $400K, buyer paid $80K down, carries $320K note
      const result = calculateForm6252(sale({
        sellingPrice: "400000", costBasis: "250000", depreciation: "50000",
        sellingExpenses: "24000", depreciationRecapture: "30000",
        isYearOfSale: true, paymentsReceived: "80000",
        gainCharacter: "section_1231",
      }));
      // Adjusted basis: 250000 - 50000 = 200000
      // ISB: 200000 + 24000 + 30000 = 254000
      // Gross gain: 400000 - 254000 = 146000
      // Gross profit: 146000
      // Contract price: 400000 (no assumed liabilities)
      // GP%: 146000/400000 = 0.365
      // Income: 80000 × 0.365 = 29200
      expect(result.line10).toEqual(new Decimal(200000));
      expect(result.line13).toEqual(new Decimal(254000));
      expect(result.line16).toEqual(new Decimal(146000));
      expect(result.line18).toEqual(new Decimal(400000));
      expect(result.line19).toEqual(new Decimal("0.365"));
      expect(result.line24).toEqual(new Decimal(29200));
      expect(result.gainCharacter).toBe("section_1231");
    });

    it("seller-financed real estate: subsequent year payments", () => {
      // Same property, year 2: received $40K in payments
      const result = calculateForm6252(sale({
        sellingPrice: "400000", costBasis: "250000", depreciation: "50000",
        sellingExpenses: "24000", depreciationRecapture: "30000",
        isYearOfSale: false, paymentsReceived: "40000", priorYearPayments: "80000",
        gainCharacter: "section_1231",
      }));
      // Same GP%: 0.365
      // Income: 40000 × 0.365 = 14600
      expect(result.line24).toEqual(new Decimal(14600));
      expect(result.line20).toEqual(new Decimal(0)); // Not year of sale
    });

    it("home sale with installment method and Section 121 exclusion", () => {
      // Sold home for $700K, cost $300K, $250K exclusion, buyer paying over 5 years
      const result = calculateForm6252(sale({
        sellingPrice: "700000", costBasis: "300000", isYearOfSale: true,
        section121Exclusion: "250000", paymentsReceived: "140000",
        gainCharacter: "long_term_capital",
      }));
      // Gross gain: 700000 - 300000 = 400000
      // Gross profit: 400000 - 250000 = 150000
      // Contract price: 700000
      // GP%: 150000/700000 ≈ 0.2142857...
      // Income: 140000 × 0.2142857 = 30000 (rounded)
      expect(result.line14).toEqual(new Decimal(400000));
      expect(result.line16).toEqual(new Decimal(150000));
      expect(result.line24).toEqual(new Decimal(30000));
    });

    it("vacant land sale with assumed mortgage exceeding basis", () => {
      // Sold land for $150K with $100K mortgage, basis only $60K
      const result = calculateForm6252(sale({
        sellingPrice: "150000", costBasis: "60000", isYearOfSale: true,
        assumedLiabilities: "100000", paymentsReceived: "10000",
      }));
      // ISB: 60000
      // Excess: 100000 - 60000 = 40000
      // Contract price: (150000-100000) + 40000 = 90000
      // Gross profit: 150000 - 60000 = 90000
      // GP%: 90000/90000 = 100%
      // Total payments: 40000 + 10000 = 50000
      // Income: 50000 × 1.0 = 50000
      expect(result.line17).toEqual(new Decimal(40000));
      expect(result.line18).toEqual(new Decimal(90000));
      expect(result.line19).toEqual(new Decimal(1));
      expect(result.line22).toEqual(new Decimal(50000));
      expect(result.line24).toEqual(new Decimal(50000));
    });

    it("related party resale triggers acceleration of remaining gain", () => {
      // Sold to child for $200K installment, child resold next year for $190K
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "10000", priorYearPayments: "40000",
        relatedParty: { secondDispositionPrice: "190000" },
      }));
      // GP%: 50%
      // Regular income: 10000 × 0.5 = 5000
      // Lesser: min(190000, 200000) = 190000
      // Total payments: 10000 + 40000 = 50000
      // Accelerated: 190000 - 50000 = 140000
      // Accelerated income: 140000 × 0.5 = 70000
      expect(result.line24).toEqual(new Decimal(5000));
      expect(result.line34).toEqual(new Decimal(140000));
      expect(result.line35).toEqual(new Decimal(70000));
      expect(result.totalCapitalGain).toEqual(new Decimal(75000));
    });

    it("multiple recapture types: §1245 in year of sale plus §1254 spread over installments", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "500000", costBasis: "300000", depreciation: "80000",
        sellingExpenses: "30000", depreciationRecapture: "50000",
        isYearOfSale: true, paymentsReceived: "100000",
        remainingOrdinaryRecapture: "20000",
        gainCharacter: "section_1231",
      }));
      // Adjusted basis: 300000 - 80000 = 220000
      // ISB: 220000 + 30000 + 50000 = 300000
      // Gross profit: 500000 - 300000 = 200000
      // Contract price: 500000
      // GP%: 200000/500000 = 0.4
      // Income: 100000 × 0.4 = 40000
      // §1254 recapture: min(20000, 40000) = 20000
      // Capital gain: 40000 - 20000 = 20000
      expect(result.line24).toEqual(new Decimal(40000));
      expect(result.line25).toEqual(new Decimal(20000));
      expect(result.line26).toEqual(new Decimal(20000));
      expect(result.remainingOrdinaryRecapture).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════

  describe("Edge Cases", () => {
    it("zero basis property produces 100% gross profit percentage", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "50000", costBasis: "0", isYearOfSale: true,
        paymentsReceived: "10000",
      }));
      expect(result.line19).toEqual(new Decimal(1));
      expect(result.line24).toEqual(new Decimal(10000));
    });

    it("no payment received in non-sale year produces zero income", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "0", priorYearPayments: "40000",
      }));
      expect(result.line24).toEqual(new Decimal(0));
    });

    it("very small gross profit percentage rounds correctly", () => {
      // Selling at a tiny markup
      const result = calculateForm6252(sale({
        sellingPrice: "100001", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "50000",
      }));
      // GP%: 1/100001 ≈ 0.00000999990
      // Income: 50000 × 0.00000999990 ≈ 0.4999... → rounds to 0
      expect(result.line19.toNumber()).toBeCloseTo(0.00001, 5);
      expect(result.line24).toEqual(new Decimal(0));
    });

    it("very small gross profit percentage with large payment produces income", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "100001", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "100001",
      }));
      // GP%: 1/100001
      // Income: 100001 × (1/100001) = 1
      expect(result.line24).toEqual(new Decimal(1));
    });

    it("full exclusion eliminates gross profit", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "400000", costBasis: "200000", isYearOfSale: true,
        section121Exclusion: "500000", paymentsReceived: "80000",
      }));
      // Gross gain: 200000, exclusion capped at 200000
      expect(result.line15).toEqual(new Decimal(200000));
      expect(result.line16).toEqual(new Decimal(0));
      expect(result.line19).toEqual(new Decimal(0));
      expect(result.line24).toEqual(new Decimal(0));
    });

    it("selling expenses exceeding gain reduce gross profit to zero", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "110000", costBasis: "100000", sellingExpenses: "15000",
        isYearOfSale: true, paymentsReceived: "20000",
      }));
      // ISB: 100000 + 15000 = 115000 > selling price 110000
      // Gross gain: 110000 - 115000 = -5000 → line16 floored at 0
      expect(result.line14).toEqual(new Decimal(-5000));
      expect(result.line16).toEqual(new Decimal(0));
      expect(result.line24).toEqual(new Decimal(0));
    });

    it("$1 payment near boundary", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "1",
      }));
      // GP%: 50%, income: 1 × 0.5 = 0.5 → rounds to 1
      expect(result.line24).toEqual(new Decimal(1));
    });

    it("large assumed liabilities with small equity", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "500000", costBasis: "100000", isYearOfSale: true,
        assumedLiabilities: "450000", paymentsReceived: "5000",
      }));
      // ISB: 100000
      // Excess: 450000 - 100000 = 350000
      // Contract price: 50000 + 350000 = 400000
      // Gross profit: 500000 - 100000 = 400000
      // GP%: 400000/400000 = 100%
      // Total payments: 350000 + 5000 = 355000
      // Income: 355000 × 1.0 = 355000
      expect(result.line17).toEqual(new Decimal(350000));
      expect(result.line19).toEqual(new Decimal(1));
      expect(result.line24).toEqual(new Decimal(355000));
    });

    it("multiple years of payments accumulate correctly", () => {
      // Year 3: prior years had $60K total, this year $30K
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "30000", priorYearPayments: "60000",
      }));
      // GP%: 50%
      // Income: 30000 × 0.5 = 15000
      expect(result.line24).toEqual(new Decimal(15000));
      expect(result.line23).toEqual(new Decimal(60000));
    });

    it("depreciation recapture reduces GP% through higher basis", () => {
      // Without recapture
      const noRecapture = calculateForm6252(sale({
        sellingPrice: "300000", costBasis: "200000", depreciation: "50000",
        isYearOfSale: true, paymentsReceived: "60000",
      }));
      // ISB: 150000, GP: 150000, CP: 300000, GP%: 50%
      // Income: 60000 × 50% = 30000

      // With recapture
      const withRecapture = calculateForm6252(sale({
        sellingPrice: "300000", costBasis: "200000", depreciation: "50000",
        depreciationRecapture: "30000",
        isYearOfSale: true, paymentsReceived: "60000",
      }));
      // ISB: 150000 + 30000 = 180000
      // GP: 300000 - 180000 = 120000
      // CP: 300000
      // GP%: 120000/300000 = 40%
      // Income: 60000 × 40% = 24000

      expect(noRecapture.line24).toEqual(new Decimal(30000));
      expect(withRecapture.line24).toEqual(new Decimal(24000));
      // The difference is because recapture was recognized separately in year of sale
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Aggregation
  // ═══════════════════════════════════════════════════════════

  describe("Aggregation", () => {
    it("aggregates multiple installment sales by gain character", () => {
      const sale1 = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "40000", gainCharacter: "long_term_capital",
      }));
      const sale2 = calculateForm6252(sale({
        sellingPrice: "100000", costBasis: "50000", isYearOfSale: false,
        paymentsReceived: "20000", gainCharacter: "short_term_capital",
      }));
      const sale3 = calculateForm6252(sale({
        sellingPrice: "300000", costBasis: "150000", isYearOfSale: false,
        paymentsReceived: "60000", gainCharacter: "section_1231",
      }));

      const agg = aggregateForm6252Results([sale1, sale2, sale3]);
      expect(agg.longTermCapitalGain).toEqual(new Decimal(20000));
      expect(agg.shortTermCapitalGain).toEqual(new Decimal(10000));
      expect(agg.section1231Gain).toEqual(new Decimal(30000));
    });

    it("aggregates ordinary income from recapture across sales", () => {
      const sale1 = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "40000", remainingOrdinaryRecapture: "10000",
      }));
      const sale2 = calculateForm6252(sale({
        sellingPrice: "100000", costBasis: "50000", isYearOfSale: false,
        paymentsReceived: "20000", remainingOrdinaryRecapture: "5000",
      }));

      const agg = aggregateForm6252Results([sale1, sale2]);
      expect(agg.totalOrdinaryIncome).toEqual(new Decimal(15000));
    });

    it("aggregates year-of-sale depreciation recapture", () => {
      const sale1 = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: true,
        depreciationRecapture: "25000", paymentsReceived: "40000",
      }));
      const sale2 = calculateForm6252(sale({
        sellingPrice: "150000", costBasis: "80000", isYearOfSale: true,
        depreciationRecapture: "15000", paymentsReceived: "30000",
      }));

      const agg = aggregateForm6252Results([sale1, sale2]);
      expect(agg.totalDepreciationRecapture).toEqual(new Decimal(40000));
    });

    it("empty array produces zeros", () => {
      const agg = aggregateForm6252Results([]);
      expect(agg.shortTermCapitalGain).toEqual(new Decimal(0));
      expect(agg.longTermCapitalGain).toEqual(new Decimal(0));
      expect(agg.section1231Gain).toEqual(new Decimal(0));
      expect(agg.totalOrdinaryIncome).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Audit Trail
  // ═══════════════════════════════════════════════════════════

  describe("Audit Trail", () => {
    it("audit lines cover all key form lines", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: true,
        paymentsReceived: "40000",
      }));
      const formLines = result.lines.filter(l => l.form === "Form 6252");
      const lineNumbers = formLines.map(l => l.line);
      // Part I
      expect(lineNumbers).toContain("5");
      expect(lineNumbers).toContain("6");
      expect(lineNumbers).toContain("7");
      expect(lineNumbers).toContain("10");
      expect(lineNumbers).toContain("13");
      expect(lineNumbers).toContain("16");
      expect(lineNumbers).toContain("18");
      // Part II
      expect(lineNumbers).toContain("19");
      expect(lineNumbers).toContain("24");
      expect(lineNumbers).toContain("25");
      expect(lineNumbers).toContain("26");
    });

    it("audit trail includes related party lines when applicable", () => {
      const result = calculateForm6252(sale({
        sellingPrice: "200000", costBasis: "100000", isYearOfSale: false,
        paymentsReceived: "20000", priorYearPayments: "30000",
        relatedParty: { secondDispositionPrice: "180000" },
      }));
      const lineNumbers = result.lines.filter(l => l.form === "Form 6252").map(l => l.line);
      expect(lineNumbers).toContain("30");
      expect(lineNumbers).toContain("34");
      expect(lineNumbers).toContain("35");
      expect(lineNumbers).toContain("37");
    });
  });
});
